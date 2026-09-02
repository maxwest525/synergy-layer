import type { ModuleDefinition } from "../types";

/**
 * OpenSEO, the operator's own instance (CODE-94).
 *
 * Read from the source at github.com/every-app/open-seo on 2026-09-02, not from
 * a live tools/list: the instance at seo.marky.systems answers /mcp with 401 and
 * this session holds no credential for it. Every operation below is transcribed
 * from src/server/mcp/tools/ in that repository, so the names are exact; nothing
 * here is inferred from a tool's name.
 *
 * Why this module did not exist until now, stated plainly: AOOS wired nine
 * DataForSEO capabilities and none for OpenSEO, so every keyword, SERP and audit
 * call routed to the metered vendor while a self-hosted box that answers most of
 * the same questions sat healthy and unregistered. The operator's standing rule
 * was OpenSEO first.
 *
 * Cost is the axis that matters here, and it is not the axis the provider's own
 * annotations use: OpenSEO sets `readOnlyHint: false` to mark spend rather than
 * writes, so a tool that writes nothing is flagged the same as one that does.
 * Capabilities below are split on cost instead, because that is the decision the
 * router has to make. `mutates` means what it says: the call changes state.
 *
 * The single source of truth for spend is createDataforseoClient() in that repo
 * (src/server/lib/dataforseo/client.ts:84). A tool costs money if and only if its
 * path reaches it.
 *
 * One consequence of self-hosting, recorded because it is a real exposure and
 * not a detail: client.ts:155-160 bypasses the credit gate entirely outside
 * hosted mode, so the paid calls below run against the operator's own
 * DATAFORSEO_API_KEY with no server-side ceiling. Hosted OpenSEO refuses at zero
 * balance; this instance cannot. Anything in the metered capability is therefore
 * an operator click, never a schedule.
 */
export const definition: ModuleDefinition = {
  module: "openseo",
  capabilities: [
    {
      key: "cap.openseo_project_memory",
      name: "OpenSEO project memory",
      kind: "api",
      category: "Organic",
      description:
        "The project's shared, operator-editable memory: typed prose sections, a curated competitor list, a curated key-page list, and a log of what research has already been bought. Free, database-only, and the same rows the operator sees in the OpenSEO app. Reads cost nothing, so nothing needs to cache them.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "get_project_context",
          description:
            "Read the whole memory plus a rendered digest. Also returns missingSections, which is what tells a caller which sections still need filling.",
          mutates: false,
        },
        {
          name: "update_project_context",
          description:
            "Apply up to 50 patch operations in one atomic batch: set or clear a typed section, add or remove competitors and key pages, append a research log entry. The batch is validated before the first write, so a call that trips a cap writes nothing.",
          mutates: true,
        },
      ],
      config: {
        mutating: true,
        evidenceLabel: "stated",
        mode: "live",
        cost: "free",
        note: "Typed section keys are exactly business_overview, current_goal, positioning and writing_preferences. Caps: 4000 chars a section, 100 competitors, 100 key pages, 1000 chars a log entry, 90 day log retention. An omitted key-page role preserves the operator's own label rather than clearing it.",
      },
    },
    {
      key: "cap.openseo_projects",
      name: "OpenSEO projects",
      kind: "api",
      category: "Organic",
      description:
        "Account and project enumeration. Free. 43 of OpenSEO's 46 tools require a projectId, so this is the mandatory bootstrap: list, and create one only if none exists.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "whoami",
          description: "Which account and mode the instance is serving.",
          mutates: false,
        },
        {
          name: "list_projects",
          description: "Every project, with its default market.",
          mutates: false,
        },
        {
          name: "create_project",
          description:
            "Create a project. Its locationCode and languageCode become the default market roughly twenty other tools fall back to.",
          mutates: true,
        },
      ],
      config: { mutating: true, evidenceLabel: "stated", mode: "live", cost: "free" },
    },
    {
      key: "cap.openseo_search_console",
      name: "OpenSEO Search Console reads",
      kind: "api",
      category: "Organic",
      description:
        "Search Console through the operator's own Google authorisation. Free: no provider call is metered. First-party truth about the site's own performance, which is why it is the right starting point before any estimate is bought.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "get_search_console_performance",
          description:
            "Clicks, impressions, CTR and position by up to four dimensions, with up to five filters. Sorted by clicks by the provider, so a position band has to be filtered by the caller.",
          mutates: false,
        },
        {
          name: "inspect_urls",
          description:
            "Index and coverage state for up to ten URLs: last crawl, canonicals, mobile and rich-result verdicts.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        evidenceLabel: "measured",
        mode: "live",
        cost: "free",
        note: "Returns { ok: false, reason, connectUrl } rather than throwing when Search Console is not connected. A caller must branch on that, not on the call succeeding.",
      },
    },
    {
      key: "cap.openseo_analytics",
      name: "OpenSEO Analytics reads",
      kind: "api",
      category: "Behaviour",
      description:
        "Ten GA4 reads through the operator's own Google authorisation. Free. Covers organic overview and landing pages, traffic acquisition, key events, ecommerce, audience, page performance, site search, measurement health, and the joined search-opportunity view.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "get_google_analytics_organic_overview",
          description: "Top-line organic metrics against the previous period, with a trend series.",
          mutates: false,
        },
        {
          name: "get_google_analytics_organic_landing_pages",
          description: "Organic landing pages by sessions, engagement, key events and revenue.",
          mutates: false,
        },
        {
          name: "get_google_analytics_traffic_acquisition",
          description: "Sessions by channel group, source and medium, or campaign.",
          mutates: false,
        },
        {
          name: "get_google_analytics_key_events",
          description: "Key event counts and users, by event or by event and landing page.",
          mutates: false,
        },
        {
          name: "get_google_analytics_ecommerce_performance",
          description: "Item or landing-page revenue, transactions, views and adds to cart.",
          mutates: false,
        },
        {
          name: "get_google_analytics_audience_breakdown",
          description: "Users and sessions by device, country, or new against returning.",
          mutates: false,
        },
        {
          name: "get_google_analytics_page_performance",
          description: "Page views, users and engagement duration.",
          mutates: false,
        },
        {
          name: "get_google_analytics_site_search",
          description: "Internal search terms and the events behind them.",
          mutates: false,
        },
        {
          name: "get_google_analytics_measurement_health",
          description:
            "Streams, key events and custom definitions, with the problems found in them.",
          mutates: false,
        },
        {
          name: "get_search_opportunities",
          description:
            "Search Console pages sitting at position four to twenty, joined to their GA4 landing-page behaviour and scored by demand, value and reachability.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        evidenceLabel: "measured",
        mode: "live",
        cost: "free",
        note: "Every one of these returns { status: 'ok' | 'error' } in the body. A missing connection is status 'error' with an actionUrl, not a failed call.",
      },
    },
    {
      key: "cap.openseo_site_audit",
      name: "OpenSEO site audit",
      kind: "api",
      category: "Technical",
      description:
        "A full crawl on the instance's own compute. Free at its default setting, and this is the capability AOOS most obviously duplicated: cap.dataforseo_onpage buys the same answers.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "run_site_audit",
          description:
            "Start a crawl of up to 10000 pages. Free while runLighthouse stays false, which is its default; turning it on buys up to twenty DataForSEO Lighthouse checks.",
          mutates: true,
        },
        {
          name: "get_audit_status",
          description:
            "Crawl phase and progress. May reconcile a dead run by marking its audit failed.",
          mutates: true,
        },
        {
          name: "get_audit_issues",
          description: "Issues by severity and type, each carrying its own how-to-fix text.",
          mutates: false,
        },
        {
          name: "get_audit_pages",
          description:
            "Every crawled page: status, title, description, word count, indexability, depth and link counts.",
          mutates: false,
        },
      ],
      config: {
        mutating: true,
        evidenceLabel: "measured",
        mode: "live",
        cost: "free_by_default",
        note: "runLighthouse true is the one paid path, and it is the caller's choice each time. Capacity refusals come back as readable text with no auditId, not as an error.",
      },
    },
    {
      key: "cap.openseo_saved_keywords",
      name: "OpenSEO saved keywords",
      kind: "api",
      category: "Organic",
      description:
        "The keyword set and its tags, stored in the instance's own database. Free. Tags are how a cluster is recorded, which is the store AOOS lacked when it grouped fifty approved keywords into fourteen targets with no way to keep the grouping.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "list_saved_keywords",
          description: "Saved keywords, optionally filtered by text or by tags.",
          mutates: false,
        },
        {
          name: "save_keywords",
          description:
            "Save up to a hundred keywords with their metrics and tags. Appends tags by default; replace mode deletes the tags already there.",
          mutates: true,
        },
      ],
      config: { mutating: true, evidenceLabel: "stated", mode: "live", cost: "free" },
    },
    {
      key: "cap.openseo_rank_tracking_setup",
      name: "OpenSEO rank tracker setup",
      kind: "api",
      category: "Organic",
      description:
        "Creating and editing rank trackers, which AOOS has no equivalent of at all. Free to configure. A tracker is created on a manual schedule so that setting one up cannot by itself cause future spend.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "create_rank_tracker",
          description:
            "Create a tracker for a domain, market, device set and SERP depth. Defaults to a manual schedule.",
          mutates: true,
        },
        {
          name: "get_rank_tracker",
          description: "List trackers, or read one with its latest results.",
          mutates: false,
        },
        {
          name: "add_rank_tracking_keywords",
          description:
            "Add up to two thousand keywords. Free to add, but on a scheduled tracker this arms recurring paid checks.",
          mutates: true,
        },
        {
          name: "remove_rank_tracking_keywords",
          description: "Remove tracked keywords. Historical snapshots are kept.",
          mutates: true,
        },
        {
          name: "estimate_rank_tracker_cost",
          description: "What a check would cost, before one is run.",
          mutates: false,
        },
      ],
      config: {
        mutating: true,
        evidenceLabel: "stated",
        mode: "live",
        cost: "free",
        note: "The maxEstimatedScheduledCheckCredits argument is an estimate the operator approved, not a ceiling the runtime enforces. Only run_rank_tracker takes a real cap.",
      },
    },
    {
      key: "cap.openseo_local_categories",
      name: "OpenSEO business categories",
      kind: "api",
      category: "Local",
      description:
        "Google Business category lookup. The one DataForSEO endpoint OpenSEO calls unmetered, deliberately, so an account at zero balance can still list categories.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "list_business_categories",
          description: "Categories and how many businesses hold each.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        evidenceLabel: "stated",
        mode: "live",
        cost: "free",
        note: "Cached seven days.",
      },
    },
    {
      key: "cap.openseo_metered_research",
      name: "OpenSEO metered research",
      kind: "api",
      category: "Organic",
      description:
        "Every OpenSEO tool that reaches DataForSEO. Grouped as one capability because they share the one thing that governs them: they spend the operator's own money, and on a self-hosted instance nothing stops them. Operator click only; never a schedule.",
      integrationState: "pending",
      authKind: "basic",
      operations: [
        {
          name: "research_keywords",
          description:
            "Expand up to five seeds. Roughly thirty to a hundred credits a seed; clickstream data doubles it. Cached a day.",
          mutates: false,
        },
        {
          name: "get_keyword_metrics",
          description:
            "Hydrate up to seven hundred known keywords with volume, difficulty, intent and cost per click.",
          mutates: false,
        },
        {
          name: "get_serp_results",
          description:
            "Live results for up to ten queries. Roughly five credits a keyword at the default depth.",
          mutates: false,
        },
        {
          name: "get_ranked_keywords",
          description:
            "Every keyword a target ranks for, filtered by rank, volume and result type.",
          mutates: false,
        },
        {
          name: "get_domain_overview",
          description: "Traffic, keyword and link totals for a domain. Cached twelve hours.",
          mutates: false,
        },
        {
          name: "get_domain_keyword_suggestions",
          description: "Keywords a domain already ranks for. Cached twelve hours.",
          mutates: false,
        },
        {
          name: "find_serp_competitors",
          description: "Who else ranks across a query set. Up to a hundred keywords.",
          mutates: false,
        },
        {
          name: "get_backlinks_overview",
          description:
            "Link and referring-domain totals. Two metered calls at domain scope. Cached six hours.",
          mutates: false,
        },
        {
          name: "get_backlinks_profile",
          description: "Individual backlinks, filtered and paged. Roughly thirty credits a page.",
          mutates: false,
        },
        {
          name: "run_rank_tracker",
          description:
            "Run the tracked keywords now. The only operation here with an enforced spend ceiling, through maxCostCredits.",
          mutates: true,
        },
        {
          name: "search_local_businesses",
          description: "Businesses near a point, filtered by category, rating and review count.",
          mutates: false,
        },
        {
          name: "get_local_serp_results",
          description: "Maps or local-finder results near a point.",
          mutates: false,
        },
        {
          name: "get_business_profile",
          description: "One listing: categories, rating, hours, claim status.",
          mutates: false,
        },
        {
          name: "get_business_reviews",
          description: "Reviews, billed per ten. Resuming a started task with its id is free.",
          mutates: false,
        },
        {
          name: "get_business_updates",
          description: "Posts on a listing. Same task model as reviews.",
          mutates: false,
        },
        {
          name: "get_google_business_questions",
          description: "Questions and answers on a listing.",
          mutates: false,
        },
        {
          name: "get_local_rank_grid",
          description:
            "Rank at every point of a grid around a location. The most expensive call on the instance: one paid SERP lookup per point, so a three by three is nine and a five by five is twenty-five.",
          mutates: false,
        },
      ],
      config: {
        mutating: true,
        evidenceLabel: "estimated",
        mode: "live",
        cost: "metered",
        requiresApproval: "operator_click",
        note: "Self-hosted bypasses OpenSEO's own credit gate, so these run against the operator's DataForSEO account with no server-side ceiling. No per-call cost comes back in the response either: creditsCharged is declared in the envelope and never populated. Spend has to be modelled by the caller or read from the provider's dashboard.",
      },
    },
  ],
};
