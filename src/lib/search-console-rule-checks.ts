import type { Database } from "@/integrations/supabase/types";
import { confidenceInCount } from "./confidence";
import { type DatedPageQueryRow, describeRotation, readRotation } from "./serp-rotation";

/**
 * Pure rule checks over already-stored Search Console and page-audit data.
 * Kept out of the .server module so they test without mocks, matching
 * page-checks.ts and site-checks.ts. Nothing here reads a network or a
 * database; the .server caller supplies rows and persists results.
 *
 * Every rule below is assigned to a volume-honesty bucket in RULE_ASSIGNMENTS
 * (`rule-buckets.ts`, fact / pooled / beyond_current_volume) per
 * docs/handoffs/2026-08-20-rule-thresholds-audit.md.
 */

export type CheckRule =
  | "possible_query_overlap"
  | "zero_impression_page"
  | "query_coverage_gap"
  | "index_coverage_drift"
  | "serp_rotation";

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
/**
 * Which page Google kept choosing, across every date on record (CODE-97).
 *
 * `detectQueryOverlap` above asks the co-listing question: do two of our pages
 * appear on one SERP together. DataForSEO's own published skill argues that is
 * the wrong test, because Google host-crowds to roughly one result per domain,
 * so two competing pages will rarely be listed side by side and their absence
 * proves nothing. Both rules stay: co-listing catches a live split, and this
 * catches the case the other cannot see, where Google keeps changing its mind
 * over weeks and every single day looks settled.
 *
 * The input is every dated page-and-query row, not one window. Nothing here
 * carries a threshold: rotation is a fact about the observations, and the only
 * judgement is confidence, which is scaled by the impressions behind it exactly
 * as the other rules scale theirs.
 */
export function detectSerpRotation(rows: DatedPageQueryRow[]): ObservationDraft[] {
  const reading = readRotation(rows);
  return reading.rotating.map((query) => {
    // One observed date cannot show a change, so the reading already excludes
    // it. Confidence still rises with the dates behind the claim: two dates is
    // a swap, fifteen is a pattern.
    const confidence = confidenceInCount(query.datesObserved, reading.datesInWindow);
    const [first, second] = query.contenders;
    return {
      rule: "serp_rotation",
      target: query.query,
      title: `Google keeps changing which page answers "${query.query}"`,
      description: describeRotation(query),
      evidence: {
        query: query.query,
        datesObserved: query.datesObserved,
        datesInWindow: reading.datesInWindow,
        bestPosition: query.bestPosition,
        impressions: query.impressions,
        clicks: query.clicks,
        contenders: query.contenders,
        timeline: query.timeline,
        confidenceReason: confidence.reason,
        // Recorded because the remedy turns on it and the vendor's own
        // correction is that the reflex is wrong: a commercial and an
        // informational page want canonicalisation, not a merge and a 301.
        method: "rotation across dated page and query snapshots",
      },
      businessImpact: query.clicks > 0 ? "high" : "medium",
      confidence: confidence.value,
    };
  });
}

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
      description: `${pages.length} pages split impressions for "${query}" and none ranks better than position ${best.toFixed(1)}. Consolidating or re-pointing internal links would focus authority on one page. ${QUERY_DIMENSION_CAVEAT}`,
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
      // Stated assumption: 0.6 — a zero row may be a never-stored row
      // ("stores top data rows and not all data rows"); what would settle it
      // is URL Inspection confirming the page indexed while the row stays
      // absent. Kept below every URL-Inspection fact: absence from a
      // truncated table is an inference, not something read directly.
      confidence: 0.6,
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
        // Stated assumption: 0.9 — facts read from URL Inspection carry no
        // sampling noise; capped below 1 because the inspection itself can
        // be stale. A fresher inspection is what would settle it.
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
        // Stated assumption: 0.9 — facts read from URL Inspection carry no
        // sampling noise; capped below 1 because the inspection itself can
        // be stale. A fresher inspection is what would settle it.
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
          // Stated assumption: 0.9 — the crawl date itself is a fact read
          // from URL Inspection, but "stale" is a judgment against
          // staleCrawlDays: 30, an operator-set threshold, not the
          // inspection alone. Capped below 1 for both reasons.
          confidence: 0.9,
        });
      }
    }
  }
  return drafts;
}
