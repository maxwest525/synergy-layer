import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { rankByVolume } from "./keyword-ranking";
import { KEYWORD_CONFIG } from "./keywords.server";
import { LABS_CONFIG, labsCall } from "./labs.server";

type Client = SupabaseClient<Database>;

/**
 * The competitor keyword gap: searches a tracked competitor ranks for and the
 * owned property does not.
 *
 * Metered, so it runs only from an explicit operator click with the estimate on
 * the button — one Labs task per tracked competitor. Its results are filed as
 * pending keyword candidates and go through `decideKeywordCandidates` like
 * every other candidate. Nothing here tracks a keyword.
 *
 * `competitors_domain` is deliberately not used: the registry retired
 * intersection-based *discovery* because it returns directories and social
 * networks for a thin-footprint site. This is different — the competitor list
 * is the operator's own approved one, and the intersection is only used to
 * compare two named domains.
 *
 * Stated assumption: the `domain_intersection` response shape below
 * (first_domain_serp_element / second_domain_serp_element /
 * keyword_data.keyword_info) comes from DataForSEO's docs, not a stored
 * snapshot — no live call has been captured yet. Parsing is defensive on
 * purpose: a missing or renamed field skips that item and adds to the
 * `unparsed` tally the operator sees in the run summary, rather than crashing
 * or silently reporting zero. Diff the first real snapshot against this
 * assumption and update both together before trusting the numbers.
 */

/** One task per competitor, at the repo's own Labs task estimate. */
export function estimatedGapCostUsd(competitorCount: number): number {
  return Number((competitorCount * LABS_CONFIG.estimatedUsdPerTask).toFixed(2));
}

export type GapCandidate = {
  readonly keyword: string;
  readonly competitor: string;
  readonly searchVolume: number | null;
  readonly cpc: number | null;
  readonly competition: number | null;
  readonly competitorPosition: number | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Whether an item has the top-level shape this module assumes. An item that
 * fails this is not a "no gap here" result — it means the provider's response
 * doesn't match the fixture this parser was written against, and the item is
 * skipped rather than guessed at.
 */
function isWellFormed(item: Record<string, unknown>): boolean {
  if (!("keyword_data" in item) || !("second_domain_serp_element" in item)) return false;
  const data = item["keyword_data"];
  if (typeof data !== "object" || data === null) return false;
  return "keyword" in (data as Record<string, unknown>);
}

/** Count of items whose shape didn't match the assumed response — see the module note above. */
export function countUnparsedGapItems(items: readonly Record<string, unknown>[]): number {
  return items.filter((item) => !isWellFormed(item)).length;
}

/** The gap rows worth an operator's attention, from one intersection payload. */
export function selectGapKeywords(
  items: readonly Record<string, unknown>[],
  competitor: string,
  _ownDomain: string,
): GapCandidate[] {
  const found: GapCandidate[] = [];

  for (const item of items) {
    if (!isWellFormed(item)) continue;

    // first_domain is the owned target in the request below; a present element
    // means the owned domain already ranks, so there is no gap to report.
    if (item["first_domain_serp_element"]) continue;

    const data = item["keyword_data"] as Record<string, unknown>;
    const info = (data["keyword_info"] ?? {}) as Record<string, unknown>;
    const keyword = String(data["keyword"] ?? "")
      .trim()
      .toLowerCase();
    const searchVolume = num(info["search_volume"]);
    if (!keyword || searchVolume === null) continue;

    const theirs = (item["second_domain_serp_element"] ?? {}) as Record<string, unknown>;
    found.push({
      keyword,
      competitor,
      searchVolume,
      cpc: num(info["cpc"]),
      competition: num(info["competition"]),
      competitorPosition: num(theirs["rank_group"]),
    });
  }

  return found;
}

/** The operator's own approved competitor list. Never a derived shortlist. */
async function readTrackedCompetitors(client: Client, tenantId: string): Promise<string[]> {
  const { data, error } = await client
    .from("tracked_competitors")
    .select("domain")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.domain);
}

async function snapshotRows(
  client: Client,
  snapshotId: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await client
    .from("dataforseo_snapshots")
    .select("payload")
    .eq("id", snapshotId)
    .single();
  return (data?.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [];
}

export async function runKeywordGap(
  client: Client,
  tenantId: string,
  ownDomain: string,
): Promise<{
  competitors: number;
  filed: number;
  costUsd: number;
  unparsed: number;
  /** Gap keywords the per-run cap left for a later run, summed across competitors. */
  beyondCap: number;
}> {
  const competitors = await readTrackedCompetitors(client, tenantId);
  if (competitors.length === 0) {
    throw new Error(
      "No approved competitors to compare against. Approve at least one on the competitors page first: AOOS will not pick a rival for you.",
    );
  }

  const { data: existing } = await client
    .from("keyword_candidates")
    .select("keyword")
    .eq("tenant_id", tenantId);
  const { data: tracked } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId);
  const known = new Set([
    ...(existing ?? []).map((row) => row.keyword.toLowerCase()),
    ...(tracked ?? []).map((row) => row.keyword.toLowerCase()),
  ]);

  let filed = 0;
  let costUsd = 0;
  let unparsed = 0;
  let beyondCap = 0;

  for (const competitor of competitors) {
    const call = await labsCall(
      client,
      tenantId,
      "/dataforseo_labs/google/domain_intersection/live",
      "labs_domain_intersection",
      `${ownDomain} vs ${competitor}`,
      {
        target1: ownDomain,
        target2: competitor,
        intersections: false,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        limit: KEYWORD_CONFIG.suggestionLimit,
      },
    );
    costUsd += call.costUsd;

    const rows = await snapshotRows(client, call.snapshotId);
    unparsed += countUnparsedGapItems(rows);

    // Nothing is filtered on volume (CONTENT-1); the cap is one run's filing
    // per competitor, and what it leaves is counted.
    const ranking = rankByVolume(
      selectGapKeywords(rows, competitor, ownDomain).filter((gap) => !known.has(gap.keyword)),
      KEYWORD_CONFIG.maxCandidatesPerRun,
    );
    const gaps = ranking.filed;
    beyondCap += ranking.beyondCap;

    for (const gap of gaps) {
      const { error } = await client.from("keyword_candidates").upsert(
        {
          tenant_id: tenantId,
          keyword: gap.keyword,
          source: "labs.domain_intersection",
          seed: competitor,
          location_code: KEYWORD_CONFIG.locationCode,
          language_code: KEYWORD_CONFIG.languageCode,
          snapshot_id: call.snapshotId,
          metrics: {
            search_volume: gap.searchVolume,
            cpc: gap.cpc,
            competition: gap.competition,
            competitor: gap.competitor,
            competitor_position: gap.competitorPosition,
            estimated: true,
          } as never,
        },
        { onConflict: "tenant_id,keyword,location_code,language_code", ignoreDuplicates: true },
      );
      if (!error) {
        filed += 1;
        known.add(gap.keyword);
      }
    }
  }

  return { competitors: competitors.length, filed, costUsd, unparsed, beyondCap };
}
