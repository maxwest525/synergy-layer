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
  if (!governedVersionError && governedVersions?.length) {
    const governed = await retrieveGovernedKnowledge(client, query, { limit: options.limit ?? 8 });
    return governed.map((chunk) => ({
      id: chunk.id,
      collectionKey: "kb.playbooks",
      title: `${chunk.sourceTitle} — ${chunk.title}`,
      body: chunk.body,
      sourceRef: `${chunk.sourceRef}#${chunk.contentSha256.slice(0, 12)}`,
      tags: [chunk.sourceKey, ...chunk.headingPath],
      excerpt: chunk.body.trim().slice(0, 1200),
      score: chunk.score,
    }));
  }
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
  if (collectionIds.length === 0) return [];

  const { data: entries, error: entryError } = await client
    .from("knowledge_entries")
    .select("id, collection_id, title, body, source_ref, tags")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("collection_id", collectionIds)
    .limit(500);
  if (entryError) throw new Error(entryError.message);

  return rankKnowledgeEntries(
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
}
