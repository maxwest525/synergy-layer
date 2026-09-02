import { MIN_BASELINE } from "./confidence";
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
  | "backlink_collection"
  | "whois_collection"
  | "technology_collection"
  | "brand_mention_collection"
  | "referring_domain_collection"
  | "reviewed_competitor_set"
  | "umami_second_window"
  | "onpage_crawl";

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
  /** A whois read exists for the tenant's tracked and candidate domains. */
  readonly whoisCollection: boolean;
  /** A stored technology-stack read exists for two or more known domains. */
  readonly technologyCollection: boolean;
  /** A brand-mention read (Content Analysis) has been collected at least once. */
  readonly brandMentionCollection: boolean;
  /** One stored referring-domain read exists, so there is a list of linking sites to check against. */
  readonly referringDomainCollection: boolean;
  /** At least one competitor candidate has been reviewed as an actual competitor. */
  readonly reviewedCompetitorSet: boolean;
  /**
   * Two stored umami_snapshots rows for the same website whose windows do not
   * overlap (pairNonOverlappingWindows in umami-rule-checks.ts). Optional
   * because the three fact-gathering call sites (your-pages.ts, getting-found.ts,
   * site-health.ts) do not read Umami and are outside this change's file list;
   * an absent field reads as unmet, which is the safe default until one of
   * them is wired to pass it.
   */
  readonly umamiSecondWindow?: boolean;
  /**
   * At least one OnPage crawl has been collected (a stored
   * `dataforseo_snapshots` row for one of the OnPage detail kinds). None of
   * the other six prerequisites names this: crediting `page_audit` (the
   * Firecrawl/Crawl4AI page-metadata table) would blame the wrong pipeline
   * for an empty site-audit screen, which is exactly the failure mode this
   * type's own doc comment warns about.
   *
   * Stated gap: the three view-model builders that call `unmetPrerequisites`
   * (`your-pages.ts`, `site-health.ts`, `getting-found.ts`) all pass `true`
   * for this today rather than a live read of `dataforseo_snapshots`, so the
   * banner this prerequisite would show is not yet wired to the real signal.
   * The rules themselves are unaffected: `onpage-rule-checks.ts` already
   * returns nothing when no crawl snapshot exists, so a missing crawl never
   * renders as a false "all clear" — only the explanatory banner is pending.
   * Wiring a real read is follow-up work.
   */
  readonly onpageCrawl: boolean;
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
    rule: "page_lcp_poor",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: [],
    why: "A Lighthouse run measures one page directly, so no traffic is needed to answer it and no threshold is invented here: Google publishes the Core Web Vitals bands (LCP good at or under 2.5s, poor above 4.0s) and only the poor band fires. The finding copy states that this is a lab reading rather than the CrUX field data Google's page-experience signal and the Search Console Core Web Vitals report actually read, so it is never presented as proof the page fails Core Web Vitals for real visitors.",
  },
  {
    rule: "page_cls_poor",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: [],
    why: "Same basis as page_lcp_poor: a direct per-page measurement, Google's published band (CLS good at or under 0.1, poor above 0.25), and only the poor band fires. Layout shift is reported for what it costs a visitor (tapping the wrong thing), not as a ranking claim.",
  },
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
    rule: "tracked_set_has_no_route_query",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["approved_keywords"],
    why: "Whether any approved keyword names a journey, and whether any stored Search Console query does, are two pattern matches over rows this system already holds; no traffic volume changes a yes/no over strings. It needs at least one approved keyword (with none, the gap is that nothing is targeted, which approved_keyword rules already say) and a stored page+query read; with no route query in that read there is no evidence to name and it says nothing. It invents no keyword: it lists the searches people used (COMP-1).",
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
    rule: "approved_keyword_multiple_pages",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["approved_keywords", "page_audit"],
    why: "Whether two or more read pages both carry the approved phrase in their title or H1 is a count of stored rows, the same evidence detectKeywordsWithoutPage reads, just asking the opposite question: not-zero-and-not-one instead of zero. No traffic volume changes whether two pages share a phrase; it either does or does not. Returns nothing when the audit has read no pages, for the same reason as its sibling rule.",
  },
  {
    rule: "referring_domain_movement",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["backlink_collection", "second_collection"],
    why: "The count of linking domains is a count, so it takes confidenceInCountChange like every other count-shaped rule rather than a literal: at this property's link volume a move of one or two domains sits inside ordinary variation, and the finding says so instead of being suppressed. It is pooled by construction — the whole property has one referring-domain set, not one per page. detectReferringDomainMovement returns nothing without two stored backlinks_referring_domains snapshots.",
  },

  // Discovery family (dataforseo/discovery-rule-checks.ts): Labs, Domain
  // Analytics and Content Analysis snapshots that nothing read before. Two of
  // the four file an operator DECISION rather than a finding -- ownership is
  // never inferred, per COMPETITIVE_MODEL.md §4 and §7.
  {
    rule: "overlap_list_reached_the_row_limit",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: [],
    why: "Whether a stored overlap lookup came back at its own requested limit is a comparison of two numbers already on the snapshot row (possibly_truncated, request_params.limit) -- no traffic level makes that more or less readable. discoverCompetitors (labs.server.ts) is the only producer, so this answers as soon as one lookup has run; there is no second-collection or volume gate.",
  },
  {
    rule: "same_registration_details_across_two_known_domains",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["whois_collection"],
    why: "Two domains sharing an exact stored registrar or registration timestamp is a string-equality check over rows this system already holds -- no volume of traffic makes two dates equal or not. It cannot answer before a whois read exists for the tenant's tracked and candidate domains, and nothing schedules that read automatically (collectWhoisOverview has no caller yet). Files a pending row in domain_ownership_candidates for the operator to confirm or reject; COMPETITIVE_MODEL.md §4 and §7 forbid asserting the link as fact.",
  },
  {
    rule: "identical_technology_stack_across_two_known_domains",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["technology_collection"],
    why: "Exact equality of two stored technology-stack objects needs no traffic to answer. It cannot fire before at least two known domains have a stored technology read, which today exists only for the owned property (workflow dfs-domain-technologies) -- a competitor domain needs an operator to point the same collector at it. Files a pending row in domain_ownership_candidates for the operator to confirm or reject, never an ownership fact, per COMPETITIVE_MODEL.md §4 and §7.",
  },
  {
    rule: "rival_page_mentions_your_brand",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["brand_mention_collection", "reviewed_competitor_set"],
    why: "Whether a stored brand mention's domain matches an already-known competitor is a set match over two stored tables -- no traffic volume changes whether two strings are equal. It needs both a brand-mention read (workflow dfs-brand-mentions, operator-triggered) and at least one candidate reviewed as an actual competitor rather than a surface domain (directory, marketplace, review site), or an empty screen would blame volume for what is really two missing prerequisites.",
  },
  {
    rule: "brand_mentioned_without_a_link",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["brand_mention_collection", "referring_domain_collection"],
    why: "Whether a stored brand mention's domain appears in the stored referring-domain list is a set difference over two tables this system already holds -- no traffic volume changes whether a string is in a set. It needs a brand-mention read (workflow dfs-brand-mentions, operator-triggered) and a referring-domain read (dfs-backlinks); without the link list, 'without a link' is not a claim it can make. When the referring-domain read filled its limit the finding says 'not among the first N linking domains by rank', which is exactly what was compared.",
  },
  {
    rule: "umami_zero_recorded",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: [],
    why: "Whether the Umami instance recorded anything at all is a row lookup answerable at any traffic volume, not a statistics question — no threshold makes 'did anything arrive' more honest than checking the stored counters. detectZeroRecorded (umami-rule-checks.ts) reads only the newest metric='stats' row per website; the stored snapshot itself is the rule's entire target set, so unlike event_disappeared this needs no second collection to say something (though it says less without one — see umami_site_traffic_shift).",
  },
  {
    rule: "umami_site_traffic_shift",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["umami_second_window"],
    why: "The pooled, site-wide version of the killed per-page umami_page_traffic_shift: site-wide visitors judged with confidenceInCountChange rather than a per-page count too small to trust alone, matching site_visibility_shift and site_clicks_shift. Gated on pairNonOverlappingWindows finding two stored metric='stats' rows for the same website whose windows do not overlap — deliberately not `second_collection`, which is wired to `facts.comparison.status === \"ready\"` (Search Console's comparison, your-pages.ts:452 / getting-found.ts:341 / site-health.ts:458): reusing it would tell the operator this rule is unblocked because Search Console has two windows, which is not true. On the current daily 28-day cadence a non-overlapping pair exists at roughly day 29 of collection (56 days of coverage); as of 2026-08-28 there is exactly one stored Umami run, so this is doubly inert today — no second window, and no volume to clear MIN_BASELINE even once one exists.",
  },
  {
    rule: "umami_referrer_source_stopped",
    bucket: "beyond_current_volume",
    needsPerTarget: MIN_BASELINE,
    alsoNeeds: ["umami_second_window"],
    why: "A referrer going quiet is behaviour, not wiring, unlike event_disappeared, so it is scored with confidenceInCountChange(before, 0) rather than a hand-picked constant; MIN_BASELINE (confidence.ts) is the volume this would need per source. Pooling referrers cannot recover a single source any more than pooling pages recovers a censored query, hence beyond_current_volume rather than pooled. Same umami_second_window prerequisite as umami_site_traffic_shift, and for the same reason: this also diffs two stored windows, and naming it `second_collection` or `analytics` (both wired to other providers' facts — see umami_site_traffic_shift's why) would misname the real blocker the same way.",
  },
  {
    rule: "non_indexable_pages_found",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["onpage_crawl"],
    why: 'A per-page indexation state read straight from the newest onpage_non_indexable snapshot, split by the documented consequence of each reason value (noindex vs robots.txt vs neither) — no threshold, no volume: "Do not show this page, media, or resource in search results" (developers.google.com/search/docs/crawling-indexing/robots-meta-tag) is binary. checkNonIndexablePages (onpage-rule-checks.ts) returns nothing before a crawl has stored this snapshot kind, so the crawl is a real prerequisite rather than a volume question.',
  },
  {
    rule: "crawl_pages_error_status",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["onpage_crawl"],
    why: "A plain count of rows whose stored status_code cleared the RFC 9110 4xx/5xx boundary, split into the two consequences Google's own HTTP status codes doc documents (removal for 4xx-except-429, a temporary slowdown for 429/5xx) — no threshold invented, and no claim that Google itself has acted, since the crawler reading these pages is DataForSEO's, not Googlebot's. checkPagesErrorStatus (onpage-rule-checks.ts) reads the newest onpage_pages snapshot and returns nothing before one exists.",
  },
  {
    rule: "redirect_chain_present",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["onpage_crawl"],
    why: "A count of redirecting addresses read from totals.totalCount alone (the returned_row_count fallback was deleted in the adversarial review specifically because it turned a deliberately-null total into a clean reading) — no threshold, and Google's redirects documentation names legitimate reasons a site holds redirects, so this is graded as a fact (which address to publish) rather than an error. checkRedirectChainPresent returns a named-absence finding rather than nothing when no onpage_redirect_chains snapshot exists, which is why the crawl is listed as a prerequisite here even though the rule technically never returns an empty array for a missing crawl — the prerequisite banner and the rule's own absence finding say the same thing in two different places, on purpose, since the finding is the more specific of the two.",
  },
  {
    rule: "duplicate_titles_across_pages",
    bucket: "fact",
    needsPerTarget: null,
    // Per the adversarial review's explicit instruction for this rule
    // (docs/handoffs/2026-08-28-parallel-rule-sessions.md, duplicate_titles_across_pages
    // correction 4): "needsPerTarget: null and empty alsoNeeds (a crawl
    // answers it at any traffic level)". Left empty deliberately, even
    // though checkDuplicateTitles files a named-absence finding rather than
    // nothing before a crawl exists — that absence finding is this rule's
    // own way of naming the gap, so a duplicate alsoNeeds banner was judged
    // not to add anything the finding does not already say. Its sibling rule
    // below (duplicate_descriptions_across_pages) was reviewed with the
    // opposite instruction; both are implemented exactly as specified.
    alsoNeeds: [],
    why: "A count of shared-tag-value groups read from returned_row_count (onpage_duplicate_title's total_items_count is always null at the provider, confirmed against DataForSEO's documented response shape) — no threshold. Google, title-link doc: \"we may try to generate an improved title link from anchors, on-page text, or other sources\" when it detects an issue, which duplicate titles are a documented trigger for (developers.google.com/search/docs/appearance/title-link) — appearance and click-through, never a ranking claim. Routed to the pages category by finding-router.ts's own CATEGORY_BY_RULE entry, already committed there ahead of this rule shipping; this file adds no routing of its own.",
  },
  {
    rule: "duplicate_descriptions_across_pages",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["onpage_crawl"],
    why: 'Same shape as duplicate_titles_across_pages, one snapshot kind over (onpage_duplicate_description). Google, snippet doc: "Identical or similar descriptions on every page of a site aren\'t helpful when individual pages appear in search results" (developers.google.com/search/docs/appearance/snippet) — appearance and click-through only. checkDuplicateDescriptions returns a named-absence finding before a readable crawl snapshot exists; the crawl prerequisite is also declared here so the pages-category empty state can name the missing crawl instead of implying missing traffic.',
  },
  {
    rule: "inbound_link_to_error_page",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: [],
    // Deliberately not "backlink_collection": that prerequisite's own copy is
    // "two stored backlink readings, so there is movement to compare", and
    // this rule reads a single backlinks_domain_pages snapshot directly.
    // Gating it on a second collection would misname why the screen is
    // empty, the exact failure PrerequisiteState's own comment warns about.
    why: 'A stored status code on a linked page is a direct read, not an estimate: no traffic volume makes "does this address answer with an error" more or less answerable. Google, HTTP status codes and network errors (https://developers.google.com/search/docs/crawling-indexing/http-network-errors, fetched 2026-08-28): 4xx (except 429) removes the address from the index; 429 and 5xx only slow crawling and eventually drop it. checkInboundLinksToErrorPages (backlink-rule-checks.ts) needs only the newest backlinks_domain_pages snapshot to answer, which is why this has no alsoNeeds beyond the snapshot existing at all.',
  },
  {
    rule: "linked_page_never_audited",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["page_audit"],
    why: "A set difference between two stored tables (backlinks_domain_pages and page_metadata_observations) needs no threshold and cannot fire before either holds rows. checkLinkedPagesNeverAudited returns nothing when page_metadata_observations has no rows for the property, the same guard detectKeywordsWithoutPage uses (targeting-rules.ts:84-85), so page_audit is the real prerequisite. backlink_collection is deliberately not listed: its own copy names a second reading needed for movement, which this rule does not compare against.",
  },
  {
    rule: "link_profile_coverage_partial",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["backlink_collection"],
    why: "A comparison of two stored counts (a snapshot's own row count against its own or the summary's total) is a fact read straight off stored rows, confidence 1, no threshold — BACKLINKS_CONFIG.referringDomainLimit decides the cap, never a copied 200. checkLinkProfileCoveragePartial reads the same two backlinks_referring_domains snapshots referring_domain_movement diffs, so it cannot answer before backlink_collection's two stored readings exist either.",
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
  whois_collection:
    "a whois read across your tracked and candidate domains, so there is registration data to compare",
  technology_collection:
    "a stored technology stack for two or more of your tracked and candidate domains",
  brand_mention_collection:
    "a brand-mention read, so there is something to check for your name on other sites",
  referring_domain_collection:
    "a stored referring-domain read, so there is a list of sites linking to you to check a mention against",
  reviewed_competitor_set:
    "at least one competitor candidate reviewed, so there is a known set to match a mention against",
  umami_second_window: "a second Umami reading whose window does not overlap the first",
  onpage_crawl: "a site crawl to have been collected, so there is a reading to check",
};

const PREREQUISITE_STATE_KEY: Record<Prerequisite, keyof PrerequisiteState> = {
  second_collection: "secondCollection",
  page_audit: "pageAudit",
  analytics: "analytics",
  url_inspection: "urlInspection",
  approved_keywords: "approvedKeywords",
  backlink_collection: "backlinkCollection",
  whois_collection: "whoisCollection",
  technology_collection: "technologyCollection",
  brand_mention_collection: "brandMentionCollection",
  referring_domain_collection: "referringDomainCollection",
  reviewed_competitor_set: "reviewedCompetitorSet",
  umami_second_window: "umamiSecondWindow",
  onpage_crawl: "onpageCrawl",
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
