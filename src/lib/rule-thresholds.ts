/**
 * The finding-rule threshold objects, moved here so `rule-buckets.ts` can
 * reference the live numbers without pulling `search-console-rules.server.ts`
 * (and its `node:crypto`-importing chain) into client-reachable code.
 *
 * Plain `as const` data, no logic. `search-console-rules.server.ts` and
 * `seo-validation.server.ts` re-export these under the same names, so no
 * other caller changes.
 */

export const SEARCH_CONSOLE_THRESHOLDS = {
  strikingDistance: { minPosition: 8, maxPosition: 20, minImpressions: 50 },
  weakCtr: { minImpressions: 200, maxCtr: 0.01 },
  positionLoss: { minImpressions: 100, minPositionDrop: 3 },
  visibilityGain: { minImpressions: 100, minImpressionGrowth: 0.35 },
  queryOverlap: { minImpressionsPerPage: 25, minPages: 2 },
  comparisonWindowDays: 7,
} as const;

export const SEO_VALIDATION_THRESHOLDS = {
  decliningTraffic: { minPreviousClicks: 10, minClickDropRatio: 0.3 },
  decliningImpressions: { minPreviousImpressions: 100, minImpressionDropRatio: 0.25 },
  decliningPosition: { minImpressions: 50, minPositionDrop: 3 },
  highImpressionLowCtr: { minImpressions: 200, maxCtr: 0.01 },
  zeroClickPage: { minImpressions: 150 },
  queryOverlap: { minImpressionsPerPage: 25, minPages: 2, minPeriods: 2, minTotalImpressions: 50 },
  significantChange: { minPreviousImpressions: 100, minChangeRatio: 0.5 },
  researchTraction: { minImpressions: 20, minImpressionGrowth: 0.25 },
  // Competitor evidence. These read observed SERP profiles, never estimates.
  competitorOutranks: { minQueries: 3, minConfidence: 0.5 },
  ownedSerpAbsence: { minAbsentSerps: 5, minShareAbsent: 0.25 },
} as const;

export type SeoRule =
  | "declining_clicks"
  | "declining_impressions"
  | "declining_position"
  | "high_impression_low_ctr"
  | "zero_click_page"
  | "possible_query_overlap"
  | "significant_period_change"
  | "research_page_traction"
  | "competitor_outranks_owned"
  | "owned_absent_from_approved_serps";

export const SEO_RULES: SeoRule[] = [
  "declining_clicks",
  "declining_impressions",
  "declining_position",
  "high_impression_low_ctr",
  "zero_click_page",
  "possible_query_overlap",
  "significant_period_change",
  "research_page_traction",
  "competitor_outranks_owned",
  "owned_absent_from_approved_serps",
];
