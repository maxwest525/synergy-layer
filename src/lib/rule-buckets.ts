import { RULE_CHECK_THRESHOLDS } from "./search-console-rule-checks";
import { SEARCH_CONSOLE_THRESHOLDS, SEO_VALIDATION_THRESHOLDS } from "./rule-thresholds";

/**
 * How much of the property's traffic a rule needs before its answer is
 * trustworthy, and why. Not enforcement — the thresholds themselves are
 * unchanged — this is the "every rule is assigned, with the reasoning
 * written down" line of the handoff's definition of done, made executable
 * (see rule-buckets.test.ts).
 *
 * Sits above the three finding-rule modules (rather than inside one of them)
 * so `needsPerTarget` can reference each family's real threshold object
 * instead of a copy that can drift out of sync with it.
 */
export type RuleBucket = "fact" | "pooled" | "beyond_current_volume";

export type RuleAssignment = {
  readonly rule: string;
  readonly bucket: RuleBucket;
  /** The per-target evidence a beyond_current_volume rule would need to answer honestly; null elsewhere. */
  readonly needsPerTarget: number | null;
  /**
   * Developer-facing prose explaining the assignment, meant to be read in
   * code or a report — not rendered to the operator. It may name other rule
   * ids for cross-reference; only `bucket` and `needsPerTarget` are safe to
   * put on screen.
   */
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
 *   the query table is mostly anonymized away (see QUERY_DIMENSION_CAVEAT in
 *   search-console-rule-checks.ts), and pooling across pages does not
 *   recover a censored query. The existing threshold is kept as
 *   `needsPerTarget` so the UI can say what volume would change the answer;
 *   it is not changed.
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
    why: "Zero clicks on one page needs 5-20x this property's per-page volume to mean anything alone; the click-shaped question is answered honestly only pooled across the site (the site-wide clicks reading).",
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
    why: "The same click-through question under a different threshold; needs pooling, not a per-page count, at this volume.",
  },
  {
    rule: "declining_clicks",
    bucket: "pooled",
    needsPerTarget: null,
    why: "A click drop on one page is noise at this volume; the same drop summed across the property (the site-wide clicks reading) carries the evidence a single page cannot.",
  },
  {
    rule: "declining_impressions",
    bucket: "pooled",
    needsPerTarget: null,
    why: "An impression drop on one page is inside ordinary swing at this volume; pooled across the site (the site-wide visibility reading) the same movement can clear the noise floor.",
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
    rule: "site_visibility_shift",
    bucket: "pooled",
    needsPerTarget: null,
    why: "The pooled answer itself: site-wide impressions summed across every page the property has, judged with a derived confidence rather than a per-page count too small to trust alone.",
  },
  {
    rule: "site_clicks_shift",
    bucket: "pooled",
    needsPerTarget: null,
    why: "The pooled answer itself: site-wide clicks summed across every page the property has, judged with a derived confidence rather than a per-page count too small to trust alone.",
  },
  {
    rule: "striking_distance_query",
    bucket: "beyond_current_volume",
    needsPerTarget: SEARCH_CONSOLE_THRESHOLDS.strikingDistance.minImpressions,
    why: 'Reads the query dimension. Google omits queries "not issued by more than a few dozen users over a two-to-three month period", and pooling pages does not recover a censored query row. The impression count needed is the existing threshold, unchanged; it names the volume that would make this answerable, not a claim it is answerable now.',
  },
  {
    rule: "declining_position",
    bucket: "beyond_current_volume",
    needsPerTarget: SEO_VALIDATION_THRESHOLDS.decliningPosition.minImpressions,
    why: "Reads the query dimension, same censorship as every other query-dimension rule. The impression count needed is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "position_loss",
    bucket: "beyond_current_volume",
    needsPerTarget: SEARCH_CONSOLE_THRESHOLDS.positionLoss.minImpressions,
    why: "Reads the query dimension, same censorship as every other query-dimension rule. The impression count needed is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "possible_query_overlap",
    bucket: "beyond_current_volume",
    needsPerTarget: SEO_VALIDATION_THRESHOLDS.queryOverlap.minImpressionsPerPage,
    why: "Reads the query dimension; a censored query table can hide exactly the overlap this rule looks for. The per-page impression count needed is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "query_coverage_gap",
    bucket: "beyond_current_volume",
    needsPerTarget: RULE_CHECK_THRESHOLDS.coverageGap.minImpressions,
    why: "Reads the query dimension, same censorship as every other query-dimension rule. The impression count needed is the existing threshold, kept as the volume this would need, not lowered.",
  },
  {
    rule: "research_page_traction",
    bucket: "beyond_current_volume",
    needsPerTarget: SEO_VALIDATION_THRESHOLDS.researchTraction.minImpressions,
    why: "Reads impressions on a research-backed page at a volume the handoff calls 'barely' reachable. The impression count needed is the existing threshold, not lowered.",
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
    why: "A GA4 session rise on one page needs pooling across pages to clear the noise floor, same as its decline counterpart.",
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
