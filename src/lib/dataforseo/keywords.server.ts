import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem } from "../os.server";
import { labsCall } from "./labs.server";

type Client = SupabaseClient<Database>;

/**
 * Keyword selection is operator-owned. Labs proposes, a human approves, and
 * only approved keywords ever reach the SERP queue. Nothing in this module is
 * allowed to invent a keyword: if there is no real seed and no real
 * suggestion, the pass fails loudly rather than guessing.
 */
export const KEYWORD_CONFIG = {
  locationCode: 2840, // United States
  languageCode: "en",
  /** Seeds taken from the property's own Search Console queries. */
  maxSeeds: 3,
  /** Provider-side row cap per call. */
  suggestionLimit: 100,
  /** Candidates below this monthly volume are not worth an operator's time. */
  minSearchVolume: 10,
  /** Hard cap on how many candidates one pass may file for review. */
  maxCandidatesPerRun: 40,
};

type CandidateRow = {
  keyword: string;
  source: string;
  seed: string | null;
  snapshotId: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
};

function readKeywordInfo(item: Record<string, unknown>): {
  volume: number | null;
  cpc: number | null;
  competition: number | null;
} {
  const info = (item["keyword_info"] ?? {}) as Record<string, unknown>;
  const volume = info["search_volume"];
  const cpc = info["cpc"];
  const competition = info["competition"];
  return {
    volume: typeof volume === "number" ? volume : null,
    cpc: typeof cpc === "number" ? cpc : null,
    competition: typeof competition === "number" ? competition : null,
  };
}

/** Real Search Console queries are the only non-fabricated seed source. */
async function readSeedQueries(client: Client, tenantId: string): Promise<string[]> {
  const { data } = await client
    .from("search_console_snapshots")
    .select("payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "query")
    .order("period_end_pt", { ascending: false })
    .limit(3);

  const seen = new Set<string>();
  for (const snapshot of data ?? []) {
    const rows = ((snapshot.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? []);
    for (const row of rows) {
      const keys = row["keys"] as string[] | undefined;
      const keyword = String(keys?.[0] ?? row["query"] ?? "").trim();
      if (keyword) seen.add(keyword);
      if (seen.size >= KEYWORD_CONFIG.maxSeeds) break;
    }
    if (seen.size >= KEYWORD_CONFIG.maxSeeds) break;
  }
  return [...seen];
}

async function snapshotRows(client: Client, snapshotId: string): Promise<Record<string, unknown>[]> {
  const { data } = await client
    .from("dataforseo_snapshots")
    .select("payload")
    .eq("id", snapshotId)
    .single();
  return ((data?.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? []);
}

/**
 * Proposes a keyword set for the owned domain and files it for approval.
 * Two evidence sources, both real: what the provider already associates with
 * the domain, and expansions of the property's own Search Console queries.
 */
export async function suggestKeywords(
  client: Client,
  tenantId: string,
  domain: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<{
  proposed: number;
  filed: number;
  alreadyKnown: number;
  seeds: string[];
  costUsd: number;
}> {
  const candidates = new Map<string, CandidateRow>();
  let costUsd = 0;

  const forSite = await labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/keywords_for_site/live",
    "labs_keywords_for_site",
    domain,
    {
      target: domain,
      location_code: KEYWORD_CONFIG.locationCode,
      language_code: KEYWORD_CONFIG.languageCode,
      limit: KEYWORD_CONFIG.suggestionLimit,
      include_serp_info: false,
    },
    workflow,
  );
  costUsd += forSite.costUsd;

  for (const item of await snapshotRows(client, forSite.snapshotId)) {
    const keyword = String(item["keyword"] ?? "").trim().toLowerCase();
    if (!keyword) continue;
    const info = readKeywordInfo(item);
    candidates.set(keyword, {
      keyword,
      source: "labs.keywords_for_site",
      seed: null,
      snapshotId: forSite.snapshotId,
      searchVolume: info.volume,
      cpc: info.cpc,
      competition: info.competition,
    });
  }

  const seeds = await readSeedQueries(client, tenantId);
  for (const seed of seeds) {
    const suggestion = await labsCall(
      client,
      tenantId,
      "/dataforseo_labs/google/keyword_suggestions/live",
      "labs_keyword_suggestions",
      seed,
      {
        keyword: seed,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        limit: KEYWORD_CONFIG.suggestionLimit,
        include_serp_info: false,
      },
      workflow,
    );
    costUsd += suggestion.costUsd;

    for (const item of await snapshotRows(client, suggestion.snapshotId)) {
      const keyword = String(item["keyword"] ?? "").trim().toLowerCase();
      if (!keyword || candidates.has(keyword)) continue;
      const info = readKeywordInfo(item);
      candidates.set(keyword, {
        keyword,
        source: "labs.keyword_suggestions",
        seed,
        snapshotId: suggestion.snapshotId,
        searchVolume: info.volume,
        cpc: info.cpc,
        competition: info.competition,
      });
    }
  }

  const ranked = [...candidates.values()]
    .filter((entry) => (entry.searchVolume ?? 0) >= KEYWORD_CONFIG.minSearchVolume)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, KEYWORD_CONFIG.maxCandidatesPerRun);

  if (ranked.length === 0) {
    throw new Error(
      "DataForSEO returned no keyword suggestions above the volume floor for this domain. Approve at least one seed keyword manually before SERP observation can run: AOOS will not invent one.",
    );
  }

  const { data: tracked } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId);
  const known = new Set((tracked ?? []).map((row) => row.keyword.toLowerCase()));

  let filed = 0;
  let alreadyKnown = 0;
  for (const entry of ranked) {
    if (known.has(entry.keyword)) {
      alreadyKnown += 1;
      continue;
    }
    const { error } = await client.from("keyword_candidates").upsert(
      {
        tenant_id: tenantId,
        keyword: entry.keyword,
        source: entry.source,
        seed: entry.seed,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        snapshot_id: entry.snapshotId,
        metrics: {
          search_volume: entry.searchVolume,
          cpc: entry.cpc,
          competition: entry.competition,
          estimated: true,
        } as never,
      },
      {
        onConflict: "tenant_id,keyword,location_code,language_code",
        ignoreDuplicates: true,
      },
    );
    if (!error) filed += 1;
  }

  if (filed > 0) {
    await fileInboxItem(client, {
      tenantId,
      lane: "pending_approval",
      sourceModule: "dataforseo",
      title: `${filed} keyword candidates need approval`,
      summary: `DataForSEO Labs proposed ${filed} keywords for ${domain}. SERP observation stays idle until at least one is approved.`,
      priority: 2,
      actions: [{ kind: "open" }],
    });
  }

  return { proposed: ranked.length, filed, alreadyKnown, seeds, costUsd };
}

/** Promotes reviewed candidates into the approved set that SERP observes. */
export async function approveKeywords(
  client: Client,
  tenantId: string,
  keywords: string[],
  approvedBy?: string | null,
): Promise<{ approved: number }> {
  const now = new Date().toISOString();
  let approved = 0;

  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase();
    if (!keyword) continue;

    const { data: candidate } = await client
      .from("keyword_candidates")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("keyword", keyword)
      .maybeSingle();

    const { error } = await client.from("tracked_keywords").upsert(
      {
        tenant_id: tenantId,
        keyword,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        candidate_id: candidate?.id ?? null,
        approved_by: approvedBy ?? null,
        active: true,
      },
      {
        onConflict: "tenant_id,keyword,location_code,language_code",
        ignoreDuplicates: true,
      },
    );
    if (error) continue;
    approved += 1;

    if (candidate) {
      await client
        .from("keyword_candidates")
        .update({ review_state: "approved", reviewed_by: approvedBy ?? null, reviewed_at: now })
        .eq("id", candidate.id);
    }
  }

  return { approved };
}

/** Marks candidates as rejected so a later pass does not re-file them. */
export async function rejectKeywords(
  client: Client,
  tenantId: string,
  keywords: string[],
  reviewedBy?: string | null,
): Promise<{ rejected: number }> {
  const normalised = keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);
  if (normalised.length === 0) return { rejected: 0 };

  const { data, error } = await client
    .from("keyword_candidates")
    .update({
      review_state: "rejected",
      reviewed_by: reviewedBy ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .in("keyword", normalised)
    .select("id");

  if (error) throw new Error(error.message);
  return { rejected: (data ?? []).length };
}

/** The approved keyword set. SERP observation reads this and nothing else. */
export async function getTrackedKeywords(client: Client, tenantId: string): Promise<string[]> {
  const { data, error } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("keyword");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.keyword);
}
