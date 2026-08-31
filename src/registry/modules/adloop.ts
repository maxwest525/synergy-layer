import type { ModuleDefinition } from "../types";

/**
 * AdLoop — the self-hosted MCP server fronting Google Ads, GA4, Search Console,
 * GTM and Merchant Center on the operator's own box.
 *
 * 67 tools were enumerated live from `https://ads.marky.systems/mcp` on
 * 2026-08-31 (server AdLoop 3.4.7). 41 are readable and 22 can change or spend
 * on a live Google Ads account; `src/lib/adloop/read-only.ts` is the allowlist
 * that keeps the second group unreachable from this application.
 *
 * Only the read tools are listed here. A mutating tool in this registry would
 * read as something AOOS can do, and it deliberately cannot.
 */

const READ = { mutates: false, verified: "docs", verifiedOn: "2026-08-31" } as const;

export const definition: ModuleDefinition = {
  module: "adloop",
  capabilities: [
    {
      key: "cap.adloop",
      name: "AdLoop (self-hosted MCP)",
      kind: "connector",
      category: "Paid media",
      description:
        "Read-only MCP bridge to Google Ads, GA4, Search Console, GTM and Merchant Center. Session-based: initialize, capture Mcp-Session-Id, acknowledge, then call. Every call passes a read-only allowlist before a request is made.",
      integrationState: "real",
      authKind: "bearer",
      operations: [
        {
          name: "session",
          description:
            "MCP handshake. AdLoop refuses anything but initialize without a session id.",
          endpoint: "POST https://ads.marky.systems/mcp",
          verified: "called",
          verifiedOn: "2026-08-31",
          gotcha:
            "Requires Mcp-Session-Id from the initialize response header plus a notifications/initialized acknowledgement. Without either: -32600 Bad Request: Missing session ID. Replies are SSE-framed even for a single result.",
        },
        {
          name: "health_check",
          description: "Server liveness and configured providers.",
          ...READ,
        },
        {
          name: "get_campaign_performance",
          description: "Campaign-level impressions, clicks, cost and conversions.",
          ...READ,
        },
        { name: "get_ad_performance", description: "Ad-level performance.", ...READ },
        { name: "get_keyword_performance", description: "Keyword-level performance.", ...READ },
        { name: "get_search_terms", description: "Search terms that triggered ads.", ...READ },
        {
          name: "get_negative_keywords",
          description: "Negative keywords, lists, and their campaign attachments.",
          ...READ,
        },
        { name: "get_recommendations", description: "Google's own suggestions.", ...READ },
        { name: "get_pmax_performance", description: "Performance Max reporting.", ...READ },
        {
          name: "get_asset_performance",
          description: "Asset and detailed-asset reporting.",
          ...READ,
        },
        {
          name: "get_audience_performance",
          description: "Audience and demographic reporting.",
          ...READ,
        },
        { name: "run_gaql", description: "Arbitrary read-only GAQL query.", ...READ },
        { name: "run_ga4_report", description: "GA4 reporting, including realtime.", ...READ },
        {
          name: "get_tracking_events",
          description: "Configured tracking events and coverage audit.",
          ...READ,
        },
        {
          name: "attribution_check",
          description: "Attribution and conversion analysis.",
          ...READ,
        },
        {
          name: "run_gsc_report",
          description: "Search Console performance; list_gsc_sites enumerates properties.",
          ...READ,
        },
        {
          name: "analyze_page_speed",
          description: "PageSpeed and landing page analysis.",
          ...READ,
        },
        {
          name: "list_gtm_*",
          description:
            "GTM accounts, containers, tags, triggers, variables, workspaces, versions, and workspace diffs.",
          ...READ,
        },
        {
          name: "list_merchant_accounts",
          description: "Merchant Center accounts and feed health.",
          ...READ,
        },
      ],
      config: {
        mutating: false,
        baseUrl: "ADLOOP_BASE_URL",
        credentials: "ADLOOP_API_KEY, matched exactly by Caddy at the edge",
        protocol: "MCP 2025-06-18",
        toolsAdvertised: 67,
        toolsCallable: 41,
        toolsRefused: 22,
        allowlist: "src/lib/adloop/read-only.ts",
        note: "confirm_and_apply and the entire draft_*/pause/enable/remove family are unreachable. The write path has never been exercised on the VPS and is guarded only by require_dry_run and max_daily_budget in server config.",
      },
    },
  ],
};
