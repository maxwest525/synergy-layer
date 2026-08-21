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

/**
 * A condition other than volume that has to hold before a rule can say
 * anything. Volume is often not what binds first: a rule comparing against a
 * prior window cannot fire at any traffic level until a second collection has
 * run, and an empty screen that explains only volume misnames why it is empty.
 */
export type Prerequisite =
  | "second_collection"
  | "page_audit"
  | "analytics"
  | "url_inspection"
  | "approved_keywords"
  | "backlink_collection";

/** What has actually happened for this tenant, read from facts each page already holds. */
export type PrerequisiteState = {
  /** A prior window exists to compare against (`comparison.status === "ready"`). */
  readonly secondCollection: boolean;
  /** The page audit has stored at least one observation. */
  readonly pageAudit: boolean;
  /** Analytics is connected, so visits can be counted at all. */
  readonly analytics: boolean;
  /** At least one stored URL inspection exists to compare against. */
  readonly urlInspection: boolean;
  /** The operator has approved at least one keyword to target. */
  readonly approvedKeywords: boolean;
  /** Two stored backlink readings exist, so there is movement to compare. */
  readonly backlinkCollection: boolean;
};

export type RuleAssignment = {
  readonly rule: string;
  readonly bucket: RuleBucket;
  /** The per-target evidence a beyond_current_volume rule would need to answer honestly; null elsewhere. */
  readonly needsPerTarget: number | null;
  /** Non-volume conditions this rule cannot fire without. Empty when volume is the only thing in the way. */
  readonly alsoNeeds: readonly Prerequisite[];
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
    alsoNeeds: ["page_audit"],
    why: 'Whether a page ever appeared is read directly from the performance snapshot, not inferred from a count. "Google doesn\'t guarantee that all pages everywhere will make it into the Google index" (support.google.com/webmasters/answer/7440203), so absence itself is the fact worth reporting. Its target set is the audited page list itself (search-console-rules.server.ts:314, detectZeroImpressionPages([...metaByUrl.keys()], pageRows) in search-console-rule-checks.ts:97-123): with no page audit run, metaByUrl is empty and the rule has nothing to iterate.',
  },
  {
    rule: "index_coverage_drift",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["url_inspection"],
    why: "URL Inspection states (verdict, canonical, last crawl) are read directly from Google, not derived from a sample. No threshold answers 'is this page indexed' more honestly than asking Google. detectInspectionDrift (search-console-rule-checks.ts:200-221) iterates the stored inspections list; with none stored, there is nothing to report on.",
  },
  {
    rule: "zero_click_page",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: [],
    why: "Zero clicks on one page needs 5-20x this property's per-page volume to mean anything alone; the click-shaped question is answered honestly only pooled across the site (the site-wide clicks reading). Reads only the current window (seo-validation.server.ts:272, `now.clicks === 0`) — no prior comparison, so no second collection is required.",
  },
  {
    rule: "high_impression_low_ctr",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: [],
    why: "Click-through rate on a single page is the textbook case: a page at this property's traffic cannot reach significance in a four-week test alone, but the same question pooled across pages can. Reads only the current window (seo-validation.server.ts:247-250) — no `before` is required to fire.",
  },
  {
    rule: "weak_ctr_page",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: [],
    why: "The same click-through question under a different threshold; needs pooling, not a per-page count, at this volume. Reads only the current window (search-console-rules.server.ts:163-174) — no prior window involved.",
  },
  {
    rule: "declining_clicks",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection"],
    why: "A click drop on one page is noise at this volume; the same drop summed across the property (the site-wide clicks reading) carries the evidence a single page cannot. Requires a prior-window row to diff against (seo-validation.server.ts:190-218, `before` gates the finding) — cannot fire until a second collection exists.",
  },
  {
    rule: "declining_impressions",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection"],
    why: "An impression drop on one page is inside ordinary swing at this volume; pooled across the site (the site-wide visibility reading) the same movement can clear the noise floor. Requires `before` from the prior window (seo-validation.server.ts:220-245).",
  },
  {
    rule: "significant_period_change",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection"],
    why: "A large period-over-period move on one page is exactly the kind of number that looks dramatic and means nothing at this volume; pooled across pages it can. Requires `before` from the prior window (seo-validation.server.ts:294-321) — there is no period to compare against without a second collection.",
  },
  {
    rule: "visibility_gain",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection"],
    why: "An impression rise on one page needs pooling to clear the noise floor at this volume, same as its decline counterpart. Requires `before` from the prior page snapshot (search-console-rules.server.ts:176-193).",
  },
  {
    rule: "site_visibility_shift",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection"],
    why: "The pooled answer itself: site-wide impressions summed across every page the property has, judged with a derived confidence rather than a per-page count too small to trust alone. Gated on `currentTotals && priorTotals` (search-console-rules.server.ts:204-233); a missing prior window means no comparison exists, so this cannot fire before a second collection.",
  },
  {
    rule: "site_clicks_shift",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection"],
    why: "The pooled answer itself: site-wide clicks summed across every page the property has, judged with a derived confidence rather than a per-page count too small to trust alone. Gated on the same `currentTotals && priorTotals` check as site_visibility_shift (search-console-rules.server.ts:204,235-254).",
  },
  {
    rule: "striking_distance_query",
    bucket: "beyond_current_volume",
    needsPerTarget: SEARCH_CONSOLE_THRESHOLDS.strikingDistance.minImpressions,
    alsoNeeds: [],
    why: 'Reads the query dimension. Google omits queries "not issued by more than a few dozen users over a two-to-three month period", and pooling pages does not recover a censored query row. The impression count needed is the existing threshold, unchanged; it names the volume that would make this answerable, not a claim it is answerable now. Reads only the current window (search-console-rules.server.ts:122-139) — no prior comparison.',
  },
  {
    rule: "declining_position",
    bucket: "beyond_current_volume",
    needsPerTarget: SEO_VALIDATION_THRESHOLDS.decliningPosition.minImpressions,
    alsoNeeds: ["second_collection"],
    why: "Reads the query dimension, same censorship as every other query-dimension rule. The impression count needed is the existing threshold, kept as the volume this would need, not lowered. Also requires `before` from the prior query window (seo-validation.server.ts:359-383) — volume alone does not unblock it.",
  },
  {
    rule: "position_loss",
    bucket: "beyond_current_volume",
    needsPerTarget: SEARCH_CONSOLE_THRESHOLDS.positionLoss.minImpressions,
    alsoNeeds: ["second_collection"],
    why: "Reads the query dimension, same censorship as every other query-dimension rule. The impression count needed is the existing threshold, kept as the volume this would need, not lowered. Also requires a prior query row to diff against (search-console-rules.server.ts:141-157, `before` gates the finding).",
  },
  {
    rule: "possible_query_overlap",
    bucket: "beyond_current_volume",
    needsPerTarget: SEO_VALIDATION_THRESHOLDS.queryOverlap.minImpressionsPerPage,
    alsoNeeds: ["second_collection"],
    why: "Reads the query dimension; a censored query table can hide exactly the overlap this rule looks for. The per-page impression count needed is the existing threshold, kept as the volume this would need, not lowered. seo-validation.server.ts:412-437 requires `periodsAvailable >= t.queryOverlap.minPeriods` (two consecutive finalized periods), so it also cannot fire before a second collection.",
  },
  {
    rule: "query_coverage_gap",
    bucket: "beyond_current_volume",
    needsPerTarget: RULE_CHECK_THRESHOLDS.coverageGap.minImpressions,
    alsoNeeds: ["page_audit"],
    why: "Reads the query dimension, same censorship as every other query-dimension rule. The impression count needed is the existing threshold, kept as the volume this would need, not lowered. detectQueryCoverageGaps (search-console-rule-checks.ts:144-170) skips every row without a `metaByUrl` entry, and that map is built from page_metadata_observations (search-console-rules.server.ts:273-285) — the same audit table zero_impression_page depends on — so it cannot find a gap on a page the audit has not read.",
  },
  {
    rule: "research_page_traction",
    bucket: "beyond_current_volume",
    needsPerTarget: SEO_VALIDATION_THRESHOLDS.researchTraction.minImpressions,
    alsoNeeds: ["second_collection"],
    why: "Reads impressions on a research-backed page at a volume the handoff calls 'barely' reachable. The impression count needed is the existing threshold, not lowered. Also requires `before` from the prior page window (seo-validation.server.ts:323-350).",
  },
  {
    rule: "page_traffic_loss",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection", "analytics"],
    why: "A GA4 session drop on one page needs pooling across pages to separate a real shift from ordinary week-to-week noise at this volume. detectPageTrafficShift (ga4-rule-checks.ts:95-129) reads `priorByPage`, so it cannot fire before a second GA4 collection; it also needs analytics connected at all to have any rows.",
  },
  {
    rule: "page_traffic_gain",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["second_collection", "analytics"],
    why: "A GA4 session rise on one page needs pooling across pages to clear the noise floor, same as its decline counterpart. Same `priorByPage`-gated function as page_traffic_loss (ga4-rule-checks.ts:95-129).",
  },
  {
    rule: "zero_engagement_page",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["analytics"],
    why: "Whether a page's traffic converts is a rate question, same shape as click-through rate; pooling separates a real pattern from a quiet page. detectZeroEngagementPages (ga4-rule-checks.ts:189-215) reads only the current GA4 window — no prior comparison — but needs analytics connected to have any sessions to judge.",
  },
  {
    rule: "event_disappeared",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["second_collection", "analytics"],
    why: "An event that fired reliably and then stopped entirely is a wiring question (a tag or trigger broke), not a statistics question. No threshold makes 'did it stop' more honest than checking whether it fired. detectDisappearedEvents (ga4-rule-checks.ts:158-182) reads `priorByEvent` to know what used to fire, so it cannot say anything before a second GA4 collection, and needs analytics connected to have events at all.",
  },
  {
    rule: "approved_keyword_unobserved",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["approved_keywords"],
    why: "Whether a stored SERP exists for an approved keyword is a row lookup, not an estimate: detectUnobservedKeywords (targeting-rules.ts) sets a keyword against the targets of stored serp_organic snapshots. No traffic volume makes that yes/no more or less answerable. It cannot fire before an operator approves a keyword, because tracked_keywords is its entire target set.",
  },
  {
    rule: "approved_keyword_no_page",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["approved_keywords", "page_audit"],
    why: 'Whether any read page carries the approved phrase in its title or H1 is read from page_metadata_observations, not inferred from counts. Google: "Other pages are discovered when Google extracts a link from a known page to a new page: for example, a hub page, such as a category page, links to a new blog post" (developers.google.com/search/docs/fundamentals/how-search-works, fetched 2026-08-21) — a page has to exist and be linked before it can rank, so a phrase with no page is a discovery gap, not a measurement question. detectKeywordsWithoutPage returns nothing when the audit has read no pages, so the page-audit prerequisite is real rather than decorative.',
  },
  {
    rule: "referring_domain_movement",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["backlink_collection", "second_collection"],
    why: "The count of linking domains is a count, so it takes confidenceInCountChange like every other count-shaped rule rather than a literal: at this property's link volume a move of one or two domains sits inside ordinary variation, and the finding says so instead of being suppressed. It is pooled by construction — the whole property has one referring-domain set, not one per page. detectReferringDomainMovement returns nothing without two stored backlinks_referring_domains snapshots.",
  },
];

const PREREQUISITE_COPY: Record<Prerequisite, string> = {
  second_collection:
    "a second collection, so there is an earlier period to compare this one against",
  page_audit: "the page audit to have run once, so anything has been read from your pages",
  analytics: "analytics connected, so visits can be counted at all",
  url_inspection: "a stored index check to compare against",
  approved_keywords: "at least one approved keyword, so there is something to target",
  backlink_collection: "two stored backlink readings, so there is movement to compare",
};

const PREREQUISITE_STATE_KEY: Record<Prerequisite, keyof PrerequisiteState> = {
  second_collection: "secondCollection",
  page_audit: "pageAudit",
  analytics: "analytics",
  url_inspection: "urlInspection",
  approved_keywords: "approvedKeywords",
  backlink_collection: "backlinkCollection",
};

/** The unmet prerequisites across the given rules, worst-blocking first, as sentences. */
export function unmetPrerequisites(
  state: PrerequisiteState,
  assignments: readonly RuleAssignment[] = RULE_ASSIGNMENTS,
): readonly string[] {
  return (Object.keys(PREREQUISITE_COPY) as Prerequisite[])
    .map((prerequisite) => ({
      prerequisite,
      met: state[PREREQUISITE_STATE_KEY[prerequisite]],
      count: assignments.filter((assignment) => assignment.alsoNeeds.includes(prerequisite)).length,
    }))
    .filter(({ met, count }) => !met && count > 0)
    .sort((a, b) => b.count - a.count)
    .map(
      ({ prerequisite, count }) =>
        `${count} checks are waiting on ${PREREQUISITE_COPY[prerequisite]}.`,
    );
}
