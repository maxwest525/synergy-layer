# Connected-tool playbook audit

Scope: every connector in `src/lib/connectors/catalog.ts` except DataForSEO (covered elsewhere).
Goal: find prebuilt vendor recipes we are paying for but not calling, and flag standard
best-practice checks missing from `src/lib/page-checks.ts` / `src/lib/site-checks.ts`.

## 1. What each connector does TODAY (from the repo)

| Connector | Code today | Files |
|---|---|---|
| Google Search Console | `searchAnalytics.query` (rows by query/page/date), URL Inspection `index:inspect` (single URL), sitemaps `list` | `src/lib/search-console.server.ts` |
| Google Analytics 4 | `runReport` with dims `hostName, pagePathPlusQueryString, eventName` and metrics `eventCount, activeUsers, sessions` — one shape, reused everywhere | `src/lib/measurement/ga4.server.ts` |
| Firecrawl (hosted + self-hosted VPS) | `/v2/scrape` only — full-page HTML/markdown render, then our own regex-based `extractPageFacts` parses title/meta/h1/images/links | `src/lib/page-audit.server.ts` |
| PageSpeed Insights | `runPagespeed` for one `strategy` (mobile/desktop) per call, reads `lighthouseResult` (lab data) | `src/lib/measurement/pagespeed.server.ts` |
| SerpAPI | `engine=google` live SERP fetch, used for ads landing-page/creative/advertiser monitoring and a canary check — organic PAA/related-questions block is never requested | `src/lib/serpapi/live-serp.server.ts`, `landing-pages.server.ts`, `creatives.server.ts`, `advertisers.server.ts` |
| Umami | pageviews, stats, per-metric breakdowns via `umamiGet` | `src/lib/umami/client.server.ts` |
| LiteLLM / OpenRouter models | proxy for Gemini/other model calls, no SEO-specific recipe surface | `src/lib/ai/gateway.server.ts` |

## 2. Unused vendor recipes, per tool

### Firecrawl
- **Schema-based `/extract`** (as opposed to `/scrape`) takes a URL + JSON schema or Pydantic-style
  model and returns typed, guaranteed-shape JSON — no more regex parsing in `extractPageFacts`.
  Directly answers **competitor structure copying**: point it at a competitor page with a schema
  for `{h1, headingOutline, faqItems, schemaTypes, wordCount}` and get a structured diff instead of
  scraping raw HTML ourselves.
  Docs: https://docs.firecrawl.dev/v0/features/extract , https://www.firecrawl.dev/blog/launch-week-iii-day-3-extract-v2
- **Wildcard/batch extraction** — extract's multi-URL + wildcard input lets one call cover an
  entire competitor section (e.g. `competitor.com/blog/*`) instead of one `/scrape` call per page,
  which is what today's loop in `page-audit.server.ts` does one URL at a time.
  Docs: https://docs.firecrawl.dev/v0/features/extract

### Google Search Console
- **Sitemaps `submit`** (`PUT .../sitemaps/{feedpath}`) — we only ever `list` sitemaps
  (`search-console.server.ts:897`). We never tell Google about a newly-generated sitemap; that's a
  standing manual step we could close in one PUT call.
  Docs: https://developers.google.com/webmaster-tools/v1/sitemaps/submit
- **URL Inspection is capped at 2,000 inspections/day and 200 submits/day** per property — our
  single-URL `index:inspect` call (`search-console.server.ts:264`) has no batching/queue logic
  against that quota, so a full-site inspection sweep on a larger site could silently truncate.
  Answers **structure best-practice enforcement**: batch-inspect every URL in the sitemap on a
  schedule and diff index status over time, which the URL Inspection API is built for.
  Docs: https://developers.google.com/search/blog/2022/01/url-inspection-api

### Google Analytics 4
- **`sessionDefaultChannelGroup` / landing-page dimension combo** — the built-in Landing Page
  report (session-scoped: landing page × channel grouping × conversions) is never requested; our
  `runReport` call only pulls `hostName/pagePath/eventName` counts. Adding
  `sessionDefaultChannelGroup` as a dimension answers **which channel drives traffic to which
  page**, which today requires manually cross-referencing GSC query data with GA4 page data.
  Docs: https://developers.google.com/analytics/devguides/reporting/data/v1/predefined-reports ,
  https://support.google.com/analytics/answer/12931766
- No audience dimension is ever requested (GA4 admin-defined audiences as a report dimension) — not
  used at all today, would let a low-traffic site segment "new vs returning" without a second tool.

### PageSpeed Insights
- **`loadingExperience` (field/CrUX data) is never read** — `pagespeed.server.ts` parses only
  `lighthouseResult` (lab/synthetic). Field data answers a different operator question than lab
  data: "what do real visitors on real networks actually experience," vs "what does a single
  simulated run say." Google is winding down CrUX inside PSI itself in favor of the dedicated CrUX
  History API, so if this is added it should target that API, not `loadingExperience`.
  Docs: https://developers.google.com/codelabs/chrome-web-vitals-psi-crux ,
  https://web.dev/articles/lab-and-field-data-differences

### SerpAPI
- **`engine=google_related_questions`** ("People Also Ask" expansion) is not called anywhere in
  `src/lib/serpapi/*` — every current SerpAPI use is ads/SERP-position monitoring, never organic
  question mining. This is the single most direct "question mining" recipe SerpAPI sells and we
  already hold the API key for it.
  Docs: https://serpapi.com/google-related-questions-api , https://serpapi.com/related-questions

## 3. Missing standard best-practice checks (page-checks.ts / site-checks.ts)

Current page-checks: title, description, h1, canonical, noindex/nofollow, viewport, lang,
structured_data missing/invalid (generic, not type-aware), image_alt_missing, thin_content,
no_internal_links (binary), og_missing.
Current site-checks: robots.txt, sitemap declared/missing/unreachable/empty/coverage gap, pages
unreadable.

Gaps against Google's own SEO starter-guide checklist:
- **URL slug conventions** — no check exists for slug length, hyphen-vs-underscore, query-string
  params, or keyword presence in the path. `pathsOf`/`normalizePath` in `site-checks.ts` only
  normalize for sitemap comparison, they don't flag slug quality.
- **Image weight/dimensions** — `imagesMissingAlt` is the only image signal (`page-checks.ts`
  PageFacts). No check for oversized files, missing `width`/`height` attributes (CLS risk), or
  non-next-gen formats.
- **Internal-link depth / orphan pages** — `no_internal_links` is binary (zero vs. some). There is
  no click-depth check (e.g. "not reachable within 3 clicks of the home page") and no minimum
  internal-link-count-per-page threshold, both named directly in Google's own guidance.
- **Schema type enforcement** — `structured_data_missing`/`_invalid` only check presence/validity
  generically. There's no check that a given page category carries the *expected* schema type
  (e.g. LocalBusiness for a location page, FAQPage for an FAQ section, Article for a blog post).

## Top-10 unused-recipe list

(sent separately via SendMessage per task instructions)
