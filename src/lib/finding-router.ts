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
 * The category for one recommendation.
 *
 * Falls back to Your pages only when neither the rule nor the module is
 * recognised, since page-level work is the safest place for something we cannot
 * place. That fallback should stay rare; when it starts catching a whole module,
 * that module belongs in the table above.
 */
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
