import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type WebResearchResult = {
  objective: string;
  provider: "perplexity";
  citations: number;
  scraped: number;
  entriesCreated: number;
  entriesSkipped: number;
  emptyResult: boolean;
};

type PerplexityAnswer = { answer: string; citations: string[] };

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const MAX_SCRAPES = 3;

function requireKey(name: "PERPLEXITY_API_KEY" | "FIRECRAWL_API_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured for this project.`);
  return value;
}

/** Grounded search through Perplexity. Returns the answer plus source URLs. */
async function searchPerplexity(objective: string): Promise<PerplexityAnswer> {
  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey("PERPLEXITY_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "You are a marketing research analyst. Answer with verifiable facts only and cite sources. Be concise.",
        },
        { role: "user", content: objective },
      ],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    if (response.status === 401 && body.includes("insufficient_quota")) {
      throw new Error(
        "Perplexity API credits are exhausted. Buy API credits at https://console.perplexity.ai for the connected account.",
      );
    }
    throw new Error(`Perplexity request failed [${response.status}]: ${body}`);
  }

  const parsed = JSON.parse(body) as {
    choices?: { message?: { content?: string } }[];
    citations?: string[];
  };
  return {
    answer: parsed.choices?.[0]?.message?.content ?? "",
    citations: (parsed.citations ?? []).filter((url) => typeof url === "string"),
  };
}

/** Firecrawl scrape of one source. Returns markdown, or null when the page cannot be read. */
export async function scrapeFirecrawl(
  url: string,
): Promise<{ title: string; markdown: string } | null> {
  const response = await fetch(FIRECRAWL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireKey("FIRECRAWL_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });

  const body = await response.text();
  if (!response.ok) {
    if (response.status === 402) {
      throw new Error("Firecrawl credits are exhausted for the connected account.");
    }
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
 * Real web research pass: Perplexity for grounded search, Firecrawl for the
 * source pages, results filed as immutable knowledge entries in kb.research.
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

  const search = await searchPerplexity(objective);
  const today = new Date().toISOString().slice(0, 10);
  const sources = search.citations.slice(0, MAX_SCRAPES);

  let scraped = 0;
  let entriesCreated = 0;
  let entriesSkipped = 0;

  const documents: { sourceRef: string; title: string; body: string; tags: string[] }[] = [
    {
      sourceRef: `perplexity:${today}:${objective}`,
      title: `Research briefing — ${today}`,
      body: search.answer,
      tags: ["perplexity", "briefing"],
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
    provider: "perplexity",
    citations: search.citations.length,
    scraped,
    entriesCreated,
    entriesSkipped,
    emptyResult: entriesCreated === 0,
  };
}
