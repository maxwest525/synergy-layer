import type { Database } from "@/integrations/supabase/types";
import { confidenceInCount } from "./confidence";

/**
 * Pure rule checks over already-stored Search Console and page-audit data.
 * Kept out of the .server module so they test without mocks, matching
 * page-checks.ts and site-checks.ts. Nothing here reads a network or a
 * database; the .server caller supplies rows and persists results.
 *
 * Every rule below is assigned to a volume-honesty bucket in RULE_ASSIGNMENTS
 * (fact / pooled / beyond_current_volume) per
 * docs/handoffs/2026-08-20-rule-thresholds-audit.md.
 */

export type CheckRule =
  "possible_query_overlap" | "zero_impression_page" | "query_coverage_gap" | "index_coverage_drift";

/**
 * How much of the property's traffic a rule needs before its answer is
 * trustworthy, and why. Not enforcement — the thresholds themselves are
 * unchanged — this is the "every rule is assigned, with the reasoning
 * written down" line of the handoff's definition of done, made executable
 * (see rule-buckets.test.ts).
 */
export type RuleBucket = "fact" | "pooled" | "beyond_current_volume";

export type RuleAssignment = {
  readonly rule: string;
  readonly bucket: RuleBucket;
  /** The per-target evidence a beyond_current_volume rule would need to answer honestly; null elsewhere. */
  readonly needsPerTarget: number | null;
  readonly why: string;
};

/**
 * Every finding rule across the three Search Console/SEO families plus GA4,
 * bucketed per docs/handoffs/2026-08-20-rule-thresholds-audit.md §1:
 *
 * - fact: answerable at any volume (indexation, sitemap/robots states, an
 *   event that stopped arriving). No threshold needed.
 * - pooled: click/impression-shaped questions answered across the whole
 *   property rather than per page, where twelve pages together carry twelve
 *   times the per-page evidence.
 * - beyond_current_volume: query-dimension rules. At this property's volume
 *   the query table is mostly anonymized away (see QUERY_DIMENSION_CAVEAT),
 *   and pooling across pages does not recover a censored query. The existing
 *   threshold is kept as `needsPerTarget` so the UI can say what volume would
 *   change the answer; it is not changed.
 */
export const RULE_ASSIGNMENTS: readonly RuleAssignment[] = [
  {
    rule: "zero_impression_page",
    bucket: "fact",
    needsPerTarget: null,
    why: 'Whether a page ever appeared is read directly from the performance snapshot, not inferred from a count. "Google doesn\'t guarantee that all pages everywhere will make it into the Google index" (support.google.com/webmasters/answer/7440203), so absence itself is the fact worth reporting.',
  },
  {
    rule: "index_coverage_drift",
    bucket: "fact",
    needsPerTarget: null,
    why: "URL Inspection states (verdict, canonical, last crawl) are read directly from Google, not derived from a sample. No threshold answers 'is this page indexed' more honestly than asking Google.",
  },
  {
    rule: "zero_click_page",
    bucket: "pooled",
    needsPerTarget: null,
    why: "Zero clicks on one page needs 5-20x this property's per-page volume to mean anything alone; the click-shaped question is answered honestly only pooled across the site (see site_clicks_shift).",
  },
  {
    rule: "high_impression_low_ctr",
    bucket: "pooled",
    needsPerTarget: null,
    why: "Click-through rate on a single page is the textbook case: a page at this property's traffic cannot reach significance in a four-week test alone, but the same question pooled across pages can.",
  },
  {
    rule: "weak_ctr_page",
    bucket: "pooled",
    needsPerTarget: null,
    why: "Same click-through question as high_impression_low_ctr under a different threshold; needs pooling, not a per-page count, at this volume.",
  },
  {
    rule: "declining_clicks",
    bucket: "pooled",
    needsPerTarget: null,
    why: "A click drop on one page is noise at this volume; the same drop summed across the property (site_clicks_shift) carries the evidence a single page cannot.",
  },
  {
    rule: "declining_impressions",
    bucket: "pooled",
    needsPerTarget: null,
    why: "An impression drop on one page is inside ordinary swing at this volume; pooled across the site (site_visibility_shift) the same movement can clear the noise floor.",
  },
  {
    rule: "significant_period_change",
    bucket: "pooled",
    needsPerTarget: null,
    why: "A large period-over-period move on one page is exactly the kind of number that looks dramatic and means nothing at this volume; pooled across pages it can.",
  },
  {
    rule: "visibility_gain",
    bucket: "pooled",
    needsPerTarget: null,
    why: "An impression rise on one page needs pooling to clear the noise floor at this volume, same as its decline counterpart.",
  },
  {
    rule: "striking_distance_query",
    bucket: "beyond_current_volume",
    needsPerTarget: 50,
    why: 'Reads the query dimension. Google omits queries "not issued by more than a few dozen users over a two-to-three month period" (see QUERY_DIMENSION_CAVEAT), and pooling pages does not recover a censored query row. 50 impressions on one query is the existing threshold, unchanged; it names the volume that would make this answerable, not a claim it is answerable now.',
  },
  {
    rule: "declining_position",
    bucket: "beyond_current_volume",
    needsPerTarget: 50,
    why: "Reads the query dimension; see striking_distance_query. 50 impressions is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "position_loss",
    bucket: "beyond_current_volume",
    needsPerTarget: 100,
    why: "Reads the query dimension; see striking_distance_query. 100 impressions is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "possible_query_overlap",
    bucket: "beyond_current_volume",
    needsPerTarget: 25,
    why: "Reads the query dimension; a censored query table can hide exactly the overlap this rule looks for. 25 impressions per page is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "query_coverage_gap",
    bucket: "beyond_current_volume",
    needsPerTarget: 25,
    why: "Reads the query dimension; see striking_distance_query. 25 impressions is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "research_page_traction",
    bucket: "beyond_current_volume",
    needsPerTarget: 20,
    why: "Reads impressions on a research-backed page at a volume the handoff calls 'barely' reachable (20 impressions). Kept as the existing threshold, not lowered.",
  },
  {
    rule: "page_traffic_loss",
    bucket: "pooled",
    needsPerTarget: null,
    why: "A GA4 session drop on one page needs pooling across pages to separate a real shift from ordinary week-to-week noise at this volume.",
  },
  {
    rule: "page_traffic_gain",
    bucket: "pooled",
    needsPerTarget: null,
    why: "Same as page_traffic_loss: a session rise on one page needs pooling to clear the noise floor.",
  },
  {
    rule: "zero_engagement_page",
    bucket: "pooled",
    needsPerTarget: null,
    why: "Whether a page's traffic converts is a rate question, same shape as click-through rate; pooling separates a real pattern from a quiet page.",
  },
  {
    rule: "event_disappeared",
    bucket: "fact",
    needsPerTarget: null,
    why: "An event that fired reliably and then stopped entirely is a wiring question (a tag or trigger broke), not a statistics question. No threshold makes 'did it stop' more honest than checking whether it fired.",
  },
];

/**
 * Google's own documentation on why any rule reading the `query` dimension is
 * reading a censored sample: queries "not issued by more than a few dozen
 * users over a two-to-three month period" are omitted from tables and dropped
 * from totals whenever a filter is applied.
 * https://developers.google.com/search/blog/2022/10/performance-data-deep-dive
 */
export const QUERY_DIMENSION_CAVEAT =
  "Caveat: at this site's volume Google hides most queries for privacy (only queries from more than a few dozen users are stored), so this reads a censored sample.";

export type ObservationDraft = {
  rule: CheckRule;
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  confidence: number;
};

type PerformanceRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export const RULE_CHECK_THRESHOLDS = {
  queryOverlap: { minImpressionsPerPage: 25, minPages: 2, ignoreBestPositionAtOrAbove: 5 },
  zeroImpression: { maxFindingsPerRun: 20 },
  coverageGap: { minImpressions: 25, minPosition: 5, maxPosition: 20 },
  inspectionDrift: { staleCrawlDays: 30 },
} as const;

/**
 * Two or more of our pages competing for the same query, with neither already
 * settled in the top results. keys on page_query rows are [page, query].
 */
export function detectQueryOverlap(pageQueryRows: PerformanceRow[]): ObservationDraft[] {
  const t = RULE_CHECK_THRESHOLDS.queryOverlap;
  const byQuery = new Map<string, Array<{ page: string; impressions: number; position: number }>>();
  for (const row of pageQueryRows) {
    const page = row.keys?.[0];
    const query = row.keys?.[1];
    if (!page || !query) continue;
    if (row.impressions < t.minImpressionsPerPage) continue;
    const entries = byQuery.get(query) ?? [];
    entries.push({ page, impressions: row.impressions, position: row.position });
    byQuery.set(query, entries);
  }

  const drafts: ObservationDraft[] = [];
  for (const [query, pages] of byQuery) {
    if (pages.length < t.minPages) continue;
    const best = Math.min(...pages.map((entry) => entry.position));
    if (best <= t.ignoreBestPositionAtOrAbove) continue;
    const sorted = [...pages].sort((a, b) => b.impressions - a.impressions);
    const totalImpressions = pages.reduce((sum, entry) => sum + entry.impressions, 0);
    const needed = t.minImpressionsPerPage * t.minPages;
    const confidence = confidenceInCount(totalImpressions, needed);
    drafts.push({
      rule: "possible_query_overlap",
      target: query,
      title: `Query overlap on "${query}"`,
      description: `${pages.length} pages split impressions for "${query}" and none ranks better than position ${best.toFixed(1)}. Consolidating or re-pointing internal links would focus authority on one page.`,
      evidence: { query, pages: sorted, confidenceReason: confidence.reason },
      businessImpact: "medium",
      confidence: confidence.value,
    });
  }
  return drafts;
}

/**
 * Pages the audit crawler knows about that earned zero impressions in the
 * page snapshot: thin, orphaned, or unindexed. Capped so a first run over a
 * large page set does not flood the queue.
 */
export function detectZeroImpressionPages(
  auditedUrls: string[],
  pageRows: PerformanceRow[],
): ObservationDraft[] {
  const t = RULE_CHECK_THRESHOLDS.zeroImpression;
  const seen = new Set(
    pageRows.map((row) => row.keys?.[0]).filter((page): page is string => Boolean(page)),
  );
  const drafts: ObservationDraft[] = [];
  for (const url of auditedUrls) {
    if (seen.has(url)) continue;
    drafts.push({
      rule: "zero_impression_page",
      target: url,
      title: `No search impressions for ${url}`,
      description: `${url} is in the audited page set but earned zero impressions on the reporting date. It is either not indexed, orphaned from internal links, or too thin to rank.`,
      evidence: { page: url },
      businessImpact: "low",
      // Stated: absence from the stored performance snapshot is read directly,
      // not estimated from a count, so it carries no sampling noise. Capped
      // below 1 because Search Console "stores top data rows and not all data
      // rows" — a page reading zero may never have been stored at all.
      confidence: 0.9,
    });
    if (drafts.length >= t.maxFindingsPerRun) break;
  }
  return drafts;
}

export type PageMetaFacts = {
  url: string;
  title: string | null;
  h1: string | null;
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
}

const STOPWORDS = new Set(["a", "an", "and", "for", "in", "is", "of", "on", "the", "to", "with"]);

/**
 * Queries a page ranks for (striking range) whose meaningful words never
 * appear in the page's stored title or H1. Raw body text is not stored, so
 * title and H1 are the strongest coverage signal available.
 */
export function detectQueryCoverageGaps(
  pageQueryRows: PerformanceRow[],
  metaByUrl: Map<string, PageMetaFacts>,
): ObservationDraft[] {
  const t = RULE_CHECK_THRESHOLDS.coverageGap;
  const drafts: ObservationDraft[] = [];
  for (const row of pageQueryRows) {
    const page = row.keys?.[0];
    const query = row.keys?.[1];
    if (!page || !query) continue;
    if (row.impressions < t.minImpressions) continue;
    if (row.position < t.minPosition || row.position > t.maxPosition) continue;
    const meta = metaByUrl.get(page);
    if (!meta) continue;
    const haystack = normalizeText(`${meta.title ?? ""} ${meta.h1 ?? ""}`);
    const words = normalizeText(query)
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word));
    if (words.length === 0) continue;
    const missing = words.filter((word) => !haystack.includes(word));
    if (missing.length !== words.length) continue;
    const confidence = confidenceInCount(row.impressions, t.minImpressions);
    drafts.push({
      rule: "query_coverage_gap",
      target: `${page} :: ${query}`,
      title: `"${query}" is not answered on ${page}`,
      description: `${page} ranks at position ${row.position.toFixed(1)} for "${query}" (${row.impressions} impressions), but no word of the query appears in the page title or H1. Addressing it directly could lift the ranking. ${QUERY_DIMENSION_CAVEAT}`,
      evidence: {
        page,
        query,
        ...row,
        pageTitle: meta.title,
        pageH1: meta.h1,
        confidenceReason: confidence.reason,
      },
      businessImpact: "medium",
      confidence: confidence.value,
    });
  }
  return drafts;
}

export type InspectionFacts = {
  inspectedUrl: string;
  verdict: string;
  coverageState: string | null;
  indexingState: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  lastCrawlTime: string | null;
};

/**
 * Index-coverage drift from the latest stored inspection per URL: not
 * indexed, Google chose a different canonical, or the crawl is stale.
 */
export function detectInspectionDrift(
  inspections: InspectionFacts[],
  now: Date,
): ObservationDraft[] {
  const t = RULE_CHECK_THRESHOLDS.inspectionDrift;
  const drafts: ObservationDraft[] = [];
  for (const inspection of inspections) {
    const url = inspection.inspectedUrl;
    if (inspection.verdict !== "PASS") {
      drafts.push({
        rule: "index_coverage_drift",
        target: url,
        title: `${url} is not indexed`,
        description: `Google reports verdict ${inspection.verdict}${inspection.coverageState ? ` (${inspection.coverageState})` : ""} for ${url}. The page cannot earn search traffic until this is resolved.`,
        evidence: { ...inspection },
        businessImpact: "high",
        // Stated: facts read from URL Inspection carry no sampling noise;
        // capped below 1 because the inspection itself can be stale.
        confidence: 0.9,
      });
      continue;
    }
    if (
      inspection.googleCanonical &&
      inspection.userCanonical &&
      inspection.googleCanonical !== inspection.userCanonical
    ) {
      drafts.push({
        rule: "index_coverage_drift",
        target: url,
        title: `Google picked a different canonical for ${url}`,
        description: `We declare ${inspection.userCanonical} but Google indexed ${inspection.googleCanonical}. Traffic and signals are flowing to a page we did not choose.`,
        evidence: { ...inspection },
        businessImpact: "medium",
        // Stated: facts read from URL Inspection carry no sampling noise;
        // capped below 1 because the inspection itself can be stale.
        confidence: 0.9,
      });
      continue;
    }
    if (inspection.lastCrawlTime) {
      const ageDays = (now.getTime() - new Date(inspection.lastCrawlTime).getTime()) / 86_400_000;
      if (ageDays > t.staleCrawlDays) {
        drafts.push({
          rule: "index_coverage_drift",
          target: url,
          title: `${url} has not been crawled in ${Math.floor(ageDays)} days`,
          description: `Google last crawled ${url} on ${inspection.lastCrawlTime.slice(0, 10)}. Content changes since then are invisible to search.`,
          evidence: { ...inspection, crawlAgeDays: Math.floor(ageDays) },
          businessImpact: "low",
          // Stated: facts read from URL Inspection carry no sampling noise;
          // capped below 1 because the inspection itself can be stale.
          confidence: 0.9,
        });
      }
    }
  }
  return drafts;
}
