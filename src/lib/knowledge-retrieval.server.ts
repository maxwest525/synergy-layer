import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { requireTenantId } from "./tenant.server";
import { retrieveGovernedKnowledge } from "./knowledge/runtime.server";

type Client = SupabaseClient<Database>;

export const PROPOSAL_GUIDANCE_COLLECTIONS = [
  "kb.playbooks",
  "kb.best_practices",
  "kb.research",
] as const;

export type KnowledgeEntryForRanking = {
  id: string;
  collectionKey: string;
  title: string;
  body: string | null;
  sourceRef: string | null;
  tags: string[];
};

export type RetrievedKnowledgeEntry = KnowledgeEntryForRanking & {
  excerpt: string;
  score: number;
};

/**
 * Stated assumption: these collection weights, and the token weights below
 * (a title match 6, a tag match 4, a body match 1), are a chosen ordering,
 * not measured relevance. A playbook outranks a research note at equal
 * overlap because it is the more prescriptive document, and a title match
 * outranks a body match because a title is the author's own summary. What
 * would settle it: which retrieved chunks the drafting prompts actually cite,
 * once the outcome record links a chunk to a decision (AGT-15).
 */
const COLLECTION_WEIGHT: Record<string, number> = {
  "kb.playbooks": 3,
  "kb.best_practices": 2,
  "kb.research": 1,
};

function tokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((token) => token.length >= 3),
    ),
  ];
}

export function rankKnowledgeEntries(
  entries: KnowledgeEntryForRanking[],
  query: string,
  limit = 8,
): RetrievedKnowledgeEntry[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0 || limit <= 0) return [];

  return entries
    .map((entry) => {
      const titleTokens = new Set(tokens(entry.title));
      const bodyTokens = new Set(tokens(entry.body ?? ""));
      const tagTokens = new Set(entry.tags.flatMap(tokens));
      let relevance = 0;
      for (const token of queryTokens) {
        if (titleTokens.has(token)) relevance += 6;
        if (tagTokens.has(token)) relevance += 4;
        if (bodyTokens.has(token)) relevance += 1;
      }
      return {
        ...entry,
        excerpt: (entry.body ?? "").trim().slice(0, 1200),
        score: relevance + (relevance > 0 ? (COLLECTION_WEIGHT[entry.collectionKey] ?? 0) : 0),
        relevance,
      };
    })
    .filter((entry) => entry.relevance > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.collectionKey.localeCompare(right.collectionKey) ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, Math.min(limit, 12))
    .map(({ relevance: _relevance, ...entry }) => entry);
}

/**
 * Tenant-scoped, deterministic retrieval for proposal writing guidance.
 * Evidence remains live page + GSC + DataForSEO; these entries are not evidence.
 */
export async function retrieveKnowledgeGuidance(
  client: Client,
  query: string,
  options: { collectionKeys?: string[]; limit?: number } = {},
): Promise<RetrievedKnowledgeEntry[]> {
  const tenantId = await requireTenantId(client);
  const { data: governedVersions, error: governedVersionError } = await client
    .from("knowledge_source_versions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1);
  // Governed handbook chunks, when a version is active. These used to RETURN
  // here, and that early return silently deleted the other half of this
  // function: with 18 active versions, `knowledge_entries` was never read at
  // all, so every research entry an operator captured was invisible to the
  // agents that write proposals -- visible on /knowledge, unreachable by the
  // thing it exists to inform.
  //
  // Both are now gathered and ranked together. The handbook is doctrine and the
  // entries are what the operator has collected from outside; a proposal wants
  // whichever is more relevant to the page in hand, not whichever table the
  // function happened to reach first.
  const governedGuidance: RetrievedKnowledgeEntry[] =
    !governedVersionError && governedVersions?.length
      ? (await retrieveGovernedKnowledge(client, query, { limit: options.limit ?? 8 })).map(
          (chunk) => ({
            id: chunk.id,
            collectionKey: "kb.playbooks",
            title: `${chunk.sourceTitle}: ${chunk.title}`,
            body: chunk.body,
            sourceRef: `${chunk.sourceRef}#${chunk.contentSha256.slice(0, 12)}`,
            tags: [chunk.sourceKey, ...chunk.headingPath],
            excerpt: chunk.body.trim().slice(0, 1200),
            score: chunk.score,
          }),
        )
      : [];
  if (
    governedVersionError &&
    !/knowledge_source_versions|schema cache|does not exist/i.test(governedVersionError.message)
  ) {
    throw new Error(governedVersionError.message);
  }
  const collectionKeys = options.collectionKeys ?? [...PROPOSAL_GUIDANCE_COLLECTIONS];

  const { data: collections, error: collectionError } = await client
    .from("knowledge_collections")
    .select("id, key")
    .in("key", collectionKeys)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  if (collectionError) throw new Error(collectionError.message);

  const keyById = new Map((collections ?? []).map((collection) => [collection.id, collection.key]));
  const collectionIds = [...keyById.keys()];
  if (collectionIds.length === 0) return governedGuidance.slice(0, options.limit ?? 8);

  const { data: entries, error: entryError } = await client
    .from("knowledge_entries")
    .select("id, collection_id, title, body, source_ref, tags")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("collection_id", collectionIds)
    .limit(500);
  if (entryError) throw new Error(entryError.message);

  const ranked = rankKnowledgeEntries(
    (entries ?? []).flatMap((entry) => {
      const collectionKey = keyById.get(entry.collection_id);
      if (!collectionKey) return [];
      return [
        {
          id: entry.id,
          collectionKey,
          title: entry.title,
          body: entry.body,
          sourceRef: entry.source_ref,
          tags: entry.tags,
        },
      ];
    }),
    query,
    options.limit,
  );

  return mergeGuidance(governedGuidance, ranked, options.limit ?? 8);
}

/**
 * One ordered list from the two sources, highest score first.
 *
 * The two scores are not on one scale -- governed chunks are scored by the
 * runtime retriever, entries by token overlap here -- so this deliberately does
 * not pretend they are comparable beyond ordering. What it guarantees is that
 * neither source can crowd the other out entirely: each is granted at least a
 * third of the slots when it has something to offer, so a large handbook cannot
 * bury a single research entry that names the exact page being worked on.
 */
export function mergeGuidance(
  governed: RetrievedKnowledgeEntry[],
  entries: RetrievedKnowledgeEntry[],
  limit: number,
): RetrievedKnowledgeEntry[] {
  if (limit <= 0) return [];
  if (governed.length === 0) return entries.slice(0, limit);
  if (entries.length === 0) return governed.slice(0, limit);

  const floor = Math.max(1, Math.floor(limit / 3));
  const keptEntries = entries.slice(0, Math.max(floor, limit - governed.length));
  const keptGoverned = governed.slice(0, Math.max(floor, limit - keptEntries.length));

  return [...keptGoverned, ...keptEntries]
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit);
}
