import type { ModuleDefinition } from "../types";

/**
 * DataForSEO enters AOOS as one observation capability per data family, so the
 * registry keeps stating exactly what is wired. All are
 * read-only: nothing here can change a site, a SERP, or a link.
 */
export const definition: ModuleDefinition = {
  module: "dataforseo",
  capabilities: [
    {
      key: "cap.dataforseo_labs",
      name: "DataForSEO Labs",
      kind: "api",
      category: "Organic",
      description:
        "Keyword intelligence from the DataForSEO Labs database. Labs proposes a keyword set; a human approves it. Values are estimates, never authoritative for owned performance: Search Console remains the truth for that.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        {
          name: "keywords.for_site",
          description: "Keywords the provider already associates with the owned domain.",
          mutates: false,
        },
        {
          name: "keywords.suggest",
          description: "Expansions of the property's own Search Console queries.",
          mutates: false,
        },
        {
          name: "keywords.ranked",
          description: "Collect the ranked keyword landscape for a domain.",
          mutates: false,
        },
        {
          name: "labs.domain_intersection",
          description:
            "Compare the owned domain against one approved competitor and list the searches only they rank for. Operator-triggered; results enter the keyword approval queue.",
          mutates: false,
        },
        {
          name: "labs.bulk_keyword_difficulty",
          description:
            "Score how hard every pending keyword candidate is to win. One task for the whole queue, operator-triggered.",
          mutates: false,
        },
        {
          name: "labs.search_intent",
          description:
            "Classify what each pending keyword candidate is being searched for. One task for the whole queue, operator-triggered.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        evidenceLabel: "estimated",
        cadence: "weekly",
        mode: "live",
        requiresApproval: "keyword_set",
        monthlyBudgetUsd: 300,
        digest: "docs/integrations/dataforseo/DIGEST.md",
        note: "Intersection-based competitor discovery is deliberately retired: it returns social and directory domains for thin-footprint sites. Competitors are derived from observed SERPs instead.",
      },
    },
    {
      key: "serp.competitors",
      name: "SERP competitor derivation",
      kind: "internal_module",
      category: "Organic",
      description:
        "Rebuilds the competitor set from the SERPs AOOS actually observed. A domain becomes a competitor by repeatedly ranking for approved keywords, not by sharing a couple of keywords in a database. Aggregators and social networks are classified as surfaces, never competitors.",
      integrationState: "real",
      operations: [
        {
          name: "competitors.derive",
          description: "Re-read stored SERP snapshots and classify ranking domains.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        costUsd: 0,
        evidenceLabel: "observed",
        source: "stored_serp_snapshots",
      },
    },
    {
      key: "serp.competitor_intelligence",
      name: "Competitor intelligence pass",
      kind: "internal_module",
      category: "Organic",
      description:
        "Second pass over stored SERP evidence. Profiles every observed domain with keyword overlap, SERP share, position statistics, head to head wins and losses against the owned property, and SERP features, then scores significance and selects a small shortlist for deeper observation. Classification stays heuristic: ranking is never treated as proof of business competition.",
      integrationState: "real",
      operations: [
        {
          name: "competitors.profile",
          description: "Recompute evidence-backed competitor profiles from stored SERPs.",
          mutates: false,
        },
        {
          name: "competitors.shortlist",
          description: "Select a reviewable shortlist by significance score.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        costUsd: 0,
        evidenceLabel: "observed",
        source: "stored_serp_snapshots",
        promotesToTracked: false,
        note: "The shortlist is a review queue. Nothing becomes a tracked competitor without operator approval.",
      },
    },
    {
      key: "serp.targeting",
      name: "Targeting pass",
      kind: "internal_module",
      category: "Organic",
      description:
        "Re-reads the approved keyword set against stored SERP snapshots, the pages the audit has read, and the two most recent referring-domain snapshots, and files what it finds as suggestions: an approved search nothing has looked up, an approved search no page is about, and a meaningful change in who links here. Costs nothing and calls no provider.",
      integrationState: "real",
      operations: [
        {
          name: "targeting.derive",
          description: "Re-read approved keywords, stored SERPs and read pages, and file findings.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        costUsd: 0,
        evidenceLabel: "observed",
        source: "stored_keyword_and_serp_rows",
      },
    },
    {
      key: "competitor.page_observation",
      name: "Competitor page observation",
      kind: "api",
      category: "Organic",
      description:
        "Firecrawl inspection of the best-ranking page of each shortlisted competitor. Records page type, intent match, topical coverage, structure, schema, internal linking, and conversion elements as observations. It stores no competitor copy and makes no claim about why a page ranks.",
      integrationState: "real",
      authKind: "api_key",
      operations: [
        {
          name: "page.observe",
          description: "Scrape and normalise one ranking page per shortlisted domain.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        provider: "firecrawl",
        scope: "shortlist_only",
        pagesPerDomain: 1,
        evidenceLabel: "observed",
        contentCopying: "prohibited",
      },
    },
    {
      key: "cap.dataforseo_serp",
      name: "DataForSEO SERP",
      kind: "api",
      category: "Organic",
      description:
        "SERP composition observation. Scheduled collection uses the Standard queue with a postback; Live is reserved for operator-requested real-time investigation.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        {
          name: "serp.queue",
          description: "Queue Standard SERP tasks with a postback callback.",
          mutates: false,
        },
        {
          name: "serp.ingest_postback",
          description: "Store a provider callback as an immutable snapshot.",
          mutates: false,
        },
        {
          name: "serp.live",
          description: "Operator-initiated real-time SERP inspection.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        scheduledMode: "standard",
        liveUse: "operator_requested_only",
        postbackPath: "/api/public/hooks/dataforseo-postback",
        monthlyBudgetUsd: 300,
      },
    },
    {
      key: "cap.dataforseo_backlinks",
      name: "DataForSEO Backlinks",
      kind: "api",
      category: "Authority",
      description:
        "Backlink profile and referring-domain baseline for owned properties. Pay-as-you-go since 2026-07-01: no monthly commitment and no separate paid-access approval. Competitor link-gap analysis is deliberately not enabled yet.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        {
          name: "backlinks.summary",
          description: "Whole-profile authority, spam score, and dofollow split.",
          mutates: false,
        },
        {
          name: "backlinks.referring_domains",
          description: "Referring-domain baseline.",
          mutates: false,
        },
        {
          name: "backlinks.backlinks",
          description: "One backlink per referring domain, deduplicated server-side.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        scope: "owned_properties_only",
        // Corrected 2026-08-10 (digest v1.1.0): DataForSEO removed the $100/mo
        // Backlinks access commitment on 2026-07-01. Nothing here may gate a run
        // on a subscription; only the live API can report access as unavailable.
        pricingModel: "pay_as_you_go",
        costPerRequestUsd: 0.024,
        costPerRowUsd: 0.000036,
        monthlyBudgetUsd: 300,
      },
    },
    {
      key: "cap.dataforseo_onpage",
      name: "DataForSEO OnPage",
      kind: "api",
      category: "Technical",
      description:
        "Site-wide technical crawl of the owned property: status codes, redirect chains, duplicate titles and descriptions, and non-indexable pages. Basic crawl only and capped at 100 pages, because the crawl is billed per page and every quality multiplier costs more than the crawl itself.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        {
          name: "onpage.task_post",
          description: "Queue a capped basic crawl of the owned property.",
          mutates: false,
        },
        {
          name: "onpage.collect",
          description: "Poll tasks_ready and store finished crawls as immutable snapshots.",
          mutates: false,
        },
        {
          name: "onpage.force_stop",
          description: "Operator control that aborts a runaway crawl.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        scope: "owned_properties_only",
        scheduledMode: "standard",
        maxCrawlPages: 100,
        costPerCrawledPageUsd: 0.00015,
        // The digest names crawling everything with a multiplier on as the
        // expensive mistake: resources x3, JavaScript x10, Lighthouse x34,
        // keyword density x2. All four stay unsent, so enabling one is a code
        // change somebody has to read, not a flag somebody can flip.
        multipliersEnabled: [],
        monthlyBudgetUsd: 300,
      },
    },
    {
      key: "cap.dataforseo_domain_analytics",
      name: "DataForSEO Domain Analytics",
      kind: "api",
      category: "Technical",
      description:
        "Technology stack, host country and domain rank for one domain. Whois overview is implemented but deliberately not scheduled: it is defined by its filters, and no filter set follows from the owned property.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        {
          name: "domain_analytics.technologies",
          description: "Tech stack and domain rank for the owned property.",
          mutates: false,
        },
        {
          name: "domain_analytics.whois_overview",
          description:
            "Filtered read of the registered-domain index. Operator-triggered; an unfiltered read is refused before a request is made.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        mode: "live",
        // Live-only family: there is no Standard queue to move a scheduled read
        // onto, so cadence is the only cost control available here.
        cadence: "monthly",
        // The digest publishes no price row for this family; the guard uses the
        // largest cost in the vendor's own documented examples.
        estimatedUsdPerRequest: 0.15,
        monthlyBudgetUsd: 300,
      },
    },
    {
      key: "cap.dataforseo_content_analysis",
      name: "DataForSEO Content Analysis",
      kind: "api",
      category: "Authority",
      description:
        "Where the brand is cited across the web and how those citations read. Evidence only: it files nothing and never claims a mention caused anything. The search term is the owned domain label, the same brand derivation the backlink evidence pass uses.",
      // Path, request parameters and every response field the parser reads are
      // grounded in https://docs.dataforseo.com/v3/content_analysis/search/live/.
      integrationState: "real",
      authKind: "basic",
      operations: [
        {
          name: "content_analysis.search",
          description:
            "Brand mentions with every sentiment connotation the provider reported, uncollapsed.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        mode: "live",
        evidenceLabel: "observed",
        mentionLimit: 100,
        // The digest's cost model covers Backlinks, Labs, SERP and OnPage only.
        // Until an invoice line exists this borrows the Backlinks per-request
        // figure, so the budget guard has a real number to stop on.
        estimatedUsdPerRequest: 0.05,
        monthlyBudgetUsd: 300,
      },
    },
  ],
  workflows: [
    {
      key: "dfs-keyword-discovery",
      name: "DataForSEO keyword discovery",
      description:
        "Proposes a keyword set for the owned domain from provider associations and the property's own Search Console queries, then files it to the Action Center for approval. Nothing is observed until a human approves it.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "suggest", kind: "capability", ref: "cap.dataforseo_labs" }],
        edges: [],
      },
    },
    {
      key: "dfs-backlink-baseline",
      name: "DataForSEO backlink baseline",
      description:
        "Establishes the owned-property backlink and referring-domain baseline as immutable evidence.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "baseline", kind: "capability", ref: "cap.dataforseo_backlinks" }],
        edges: [],
      },
    },
    {
      key: "dfs-serp-observe",
      name: "DataForSEO SERP observation",
      description:
        "Queues Standard SERP tasks for the approved keyword set and stores provider callbacks as immutable snapshots. It fails cleanly when no keyword has been approved.",
      triggerKind: "schedule",
      graph: {
        nodes: [{ key: "queue", kind: "capability", ref: "cap.dataforseo_serp" }],
        edges: [],
      },
    },
    {
      key: "dfs-competitor-derive",
      name: "SERP competitor derivation",
      description:
        "Rebuilds competitor candidates from observed SERP results and classifies aggregators and social networks as surfaces. Costs nothing and never starts recurring tracking on its own.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "derive", kind: "capability", ref: "serp.competitors" }],
        edges: [],
      },
    },
    {
      key: "dfs-targeting-pass",
      name: "Targeting pass",
      description:
        "Turns the approved keyword set, the stored SERP snapshots, and referring-domain movement into suggestions. Costs nothing, calls no provider, and never approves or tracks anything on its own.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "target", kind: "capability", ref: "serp.targeting" }],
        edges: [],
      },
    },
    {
      key: "dfs-competitor-intelligence",
      name: "Competitor intelligence pass",
      description:
        "Profiles every domain observed in the stored SERPs, shortlists a small set by significance, inspects the winning page of each shortlisted domain with Firecrawl, files the observations as knowledge evidence, and re-runs SEO validation so competitor rules become eligible. Nothing is promoted to a tracked competitor: the shortlist is filed for operator review.",
      triggerKind: "manual",
      graph: {
        nodes: [
          { key: "profile", kind: "capability", ref: "serp.competitor_intelligence" },
          { key: "observe", kind: "capability", ref: "competitor.page_observation" },
          { key: "validate", kind: "capability", ref: "seo.validation" },
        ],
        edges: [
          { from: "profile", to: "observe" },
          { from: "observe", to: "validate" },
        ],
      },
    },
    {
      key: "dfs-onpage-audit",
      name: "DataForSEO OnPage audit",
      description:
        "Collects any crawl that has finished since the last pass, then queues a capped basic crawl of the owned property. Manual, because a crawl is billed per page: re-running it on the same day costs nothing, but a schedule would buy a new crawl every tick.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "crawl", kind: "capability", ref: "cap.dataforseo_onpage" }],
        edges: [],
      },
    },
    {
      key: "dfs-domain-technologies",
      name: "DataForSEO domain technologies",
      description:
        "Records the technology stack, host country and domain rank of the owned property as immutable evidence. One row, one charge.",
      triggerKind: "manual",
      graph: {
        nodes: [
          { key: "technologies", kind: "capability", ref: "cap.dataforseo_domain_analytics" },
        ],
        edges: [],
      },
    },
    {
      key: "dfs-brand-mentions",
      name: "DataForSEO brand mentions",
      description:
        "Searches the provider's content index for citations of the owned brand and stores them with the sentiment the provider reported. Read-only: it files no finding and proposes no action.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "mentions", kind: "capability", ref: "cap.dataforseo_content_analysis" }],
        edges: [],
      },
    },
  ],
};
