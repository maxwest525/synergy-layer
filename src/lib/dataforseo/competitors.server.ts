import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Competitors are derived from what actually ranks in the SERPs AOOS observes,
 * not from keyword-set intersection. Intersection-based discovery treats any
 * domain that shares a couple of ranked keywords as a rival, which is why it
 * returns social networks and directories for a domain with a thin footprint.
 *
 * A domain earns "competitor" only by repeatedly appearing in the organic
 * results for keywords an operator approved.
 */
export const COMPETITOR_CONFIG = {
  /** How far back stored SERP evidence is read. */
  lookbackDays: 30,
  /** Appearances across distinct approved keywords before a domain counts. */
  minKeywordAppearances: 2,
  /** Organic depth considered. Beyond this, presence is not competitive. */
  maxRankConsidered: 20,
};

/**
 * Domains that rank for almost everything. They are real search surfaces worth
 * knowing about, but they are not businesses competing for the same customer,
 * so they are classified separately and never presented as competitors.
 */
const SURFACE_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
  "wikipedia.org",
  "nextdoor.com",
  "craigslist.org",
  "yelp.com",
  "mapquest.com",
  "thumbtack.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "porch.com",
  "bark.com",
  "houzz.com",
  "bbb.org",
  "trustpilot.com",
  "sitejabber.com",
  "birdeye.com",
  "expertise.com",
  "yellowpages.com",
  "superpages.com",
  "manta.com",
  "alignable.com",
  "chamberofcommerce.com",
  "dnb.com",
  "indeed.com",
  "glassdoor.com",
  "zillow.com",
  "realtor.com",
  "apartments.com",
  "google.com",
  "moving.com",
  "movers.com",
  "unpakt.com",
  "hireahelper.com",
  "updater.com",
  "uhaul.com",
  "move.org",
  "movebuddha.com",
  "mymovingreviews.com",
]);

function normaliseDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function classify(domain: string): "competitor" | "surface" {
  if (SURFACE_DOMAINS.has(domain)) return "surface";
  if (/\.(gov|edu|mil)$/.test(domain)) return "surface";
  return "competitor";
}

type Aggregate = {
  domain: string;
  keywords: Set<string>;
  bestPosition: number;
  positions: number[];
  urls: Set<string>;
};

/**
 * Reads stored SERP snapshots and rebuilds the competitor set from them.
 * This costs nothing: it never calls the provider, only re-reads evidence.
 */
export async function deriveCompetitorsFromSerp(
  client: Client,
  tenantId: string,
  ownDomain: string,
): Promise<{
  keywordsAnalysed: number;
  domainsSeen: number;
  competitors: number;
  surfaces: number;
  belowSignificanceThreshold: number;
  retainedAsEvidence: number;
}> {
  const own = normaliseDomain(ownDomain);
  const cutoff = new Date(Date.now() - COMPETITOR_CONFIG.lookbackDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: snapshots, error } = await client
    .from("dataforseo_snapshots")
    .select("id, target, payload, reporting_date")
    .eq("tenant_id", tenantId)
    .eq("kind", "serp_organic")
    .gte("reporting_date", cutoff)
    .order("reporting_date", { ascending: false });
  if (error) throw new Error(error.message);

  const aggregates = new Map<string, Aggregate>();
  const keywords = new Set<string>();
  let latestSnapshotId: string | null = null;

  for (const snapshot of snapshots ?? []) {
    latestSnapshotId ??= snapshot.id;
    const keyword = snapshot.target;
    keywords.add(keyword);

    const rows = ((snapshot.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? []);
    const seenInThisSerp = new Set<string>();

    for (const row of rows) {
      if (row["type"] !== "organic") continue;
      const rank = Number(row["rank_group"] ?? row["rank_absolute"] ?? 0);
      if (!rank || rank > COMPETITOR_CONFIG.maxRankConsidered) continue;

      const domain = normaliseDomain(String(row["domain"] ?? ""));
      if (!domain || domain === own) continue;
      // One credit per domain per SERP: a domain holding three slots for one
      // keyword is not three pieces of evidence.
      if (seenInThisSerp.has(domain)) continue;
      seenInThisSerp.add(domain);

      const entry = aggregates.get(domain) ?? {
        domain,
        keywords: new Set<string>(),
        bestPosition: rank,
        positions: [],
        urls: new Set<string>(),
      };
      entry.keywords.add(keyword);
      entry.positions.push(rank);
      entry.bestPosition = Math.min(entry.bestPosition, rank);
      const url = row["url"];
      if (typeof url === "string") entry.urls.add(url);
      aggregates.set(domain, entry);
    }
  }

  let competitors = 0;
  let surfaces = 0;
  let skipped = 0;

  // Every observed ranking domain is kept as evidence. The threshold decides
  // whether a domain is competitively significant, never whether it exists:
  // publishers, directories and platforms still compete for organic space.
  for (const entry of aggregates.values()) {
    const meetsThreshold = entry.keywords.size >= COMPETITOR_CONFIG.minKeywordAppearances;
    if (!meetsThreshold) skipped += 1;

    const domainClass = classify(entry.domain);
    if (meetsThreshold) {
      if (domainClass === "competitor") competitors += 1;
      else surfaces += 1;
    }

    const averagePosition =
      entry.positions.reduce((total, value) => total + value, 0) / entry.positions.length;

    await client.from("competitor_candidates").upsert(
      {
        tenant_id: tenantId,
        seed_domain: own,
        domain: entry.domain,
        source: "serp.derived",
        domain_class: domainClass,
        snapshot_id: latestSnapshotId,
        metrics: {
          keyword_appearances: entry.keywords.size,
          keywords: [...entry.keywords].slice(0, 25),
          best_position: entry.bestPosition,
          avg_position: Number(averagePosition.toFixed(2)),
          sample_urls: [...entry.urls].slice(0, 5),
          lookback_days: COMPETITOR_CONFIG.lookbackDays,
          meets_significance_threshold: meetsThreshold,
          significance_threshold_keywords: COMPETITOR_CONFIG.minKeywordAppearances,
          derived_from: "observed_serp_results",
          estimated: false,
        } as never,
      },
      { onConflict: "tenant_id,seed_domain,domain,source", ignoreDuplicates: false },
    );
  }

  return {
    keywordsAnalysed: keywords.size,
    domainsSeen: aggregates.size,
    competitors,
    surfaces,
    belowSignificanceThreshold: skipped,
    retainedAsEvidence: aggregates.size,
  };
}
