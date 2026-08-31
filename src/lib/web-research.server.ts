import type { SupabaseClient } from "@supabase/supabase-js";
import { firecrawlEndpoint } from "./firecrawl-endpoint";
import { generateStructuredJson, litellmConfigured } from "./ai/structured.server";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type WebResearchResult = {
  objective: string;
  provider: "firecrawl";
  citations: number;
  scraped: number;
  entriesCreated: number;
  entriesSkipped: number;
  emptyResult: boolean;
};

type SearchAnswer = { answer: string; citations: string[] };

const MAX_SCRAPES = 3;
const SEARCH_LIMIT = 5;

const BRIEFING_SYSTEM =
  "You are a marketing research analyst. You are given search results — titles, URLs and snippets — for one research objective. Write a concise briefing using only what those results state. Never assert a number, claim or competitor the snippets do not contain. Where the results are thin, say so plainly rather than filling the gap.";

const BRIEFING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    briefing: {
      type: "string",
      description: "The evidence-grounded briefing, in plain prose.",
    },
  },
  required: ["briefing"],
} as const;

/**
 * Grounded search on the operator's own Firecrawl, synthesised through the
 * LiteLLM proxy.
 *
 * This was Perplexity: a second metered account whose only job was to search
 * and summarise. Firecrawl's `/v2/search` runs on the self-hosted box for
 * nothing, and the summary is a model call the proxy already routes, so the
 * per-question provider charge disappears entirely.
 *
 * The citations are the search result URLs rather than a model's own reference
 * list, which is the stronger claim of the two: every URL here is a page the
 * search actually returned, and the next step scrapes them.
 */
async function searchWeb(objective: string): Promise<SearchAnswer> {
  const endpoint = firecrawlEndpoint(process.env);
  if (!endpoint) {
    throw new Error(
      "No self-hosted Firecrawl is configured; set SELFHOSTED_FIRECRAWL_BASE_URL and SELFHOSTED_FIRECRAWL_API_KEY.",
    );
  }

  const response = await fetch(endpoint.searchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: objective, limit: SEARCH_LIMIT }),
  });
  if (!response.ok) {
    throw new Error(`Firecrawl search failed [${response.status}].`);
  }

  const parsed = JSON.parse(await response.text()) as {
    data?: { web?: SearchRow[] } | SearchRow[];
  };
  const rows = Array.isArray(parsed.data) ? parsed.data : (parsed.data?.web ?? []);
  const results = rows.filter((row): row is SearchRow => typeof row?.url === "string");
  const citations = results.map((row) => row.url);

  return { answer: await summarise(objective, results), citations };
}

type SearchRow = { url: string; title?: string; description?: string };

/**
 * The briefing.
 *
 * Falls back to the raw result list when no model route is configured. A
 * research pass that files the sources it found is worth more than one that
 * fails because a proxy is unset, and the sources are the evidence either way.
 */
async function summarise(objective: string, results: SearchRow[]): Promise<string> {
  const rendered = results
    .map(
      (row, index) =>
        `${index + 1}. ${row.title ?? row.url}\n   ${row.url}\n   ${row.description ?? ""}`,
    )
    .join("\n");
  if (results.length === 0) return "";
  if (!litellmConfigured(process.env)) return rendered;

  try {
    const parsed = (await generateStructuredJson({
      system: BRIEFING_SYSTEM,
      prompt: `Objective: ${objective}\n\nSearch results:\n${rendered}`,
      schemaName: "research_briefing",
      schema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
    })) as { briefing?: unknown };
    return typeof parsed.briefing === "string" && parsed.briefing.trim()
      ? parsed.briefing
      : rendered;
  } catch {
    // A failed summary must not lose the sources; they are the research.
    return rendered;
  }
}

/** Firecrawl scrape of one source. Returns markdown, or null when the page cannot be read. */
export async function scrapeFirecrawl(
  url: string,
): Promise<{ title: string; markdown: string } | null> {
  // Self-hosted only. The metered cloud fallback was removed on 2026-08-31:
  // research scrapes up to three sources per question, which was a steady
  // per-call charge against an API the operator also runs himself.
  const endpoint = firecrawlEndpoint(process.env);
  if (!endpoint)
    throw new Error(
      "No self-hosted Firecrawl is configured; set SELFHOSTED_FIRECRAWL_BASE_URL and SELFHOSTED_FIRECRAWL_API_KEY.",
    );
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });

  const body = await response.text();
  if (!response.ok) {
    return null;
  }

  const parsed = JSON.parse(body) as {
    markdown?: string;
    metadata?: { title?: string };
    data?: { markdown?: string; metadata?: { title?: string } };
  };
  const markdown = parsed.markdown ?? parsed.data?.markdown ?? "";
  if (!markdown) return null;
  return { title: parsed.metadata?.title ?? parsed.data?.metadata?.title ?? url, markdown };
}

/**
 * Real web research pass: self-hosted Firecrawl for both the grounded search
 * and the source pages, the briefing synthesised through the LiteLLM proxy,
 * results filed as immutable knowledge entries in kb.research.
 * Re-running on the same day for the same source is a no-op, so the node is
 * idempotent and a zero-result pass is still a successful run.
 */
export async function runWebResearch(client: Client): Promise<WebResearchResult> {
  const { data: agent } = await client
    .from("agents")
    .select("current_objective")
    .eq("key", "agent.research")
    .maybeSingle();

  const objective =
    agent?.current_objective?.trim() ||
    "Current competitive and demand landscape for residential moving companies in the TruMove service area";

  const { data: collection, error: collectionError } = await client
    .from("knowledge_collections")
    .select("id")
    .eq("key", "kb.research")
    .maybeSingle();
  if (collectionError) throw new Error(collectionError.message);
  if (!collection) throw new Error("Knowledge collection kb.research does not exist.");

  const search = await searchWeb(objective);
  const today = new Date().toISOString().slice(0, 10);
  const sources = search.citations.slice(0, MAX_SCRAPES);

  let scraped = 0;
  let entriesCreated = 0;
  let entriesSkipped = 0;

  const documents: { sourceRef: string; title: string; body: string; tags: string[] }[] = [
    {
      sourceRef: `firecrawl-search:${today}:${objective}`,
      title: `Research briefing — ${today}`,
      body: search.answer,
      tags: ["firecrawl-search", "briefing"],
    },
  ];

  for (const url of sources) {
    const page = await scrapeFirecrawl(url);
    if (!page) continue;
    scraped += 1;
    documents.push({
      sourceRef: `firecrawl:${today}:${url}`,
      title: page.title.slice(0, 200),
      body: page.markdown.slice(0, 20_000),
      tags: ["firecrawl", "source"],
    });
  }

  for (const document of documents) {
    if (!document.body) {
      entriesSkipped += 1;
      continue;
    }
    const { data: existing, error: existingError } = await client
      .from("knowledge_entries")
      .select("id")
      .eq("collection_id", collection.id)
      .eq("source_ref", document.sourceRef)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      entriesSkipped += 1;
      continue;
    }

    const { error: insertError } = await client.from("knowledge_entries").insert({
      tenant_id: await requireTenantId(client),
      collection_id: collection.id,
      title: document.title,
      body: document.body,
      source_ref: document.sourceRef,
      tags: document.tags,
      status: "active",
      metadata: { objective, collected_on: document.sourceRef.split(":")[1] } as never,
    });
    if (insertError) throw new Error(insertError.message);
    entriesCreated += 1;
  }

  return {
    objective,
    provider: "firecrawl",
    citations: search.citations.length,
    scraped,
    entriesCreated,
    entriesSkipped,
    emptyResult: entriesCreated === 0,
  };
}
