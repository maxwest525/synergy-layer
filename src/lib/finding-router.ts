/**
 * Which category a finding belongs to.
 *
 * This is the router every queue count depends on, and it was wrong. It keyed
 * only on `source_module`, so all ten `seo-validation` rules fell through the
 * default arm into Your pages, including the two that are plainly about
 * competitors. And nothing anywhere could return `health`, so Site health was a
 * category no finding could ever land in.
 *
 * The fix is to route on the most specific thing the row actually stores.
 * Writers put the rule id in `recommendations.metadata.rule`
 * (`search-console-rules.server.ts` and `seo-validation.server.ts` both do), so
 * the rule decides when it is known and the module decides otherwise. That
 * matters because one module's rules do not all belong in one category:
 * `seo-validation` raises both "your clicks are falling" and "a competitor
 * outranks you", which are different questions to the operator.
 */

import type { CategoryId } from "./categories";

/**
 * Rules whose category is not the one their writer would imply.
 *
 * Anything absent from here falls back to its module, so a new rule in an
 * existing module keeps working without an entry.
 */
const CATEGORY_BY_RULE: Record<string, CategoryId> = {
  // seo-validation, performance half: these are all Search Console questions.
  declining_clicks: "search",
  declining_impressions: "search",
  declining_position: "search",
  high_impression_low_ctr: "search",
  zero_click_page: "search",
  possible_query_overlap: "search",
  significant_period_change: "search",
  research_page_traction: "search",

  // seo-validation, competitive half: a different question entirely.
  competitor_outranks_owned: "competition",
  owned_absent_from_approved_serps: "competition",

  // search-console rules, named explicitly so the mapping is readable rather
  // than implied by their module.
  striking_distance_query: "search",
  position_loss: "search",
  weak_ctr_page: "search",
  visibility_gain: "search",
  zero_impression_page: "search",
  query_coverage_gap: "search",
  index_coverage_drift: "search",
  site_visibility_shift: "search",
  site_clicks_shift: "search",

  // Targeting rules: what to be found for, so they belong with the rest of
  // Getting found on Google rather than with the competitor questions their
  // module (dataforseo) otherwise implies.
  approved_keyword_unobserved: "search",
  approved_keyword_no_page: "search",
  approved_keyword_multiple_pages: "search",
  tracked_set_has_no_route_query: "search",
  // Off-site domains are a competitive question, not a page one.
  referring_domain_movement: "competition",

  // Site audit, from the OnPage crawl. `health` was a category no finding
  // could reach until these: eight OnPage endpoints were collected and read by
  // nothing, so the crawl answered questions nobody was asking.
  non_indexable_pages_found: "health",
  crawl_pages_error_status: "health",
  redirect_chain_present: "health",
  crawl_hit_its_page_cap: "health",
  crawl_result_truncated: "health",
  crawl_started_never_collected: "health",
  // Duplicate title and description are about the pages themselves, not the
  // crawl's health, so they route with the rest of the page findings.
  duplicate_titles_across_pages: "pages",
  duplicate_descriptions_across_pages: "pages",

  // Backlinks. Five of six endpoints were collected and read by nothing; these
  // two are about a page of ours, and the third about our view of the profile.
  inbound_link_to_error_page: "pages",
  linked_page_never_audited: "pages",
  link_profile_coverage_partial: "competition",

  // GA4. The module already routes these to visitors; they are named here
  // because the waiting-on banner counts rules by category and must not
  // guess from a module it does not know.
  page_traffic_loss: "visitors",
  page_traffic_gain: "visitors",
  zero_engagement_page: "visitors",
  event_disappeared: "visitors",
  event_silent_yesterday: "visitors",

  // Umami. cap.umami is real and snapshots exist, but the visitors category
  // had no Umami rule to fill it.
  umami_tracking_silent: "visitors",
  umami_site_traffic_shift: "visitors",
  umami_referrer_source_stopped: "visitors",

  // Labs, Domain Analytics and Content Analysis. The ownership pair files an
  // operator decision and never asserts a link, per COMPETITIVE_MODEL.md.
  overlap_list_reached_the_row_limit: "competition",
  same_registration_details_across_two_known_domains: "competition",
  identical_technology_stack_across_two_known_domains: "competition",
  rival_page_mentions_your_brand: "competition",
  brand_mentioned_without_a_link: "competition",
};

const CATEGORY_BY_MODULE: Record<string, CategoryId> = {
  "search-console": "search",
  "seo-validation": "search",
  ga4: "visitors",
  umami: "visitors",
  "competitor-intelligence": "competition",
  dataforseo: "competition",
  "ads.advertiser_resolution": "competition",
  "page-audit": "pages",
  "site-audit": "health",
  workflows: "connections",
  openseo: "pages",
};

/** Read `metadata.rule` without trusting the shape of a jsonb column. */
export function ruleFromMetadata(metadata: unknown): string | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rule = (metadata as Record<string, unknown>)["rule"];
  return typeof rule === "string" && rule.length > 0 ? rule : null;
}

/**
 * The page address a rule finding points at, read from its stored
 * `suggested_action.target`, or null when the finding targets no page.
 *
 * Every rule writer stores a target there, but not every target is a page: a
 * query rule targets a search term, a site-level rule the literal `site`, a
 * competitor rule a bare domain. Only a URL is returned, because the queue
 * renders this as the card's page address, and the coverage-gap rule's
 * `page :: query` form is split the same way `deriveFixTarget` splits it.
 */
export function pageUrlFromSuggestedAction(suggestedAction: unknown): string | null {
  if (
    suggestedAction === null ||
    typeof suggestedAction !== "object" ||
    Array.isArray(suggestedAction)
  ) {
    return null;
  }
  const target = (suggestedAction as Record<string, unknown>)["target"];
  if (typeof target !== "string") return null;
  const page = target.split(" :: ")[0] ?? "";
  return page.startsWith("http") ? page : null;
}

/**
 * The category for one recommendation.
 *
 * Falls back to Your pages only when neither the rule nor the module is
 * recognised, since page-level work is the safest place for something we cannot
 * place. That fallback should stay rare; when it starts catching a whole module,
 * that module belongs in the table above.
 */
/** The category a rule names for itself, or null when only its module could say. */
export function categoryForRule(rule: string): CategoryId | null {
  return CATEGORY_BY_RULE[rule] ?? null;
}

export function categoryForFinding(sourceModule: string | null, metadata: unknown): CategoryId {
  const rule = ruleFromMetadata(metadata);
  if (rule !== null) {
    const byRule = CATEGORY_BY_RULE[rule];
    if (byRule !== undefined) return byRule;
  }
  if (sourceModule !== null) {
    const byModule = CATEGORY_BY_MODULE[sourceModule];
    if (byModule !== undefined) return byModule;
  }
  return "pages";
}

/**
 * Which category a change request belongs to.
 *
 * A change request drafted from a finding inherits that finding's category, so
 * a title fix raised by a search rule stays in Getting found on Google rather
 * than jumping to Your pages the moment it is drafted. Only when there is no
 * originating finding does the proposal type decide.
 */
export function categoryForChangeRequest(
  proposalType: string | null,
  originCategory: CategoryId | null,
): CategoryId {
  if (originCategory !== null) return originCategory;
  return proposalType === "site.crawl_directives" ? "health" : "pages";
}
