/**
 * The honest coverage inventory.
 *
 * One row per provider operation we could call, for every connection AOOS has.
 * Status is a claim about this repository, not about the provider:
 *
 *   wired     - code in this repo calls the operation. `evidence` names the file.
 *   partial   - code calls it, but a stated limitation means the operation is
 *               not fully covered. `gap` says exactly what is missing.
 *   not_built - nothing in this repo calls it. `gap` says what it would give us.
 *
 * Nothing here asserts that a call succeeded at runtime. Proven runtime health
 * lives in the connection probes and stored snapshots, not in this file.
 */

export type SurfaceStatus = "wired" | "partial" | "not_built";

export type SurfaceOperation = {
  id: string;
  /** Provider operation name, as the provider names it. */
  operation: string;
  /** Plain language: what calling it would give the operator. */
  purpose: string;
  status: SurfaceStatus;
  /** True when the call changes state at the provider. */
  mutates?: boolean;
  /** File in this repo that calls it. Present for wired and partial rows. */
  evidence?: string;
  /** Exactly what is missing. Present for partial and not_built rows. */
  gap?: string;
};

export type SurfaceConnection = {
  key: string;
  label: string;
  provider: string;
  /** How this connection authenticates, in the terms the operator set it up with. */
  auth: string;
  note?: string;
  operations: SurfaceOperation[];
};

const op = (value: SurfaceOperation): SurfaceOperation => value;

export const CONNECTION_SURFACES: SurfaceConnection[] = [
  {
    key: "google_search_console",
    label: "Google Search Console",
    provider: "Google",
    auth: "Lovable connector gateway",
    note: "Selected property sc-domain:trumoveinc.com, siteOwner access.",
    operations: [
      op({
        id: "gsc.sites.list",
        operation: "sites.list",
        purpose: "List the verified properties this account can read.",
        status: "wired",
        evidence: "src/lib/search-console.server.ts",
      }),
      op({
        id: "gsc.searchanalytics.query",
        operation: "searchAnalytics.query",
        purpose: "Clicks, impressions, CTR and position by date, page and query.",
        status: "partial",
        evidence: "src/lib/search-console.server.ts",
        gap: "Only date, page and query dimensions are stored. Country, device, search appearance and search type (image, video, news, discover) are never requested, so no device or geography evidence exists.",
      }),
      op({
        id: "gsc.urlinspection.inspect",
        operation: "urlInspection.index.inspect",
        purpose: "Index state, canonical Google picked, crawl date, rich result state per URL.",
        status: "partial",
        evidence: "src/lib/search-console.server.ts",
        gap: "Callable, but nothing inspects the page set on a schedule, so index coverage is only known for URLs someone inspected by hand.",
      }),
      op({
        id: "gsc.sitemaps.list",
        operation: "sitemaps.list",
        purpose: "Every submitted sitemap with its error and warning counts.",
        status: "wired",
        evidence: "src/lib/search-console.server.ts",
      }),
      op({
        id: "gsc.sitemaps.get",
        operation: "sitemaps.get",
        purpose: "One sitemap's last download, contents and reported errors.",
        status: "wired",
        evidence: "src/lib/search-console.server.ts",
      }),
      op({
        id: "gsc.sitemaps.submit",
        operation: "sitemaps.submit",
        purpose: "Submit or resubmit a sitemap after the page set changes.",
        status: "not_built",
        mutates: true,
        gap: "No approval-routed submit exists. A new or changed sitemap is never announced to Google from here.",
      }),
      op({
        id: "gsc.sitemaps.delete",
        operation: "sitemaps.delete",
        purpose: "Withdraw a stale or wrong sitemap.",
        status: "not_built",
        mutates: true,
        gap: "Not built. Stale sitemaps stay submitted.",
      }),
      op({
        id: "gsc.sites.add",
        operation: "sites.add",
        purpose: "Add a verified property so a new site becomes readable.",
        status: "not_built",
        mutates: true,
        gap: "Not built. Onboarding a second site needs manual work in Google's console.",
      }),
      op({
        id: "gsc.sites.delete",
        operation: "sites.delete",
        purpose: "Remove a property from the account.",
        status: "not_built",
        mutates: true,
        gap: "Not built.",
      }),
      op({
        id: "gsc.siteverification",
        operation: "siteVerification.token / webResource.insert",
        purpose: "Prove ownership of a new domain before it can be read.",
        status: "not_built",
        mutates: true,
        gap: "Not built. Verification is a manual step outside AOOS.",
      }),
    ],
  },
  {
    key: "google_analytics_4",
    label: "Google Analytics 4",
    provider: "Google",
    auth: "Service account JSON",
    note: "Property properties/536830122.",
    operations: [
      op({
        id: "ga4.runreport",
        operation: "Data API runReport",
        purpose: "Sessions, users, engagement and conversions by dimension.",
        status: "partial",
        evidence: "src/lib/measurement/ga4.server.ts",
        gap: "One fixed report shape. No landing page, channel grouping, or event level breakdown, so traffic cannot be attributed to a page change.",
      }),
      op({
        id: "ga4.runrealtimereport",
        operation: "Data API runRealtimeReport",
        purpose: "Who is on the site right now.",
        status: "not_built",
        gap: "Not built. No live traffic read.",
      }),
      op({
        id: "ga4.batchrunreports",
        operation: "Data API batchRunReports",
        purpose: "Several reports in one call, cheaper for daily snapshots.",
        status: "not_built",
        gap: "Not built. Each report costs a separate round trip.",
      }),
      op({
        id: "ga4.checkcompatibility",
        operation: "Data API checkCompatibility",
        purpose: "Validate a dimension and metric pairing before requesting it.",
        status: "not_built",
        gap: "Not built. Bad report definitions fail at request time instead of being caught first.",
      }),
      op({
        id: "ga4.admin.accounts",
        operation: "Admin API accounts.list / properties.list",
        purpose: "Discover which properties this service account can actually read.",
        status: "not_built",
        gap: "Not built. The property ID is configured by hand and never confirmed against the account.",
      }),
      op({
        id: "ga4.admin.datastreams",
        operation: "Admin API properties.dataStreams.list",
        purpose: "Read the measurement ID and stream config the site should be sending to.",
        status: "not_built",
        gap: "Not built. Nothing checks that the site's tag matches the property being read.",
      }),
      op({
        id: "ga4.admin.conversionevents",
        operation: "Admin API conversionEvents.list / create",
        purpose: "See and define which events count as conversions.",
        status: "not_built",
        mutates: true,
        gap: "Not built. Conversion definitions are invisible to AOOS.",
      }),
      op({
        id: "ga4.mp.collect",
        operation: "Measurement Protocol /mp/collect",
        purpose: "Send server side events, for example an approved change going live.",
        status: "not_built",
        mutates: true,
        gap: "Digest filed, nothing implemented. No AOOS event ever reaches GA4.",
      }),
    ],
  },
  {
    key: "dataforseo",
    label: "DataForSEO",
    provider: "DataForSEO",
    auth: "Basic token",
    operations: [
      op({
        id: "dfs.serp.live",
        operation: "SERP Google Organic (live and task)",
        purpose: "Ranking positions for a keyword.",
        status: "wired",
        evidence: "src/lib/dataforseo/serp.server.ts",
      }),
      op({
        id: "dfs.labs.keywords",
        operation: "Labs keyword ideas and related keywords",
        purpose: "Expand a seed into ranked keyword candidates.",
        status: "wired",
        evidence: "src/lib/dataforseo/keywords.server.ts",
      }),
      op({
        id: "dfs.labs.competitors",
        operation: "Labs competitors domain and domain intersection",
        purpose: "Who competes for the same terms and where they overlap.",
        status: "wired",
        evidence: "src/lib/dataforseo/competitors.server.ts",
      }),
      op({
        id: "dfs.backlinks",
        operation: "Backlinks summary and referring domains",
        purpose: "Owned link baseline and referring domain quality.",
        status: "wired",
        evidence: "src/lib/dataforseo/backlinks.server.ts",
      }),
      op({
        id: "dfs.onpage",
        operation: "OnPage API",
        purpose: "Full technical crawl: status codes, redirects, duplicate content, broken links, page weight.",
        status: "not_built",
        gap: "Not built. Technical crawl evidence currently comes only from single page scrapes, so site wide redirect chains and broken links are never seen.",
      }),
      op({
        id: "dfs.keywords_data",
        operation: "Keywords Data (search volume, clickstream)",
        purpose: "Volume and cost data straight from the ad platforms.",
        status: "not_built",
        gap: "Not built. Volume comes from Labs estimates only.",
      }),
      op({
        id: "dfs.business_data",
        operation: "Business Data (Google Business Profile, reviews)",
        purpose: "Local pack presence and review evidence for a mover.",
        status: "not_built",
        gap: "Not built. No local search evidence at all, which matters more than national rank for this business.",
      }),
      op({
        id: "dfs.content_analysis",
        operation: "Content Analysis",
        purpose: "Brand mentions and sentiment across the web.",
        status: "not_built",
        gap: "Not built.",
      }),
      op({
        id: "dfs.merchant",
        operation: "Merchant and App Data",
        purpose: "Not relevant to this business today.",
        status: "not_built",
        gap: "Deliberately out of scope. Listed so the inventory is complete.",
      }),
    ],
  },
  {
    key: "firecrawl",
    label: "Firecrawl",
    provider: "Firecrawl",
    auth: "API key",
    operations: [
      op({
        id: "fc.scrape",
        operation: "POST /v2/scrape",
        purpose: "Fetch one URL as HTML and markdown for the page audit.",
        status: "wired",
        evidence: "src/lib/page-audit.server.ts",
      }),
      op({
        id: "fc.crawl",
        operation: "POST /v2/crawl",
        purpose: "Walk the whole site instead of a list of known URLs.",
        status: "not_built",
        gap: "Not built. The audit only sees pages Search Console already reported, so a page with zero impressions is invisible.",
      }),
      op({
        id: "fc.map",
        operation: "POST /v2/map",
        purpose: "Cheap full URL inventory of the site.",
        status: "not_built",
        gap: "Not built. There is no authoritative list of every page that exists.",
      }),
      op({
        id: "fc.search",
        operation: "POST /v2/search",
        purpose: "Search the web and scrape results in one call.",
        status: "not_built",
        gap: "Not built.",
      }),
      op({
        id: "fc.extract",
        operation: "POST /v2/extract",
        purpose: "Schema driven structured extraction across many pages.",
        status: "not_built",
        gap: "Not built. Structured data checks are parsed by hand instead.",
      }),
    ],
  },
  {
    key: "pagespeed_insights",
    label: "PageSpeed Insights",
    provider: "Google",
    auth: "API key",
    operations: [
      op({
        id: "psi.runpagespeed",
        operation: "pagespeedonline.runPagespeed",
        purpose: "Core Web Vitals and Lighthouse audits per URL.",
        status: "partial",
        evidence: "src/lib/measurement/pagespeed.server.ts",
        gap: "Implemented, but every recorded attempt failed on quota and zero snapshots are stored. Treat speed evidence as absent, not as good.",
      }),
      op({
        id: "psi.crux",
        operation: "CrUX API",
        purpose: "Field data from real Chrome users rather than a lab run.",
        status: "not_built",
        gap: "Not built. All speed claims would be lab only even once quota is fixed.",
      }),
    ],
  },
  {
    key: "serpapi",
    label: "Google Ads Transparency (SerpApi)",
    provider: "SerpApi",
    auth: "API key",
    operations: [
      op({
        id: "serpapi.account",
        operation: "GET /account",
        purpose: "Remaining request budget.",
        status: "wired",
        evidence: "src/lib/serpapi/account.server.ts",
      }),
      op({
        id: "serpapi.ads_transparency",
        operation: "GET /search (ads transparency center)",
        purpose: "Which ads a competitor is running right now.",
        status: "wired",
        evidence: "src/lib/serpapi/canary.server.ts",
      }),
      op({
        id: "serpapi.google_local",
        operation: "GET /search (google_local, maps)",
        purpose: "Local pack and map rankings for moving queries.",
        status: "not_built",
        gap: "Not built. No local rank evidence.",
      }),
      op({
        id: "serpapi.google_paid",
        operation: "GET /search (live paid SERP corroboration)",
        purpose: "Confirm a transparency finding against a live SERP.",
        status: "not_built",
        gap: "Path defined in the integration plan, never implemented.",
      }),
    ],
  },
  {
    key: "umami",
    label: "Umami analytics",
    provider: "Self-hosted",
    auth: "Bearer token",
    operations: [
      op({
        id: "umami.auth",
        operation: "POST /api/auth/login",
        purpose: "Exchange credentials for a token.",
        status: "wired",
        evidence: "src/lib/umami/client.server.ts",
      }),
      op({
        id: "umami.websites",
        operation: "GET /api/websites",
        purpose: "List tracked sites.",
        status: "wired",
        evidence: "src/lib/umami/client.server.ts",
      }),
      op({
        id: "umami.stats",
        operation: "GET /api/websites/{id}/stats",
        purpose: "Visitors, pageviews, bounce rate for a window.",
        status: "wired",
        evidence: "src/lib/umami/client.server.ts",
      }),
      op({
        id: "umami.metrics",
        operation: "GET /api/websites/{id}/metrics",
        purpose: "Top pages, referrers, browsers, countries.",
        status: "partial",
        evidence: "src/lib/umami/client.server.ts",
        gap: "Only a subset of metric types is requested. Referrer and country breakdowns are not stored.",
      }),
      op({
        id: "umami.events",
        operation: "GET /api/websites/{id}/events",
        purpose: "Custom events such as quote form starts.",
        status: "not_built",
        gap: "Not built. No conversion signal from Umami.",
      }),
      op({
        id: "umami.sessions",
        operation: "GET /api/websites/{id}/sessions",
        purpose: "Session level detail for a visitor path.",
        status: "not_built",
        gap: "Not built.",
      }),
    ],
  },
  {
    key: "google_ads",
    label: "Google Ads",
    provider: "Google",
    auth: "Developer token plus OAuth",
    operations: [
      op({
        id: "ads.search",
        operation: "GoogleAdsService.search",
        purpose: "Campaign, ad group and keyword performance.",
        status: "partial",
        evidence: "src/lib/connectors/google-ads.server.ts",
        gap: "Transport exists, but no scheduled read and no stored snapshots, so spend and performance evidence is absent.",
      }),
      op({
        id: "ads.keywordplan",
        operation: "KeywordPlanIdeaService",
        purpose: "First party volume and bid estimates for a keyword set.",
        status: "not_built",
        gap: "Not built. Paid demand data is bought from DataForSEO instead of read from the account we own.",
      }),
      op({
        id: "ads.conversions",
        operation: "ConversionUploadService",
        purpose: "Upload offline conversions from closed jobs.",
        status: "not_built",
        mutates: true,
        gap: "Not built. Revenue access is unavailable, so this stays blocked upstream.",
      }),
      op({
        id: "ads.mutate",
        operation: "Campaign and budget mutates",
        purpose: "Change what is running.",
        status: "not_built",
        mutates: true,
        gap: "Deliberately not built. Any spend mutation needs an approval contract that does not exist yet.",
      }),
    ],
  },
  {
    key: "github_executor",
    label: "GitHub executor",
    provider: "GitHub",
    auth: "Fine grained token on maxwest525/synergy-layer",
    operations: [
      op({
        id: "gh.contents.get",
        operation: "GET /repos/{r}/contents/{path}",
        purpose: "Read the file and its SHA before editing.",
        status: "wired",
        evidence: "src/lib/execution/execute.server.ts",
      }),
      op({
        id: "gh.contents.put",
        operation: "PUT /repos/{r}/contents/{path}",
        purpose: "Commit an approved change with a base revision guard.",
        status: "wired",
        mutates: true,
        evidence: "src/lib/execution/execute.server.ts",
      }),
      op({
        id: "gh.pulls",
        operation: "POST /repos/{r}/pulls",
        purpose: "Open a pull request instead of committing straight to a branch.",
        status: "not_built",
        mutates: true,
        gap: "Not built. Every execution is a direct commit, so there is no review surface outside AOOS.",
      }),
      op({
        id: "gh.actions.runs",
        operation: "GET /repos/{r}/actions/runs",
        purpose: "Confirm the deploy that carries the change actually succeeded.",
        status: "not_built",
        gap: "Not built. A commit is treated as shipped without checking the build.",
      }),
    ],
  },
  {
    key: "n8n",
    label: "n8n",
    provider: "Self-hosted",
    auth: "Webhook secret",
    operations: [
      op({
        id: "n8n.webhook",
        operation: "POST /webhook/aoos-governed-seo",
        purpose: "Hand an approved change to the automation layer.",
        status: "wired",
        evidence: "src/lib/connectors/n8n.server.ts",
      }),
      op({
        id: "n8n.executions",
        operation: "GET /api/v1/executions",
        purpose: "Read whether the handed off run actually finished.",
        status: "not_built",
        gap: "Not built. AOOS fires the webhook and never learns the outcome.",
      }),
      op({
        id: "n8n.workflows",
        operation: "GET /api/v1/workflows",
        purpose: "Inventory which automations exist on the box.",
        status: "not_built",
        gap: "Not built.",
      }),
    ],
  },
  {
    key: "vps_scraper",
    label: "Crawl4AI and self-hosted Firecrawl",
    provider: "Self-hosted",
    auth: "API key",
    operations: [
      op({
        id: "vps.health",
        operation: "GET /api/health",
        purpose: "Reachability probe.",
        status: "wired",
        evidence: "src/lib/connectors/probes.server.ts",
      }),
      op({
        id: "vps.scrape",
        operation: "POST crawl",
        purpose: "Scrape a governed origin without spending Firecrawl credits.",
        status: "partial",
        evidence: "src/lib/connectors/vps-scraper.server.ts",
        gap: "Limited to the TruMove origin, and no audit path uses it, so the paid Firecrawl account absorbs all crawl cost.",
      }),
    ],
  },
  {
    key: "searxng_openseo",
    label: "SearXNG and OpenSEO",
    provider: "Self-hosted",
    auth: "Basic auth",
    operations: [
      op({
        id: "openseo.tools",
        operation: "OpenSEO free tool reads",
        purpose: "One off manual SEO tool calls.",
        status: "wired",
        evidence: "src/lib/openseo/runtime.server.ts",
      }),
      op({
        id: "searxng.search",
        operation: "GET /search",
        purpose: "Unmetered SERP style reads for research.",
        status: "not_built",
        gap: "Reachable and probed, but no code queries it. Every research read still costs money elsewhere.",
      }),
    ],
  },
  {
    key: "gemini",
    label: "Gemini generation and embeddings",
    provider: "Google",
    auth: "API key",
    operations: [
      op({
        id: "gemini.generate",
        operation: "generateContent",
        purpose: "Proposal wording and re-ranking.",
        status: "wired",
        evidence: "src/lib/gemini.server.ts",
      }),
      op({
        id: "gemini.embed",
        operation: "embedContent",
        purpose: "Knowledge retrieval over stored documents.",
        status: "wired",
        evidence: "src/lib/knowledge-retrieval.server.ts",
      }),
      op({
        id: "gemini.grounding",
        operation: "Google Search grounding",
        purpose: "Answer with cited live sources instead of memory.",
        status: "not_built",
        gap: "Not built. The agent cannot cite a live source in an answer.",
      }),
    ],
  },
  {
    key: "perplexity",
    label: "Perplexity",
    provider: "Perplexity",
    auth: "API key",
    operations: [
      op({
        id: "pplx.chat",
        operation: "POST /chat/completions",
        purpose: "Cited web research for the research capability.",
        status: "wired",
        evidence: "src/lib/web-research.server.ts",
      }),
      op({
        id: "pplx.async",
        operation: "Async research jobs",
        purpose: "Long form deep research without holding a request open.",
        status: "not_built",
        gap: "Not built.",
      }),
    ],
  },
  {
    key: "openai_ads",
    label: "OpenAI Ads",
    provider: "OpenAI",
    auth: "Pixel and CAPI keys",
    operations: [
      op({
        id: "openai_ads.events",
        operation: "Event ingestion webhook",
        purpose: "Receive pixel events.",
        status: "wired",
        evidence: "src/routes/api/public/hooks/openai-ads-events.ts",
      }),
      op({
        id: "openai_ads.conversions",
        operation: "Conversions API",
        purpose: "Send server side conversions.",
        status: "partial",
        evidence: "src/routes/api/public/hooks/openai-ads-conversions.ts",
        gap: "Receiver exists, but no verified outbound send and no stored delivery receipts.",
      }),
    ],
  },
];

export function surfaceCounts(surfaces: SurfaceConnection[] = CONNECTION_SURFACES) {
  const all = surfaces.flatMap((surface) => surface.operations);
  return {
    total: all.length,
    wired: all.filter((entry) => entry.status === "wired").length,
    partial: all.filter((entry) => entry.status === "partial").length,
    notBuilt: all.filter((entry) => entry.status === "not_built").length,
  };
}

export function connectionCounts(surface: SurfaceConnection) {
  return surfaceCounts([surface]);
}

/** The roadmap title and detail for a gap, so the wording never drifts. */
export function gapRoadmapDraft(surface: SurfaceConnection, entry: SurfaceOperation) {
  return {
    title: `${surface.label}: wire ${entry.operation}`,
    detail: [
      `Connection: ${surface.label} (${surface.provider}, ${surface.auth})`,
      `Operation: ${entry.operation}`,
      `Status today: ${entry.status === "partial" ? "partially wired" : "not built"}`,
      `What it gives us: ${entry.purpose}`,
      `What is missing: ${entry.gap ?? "unspecified"}`,
      entry.evidence ? `Existing code: ${entry.evidence}` : null,
      entry.mutates ? "This operation writes at the provider, so it needs the approval path." : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
