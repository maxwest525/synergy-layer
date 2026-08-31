/**
 * Which AdLoop tools this application is allowed to call.
 *
 * AdLoop fronts a live Google Ads account. Of the 67 tools its MCP server
 * advertises, 22 can change or spend on that account: the whole `draft_*`
 * family, `update_*`, `add_*`, the shared-set attach/detach pair,
 * `pause_entity` / `enable_entity` / `remove_entity`, and `confirm_and_apply`,
 * which is the one that commits a staged change to Google.
 *
 * The only things standing between those and real spend are two lines of
 * server-side config on the VPS (`require_dry_run: true`, `max_daily_budget:
 * 50.0`), and per the operator's own record the write path has never been
 * exercised there — so it is unproven in both directions. A bridge that can
 * reach it would make an untested write path reachable from a web request.
 *
 * So this is an allowlist, not a blocklist. A tool AdLoop adds in a future
 * version is refused until someone puts it here on purpose, which is the
 * behaviour that fails safe when the server surface grows.
 *
 * Enumerated live from `https://ads.marky.systems/mcp` on 2026-08-31,
 * server AdLoop 3.4.7.
 */

export const ADLOOP_READ_ONLY_TOOLS = [
  // Session and account shape
  "health_check",
  "get_account_summaries",
  "list_accounts",
  "run_gaql",

  // GA4 and measurement
  "run_ga4_report",
  "run_realtime_report",
  "get_tracking_events",
  "audit_event_coverage",
  "attribution_check",
  "analyze_campaign_conversions",

  // Search Console
  "list_gsc_sites",
  "run_gsc_report",

  // Page performance
  "analyze_page_speed",
  "landing_page_analysis",

  // Merchant Center
  "list_merchant_accounts",
  "get_merchant_feed_health",

  // Google Ads reporting
  "get_campaign_performance",
  "get_ad_performance",
  "get_keyword_performance",
  "get_search_terms",
  "get_negative_keywords",
  "get_negative_keyword_lists",
  "get_negative_keyword_list_keywords",
  "get_negative_keyword_list_campaigns",
  "get_recommendations",
  "get_pmax_performance",
  "get_asset_performance",
  "get_detailed_asset_performance",
  "get_audience_performance",
  "get_demographic_targeting",

  // Google Tag Manager
  "list_gtm_accounts",
  "list_gtm_containers",
  "list_gtm_tags",
  "get_gtm_tag",
  "list_gtm_triggers",
  "get_gtm_trigger",
  "list_gtm_variables",
  "list_gtm_workspaces",
  "get_gtm_workspace_diff",
  "list_gtm_versions",
  "get_gtm_version",
] as const;

export type AdLoopReadOnlyTool = (typeof ADLOOP_READ_ONLY_TOOLS)[number];

const ALLOWED = new Set<string>(ADLOOP_READ_ONLY_TOOLS);

/**
 * Tools that read but bill or consume provider quota. They are not on the
 * allowlist: they are named so the reason is recorded rather than looking like
 * an oversight the next reader should "fix".
 *
 * `estimate_budget` and `discover_keywords` hit the Google Ads planning
 * services; `validate_tracking` and `generate_tracking_code` are cheap but
 * write-adjacent enough to want a deliberate decision.
 */
export const ADLOOP_DEFERRED_TOOLS = [
  "estimate_budget",
  "discover_keywords",
  "validate_tracking",
  "generate_tracking_code",
] as const;

export function isAdLoopReadOnlyTool(name: string): name is AdLoopReadOnlyTool {
  return ALLOWED.has(name);
}
