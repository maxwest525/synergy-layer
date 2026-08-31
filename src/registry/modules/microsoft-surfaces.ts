import type { ModuleDefinition } from "../types";

/**
 * The two Microsoft surfaces: Clarity for behaviour, Bing Webmaster for search.
 *
 * Both were added on 2026-08-31 and neither has been called from here yet, so
 * every operation below is marked `docs` rather than `called`. That distinction
 * is the point of this registry: the Google Ads `pageSize` bug was written down
 * as fact after being read, never tested, and cost a live 400 to find.
 */
export const definition: ModuleDefinition = {
  module: "microsoft-surfaces",
  capabilities: [
    {
      key: "cap.microsoft_clarity",
      name: "Microsoft Clarity (Data Export)",
      kind: "connector",
      category: "Behaviour",
      description:
        "Dashboard aggregates — traffic, scroll depth, engagement, rage and dead clicks — broken down by up to three dimensions. Session recordings and heatmap payloads are not exposed by the API.",
      integrationState: "pending",
      authKind: "bearer",
      operations: [
        {
          name: "project-live-insights",
          description:
            "The entire API. Returns [{metricName, information[]}] for the last 1–3 days, broken down by up to three of Browser, Device, Country/Region, OS, Source, Medium, Campaign, Channel, URL.",
          endpoint: "GET https://www.clarity.ms/export-data/api/v1/project-live-insights",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
          gotcha:
            "TEN calls per project per day, total — confirmed on Clarity's own settings screen. There is no separate health endpoint, so this connector is in noSafeProbe: a liveness check would spend 10% of the daily budget. numOfDays accepts only 1, 2 or 3. Responses cap at 1,000 rows with no pagination, so a high-cardinality dimension truncates silently. UTC.",
        },
      ],
      config: {
        mutating: false,
        credentials: "CLARITY_API_TOKEN",
        quota: "10 requests per project per day",
        history: "last 1–3 days only; anything longer must be accumulated from daily snapshots",
        probe: "none — deliberately in noSafeProbe",
        tokenLifecycle:
          "Shown once at generation and never again. A token that was not copied at creation cannot be recovered, only replaced.",
      },
    },
    {
      key: "cap.bing_webmaster",
      name: "Bing Webmaster Tools API",
      kind: "connector",
      category: "Search",
      description:
        "Search performance, index and crawl state, inbound links and sitemap feeds for a verified site. Roughly 60 methods, about half of which write.",
      integrationState: "pending",
      authKind: "api_key",
      operations: [
        {
          name: "GetUserSites",
          description:
            "Every verified site on the account. Takes no site parameter, which makes it the free health probe.",
          endpoint: "GET /webmaster/api.svc/json/GetUserSites?apikey={key}",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
        },
        {
          name: "GetRankAndTrafficStats",
          description: "Impressions, clicks and position over time for one site.",
          endpoint: "GET /webmaster/api.svc/json/GetRankAndTrafficStats?apikey={key}&siteUrl={url}",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
        },
        {
          name: "GetQueryStats / GetPageStats",
          description: "Top queries and top pages, with per-query and per-page detail variants.",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
        },
        {
          name: "GetCrawlStats / GetCrawlIssues",
          description: "Crawl statistics and the errors Bing hit.",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
        },
        {
          name: "GetUrlInfo / GetUrlTrafficInfo",
          description: "Index and traffic detail for a single page or a directory.",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
        },
        {
          name: "GetLinkCounts / GetUrlLinks",
          description: "Inbound links, by page and by URL.",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
        },
        {
          name: "SubmitUrl / SubmitUrlBatch / SubmitContent",
          description:
            "Push URLs or content into the index. NOT wired — listed so the surface is complete and the omission reads as a decision.",
          endpoint: "GET /webmaster/api.svc/json/SubmitUrl?apikey={key}&siteUrl={url}",
          mutates: true,
          verified: "docs",
          verifiedOn: "2026-08-31",
          gotcha:
            "Consumes a submission quota; check GetUrlSubmissionQuota before batching. Nothing in AOOS calls this.",
        },
      ],
      config: {
        mutating: false,
        baseUrl: "https://ssl.bing.com/webmaster/api.svc/json",
        credentials: "BING_WEBMASTER_API_KEY, BING_WEBMASTER_SITE_URL",
        gotcha:
          "The API key is issued per USER and covers every verified site, so a successful call never proves the intended site was in scope. Always pass siteUrl explicitly.",
        deprecations:
          "Legacy SOAP and POX APIs retired 2026-08-31; the JSON REST shape above is the surviving one. GetDeepLink, GetDeepLinkAlgoUrls and UpdateDeepLink are marked obsolete.",
      },
    },
  ],
};
