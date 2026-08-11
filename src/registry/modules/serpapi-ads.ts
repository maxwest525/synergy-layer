import type { ModuleDefinition } from "../types";

/**
 * Google Ads Transparency intelligence. Phase 1 is read-only and evidence
 * first: it observes what lead vendors have advertised and where those ads
 * lead. It never infers spend, conversions, or performance, and it produces no
 * recommendations until every evidence stage has proven real data quality.
 */
export const definition: ModuleDefinition = {
  module: "serpapi-ads",
  capabilities: [
    {
      key: "cap.serpapi_ads_transparency",
      // Operator-facing name is the product, not the vendor. SerpApi appears
      // only inside connection, account, and ledger detail.
      name: "Google Ads Transparency",
      kind: "api",
      category: "Paid",
      description:
        "Credentialed gate over every SerpApi call: Ads Transparency Center listings, ad detail, and the live Google ads block. One successful request costs one search credit, so cache stays on and forced refresh is operator gated. Transparency answers what an advertiser has run, never how it performed.",
      integrationState: "pending",
      authKind: "api_key",
      operations: [
        { name: "ads.search", description: "List creatives by advertiser or free text.", mutates: false },
        { name: "ads.detail", description: "Full payload for one unseen creative.", mutates: false },
        { name: "ads.live_serp", description: "Point-in-time paid SERP observation.", mutates: false },
      ],
      config: {
        mutating: false,
        provider: "serpapi",
        secret: "SERPAPI_API_KEY",
        evidenceLabel: "observed",
        cachePolicy: "provider_cache_on",
        maxSearchesPerRun: 120,
        digest: "docs/integrations/serpapi/DIGEST.md",
        plan: "docs/integrations/serpapi/PLAN.md",
        prohibited: ["spend_inference", "performance_inference", "ad_generation", "ad_deployment"],
      },
    },
    {
      key: "ads.advertiser_resolution",
      name: "Lead vendor advertiser review",
      kind: "internal_module",
      category: "Paid",
      description:
        "Resolves a vendor domain to Google advertiser candidates. The provider does not disambiguate, so a domain served by several advertiser accounts becomes an operator decision filed to the Inbox. Only a single unambiguous advertiser resolves on its own.",
      integrationState: "pending",
      operations: [
        { name: "advertisers.resolve", description: "Search each watchlist domain and group rows by advertiser ID.", mutates: false },
      ],
      config: { mutating: false, requiresApproval: "ambiguous_advertisers", evidenceLabel: "observed" },
    },
    {
      key: "ads.creative_intelligence",
      name: "Creative intelligence",
      kind: "internal_module",
      category: "Paid",
      description:
        "Immutable creative snapshots per confirmed advertiser, normalized messaging fields, checksum change detection, and clustering into creative families so copy variants do not read as separate strategies. Detail is fetched once per unseen creative ID. Long-running creatives are a durability signal only.",
      integrationState: "pending",
      operations: [
        { name: "creatives.ingest", description: "Paginate creatives, normalize, checksum, cluster.", mutates: false },
        { name: "creatives.families", description: "Rebuild creative families from stored evidence.", mutates: false },
      ],
      config: { mutating: false, evidenceLabel: "observed", contentCopying: "prohibited" },
    },
    {
      key: "ads.landing_page_intelligence",
      name: "Landing page intelligence",
      kind: "api",
      category: "Paid",
      description:
        "Firecrawl observation of each unique ad destination: final URL, offer, CTA, phone versus form, observable form length, trust and licensing statements, broker disclosure, urgency, and template reuse. Page text is hashed for change detection and discarded; no competitor copy is stored.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        { name: "destination.observe", description: "Fetch and normalise one destination per unique ad link.", mutates: false },
      ],
      config: { mutating: false, provider: "firecrawl", evidenceLabel: "observed", contentCopying: "prohibited" },
    },
    {
      key: "ads.live_serp_observation",
      name: "Live paid SERP observation",
      kind: "api",
      category: "Paid",
      description:
        "Observes which advertisers occupy the paid block for the operator-approved keyword set, by location and device. Point-in-time only, stored as a separate evidence type from Transparency history and linkable to advertisers rather than merged with them.",
      integrationState: "pending",
      authKind: "api_key",
      operations: [
        { name: "paid_serp.observe", description: "Sweep approved keywords and store the ads block.", mutates: false },
      ],
      config: { mutating: false, scope: "approved_keywords_only", evidenceLabel: "observed", historical: false },
    },
    {
      key: "ads.vendor_network_analysis",
      name: "Vendor network analysis",
      kind: "internal_module",
      category: "Paid",
      description:
        "Derived from stored evidence with no provider call and no cost. Reports shared destination domains, shared ad funders, repeated offers, and dominant funnel types across advertisers. Shared infrastructure is an observation, never an accusation.",
      integrationState: "real",
      operations: [
        { name: "network.analyze", description: "Recompute overlap across stored advertisers and creatives.", mutates: false },
      ],
      config: { mutating: false, costUsd: 0, evidenceLabel: "derived" },
    },
  ],
  workflows: [
    {
      key: "wf.vendor_ad_discovery",
      name: "Vendor ad discovery",
      description:
        "Resolves each watchlist vendor domain to Google advertiser candidates, then ingests creatives for the advertisers already confirmed. Ambiguous domains stop at an Inbox approval instead of being guessed.",
      triggerKind: "manual",
      graph: {
        nodes: [
          { key: "resolve", kind: "capability", ref: "ads.advertiser_resolution" },
          { key: "creatives", kind: "capability", ref: "ads.creative_intelligence" },
        ],
        edges: [{ from: "resolve", to: "creatives" }],
      },
    },
    {
      key: "wf.vendor_ad_refresh",
      name: "Vendor ad refresh",
      description:
        "Scheduled re-observation of confirmed advertisers. Cache friendly, detail fetched only for unseen creative IDs, absent creatives retired rather than deleted.",
      triggerKind: "schedule",
      graph: {
        nodes: [{ key: "creatives", kind: "capability", ref: "ads.creative_intelligence" }],
        edges: [],
      },
    },
    {
      key: "wf.vendor_landing_page_analysis",
      name: "Vendor landing page analysis",
      description:
        "Follows each unique ad destination once and records funnel observations. An unchanged page costs nothing and is a successful no-change pass.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "destinations", kind: "capability", ref: "ads.landing_page_intelligence" }],
        edges: [],
      },
    },
    {
      key: "wf.vendor_message_synthesis",
      name: "Vendor message synthesis",
      description:
        "Rebuilds creative families and recomputes the vendor network view from stored evidence. Costs nothing and produces observations, not recommendations.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "network", kind: "capability", ref: "ads.vendor_network_analysis" }],
        edges: [],
      },
    },
    {
      key: "wf.live_paid_serp_observe",
      name: "Live paid SERP observation",
      description:
        "Observes the paid block for the approved keyword set. It stops cleanly when no keyword has been approved rather than inventing a query.",
      triggerKind: "schedule",
      graph: {
        nodes: [{ key: "observe", kind: "capability", ref: "ads.live_serp_observation" }],
        edges: [],
      },
    },
  ],
};
