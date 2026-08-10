# DataForSEO — AOOS Documentation Digest

- **Provider:** DataForSEO (api.dataforseo.com, API v3)
- **Digest version:** 1.0.0
- **Retrieval date:** 2026-08-10
- **API version:** v3 (`https://api.dataforseo.com/v3/...`)
- **Capability (planned):** `cap.dataforseo` — NOT implemented yet
- **Status:** discovery complete, implementation deferred pending review

## 1. Authoritative sources reviewed

| Source | URL |
|---|---|
| API root docs | https://docs.dataforseo.com/v3/ |
| Backlinks overview | https://docs.dataforseo.com/v3/backlinks-overview/ |
| Backlinks Summary Live | https://docs.dataforseo.com/v3/backlinks-summary-live/ |
| Backlinks Backlinks Live | https://docs.dataforseo.com/v3/backlinks-backlinks-live/ |
| Backlinks History Live | https://docs.dataforseo.com/v3/backlinks/history/live/ |
| Backlinks Timeseries Summary | https://docs.dataforseo.com/v3/backlinks-timeseries_summary-live/ |
| Backlinks Page Intersection | https://docs.dataforseo.com/v3/backlinks/page_intersection/live/ |
| Backlinks Bulk Ranks | https://docs.dataforseo.com/v3/backlinks/bulk_ranks/live/ |
| Labs Google overview | https://docs.dataforseo.com/v3/dataforseo_labs/google/overview/ |
| SERP overview (Live vs Standard) | https://docs.dataforseo.com/v3/serp/overview/ |
| OnPage overview | https://docs.dataforseo.com/v3/on_page/overview/ |
| Errors appendix | https://docs.dataforseo.com/v3/appendix-errors/ |
| Pricing hub | https://dataforseo.com/pricing |
| Backlinks pricing | https://dataforseo.com/pricing/backlinks/backlinks |
| Backlinks pricing explained | https://dataforseo.com/help-center/backlinks-api-pricing-explained |
| Labs Google pricing | https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api |
| SERP cost explained | https://dataforseo.com/help-center/serp-api-cost-explained |
| OnPage pricing | https://dataforseo.com/pricing/on-page/onpage-api |

## 2. What the service actually is

One account, one Basic-auth credential, one pay-as-you-go balance across nine+ API families:
SERP, Keyword Data, DataForSEO Labs, Backlinks, OnPage, Domain Analytics, Content Analysis,
Business Data, Merchant/App Data, plus newer AI Optimization / LLM Mentions products (separate
subscription). Shared JSON envelope and taxonomy across every endpoint.

## 3. Transport, auth, envelope

- REST over HTTPS, JSON by default. Append `.xml` or `.html` to a path for other formats.
- **Auth:** HTTP Basic with API login/password from the account API access page. No OAuth. Credentials are secrets, never knowledge.
- **Envelope:** top level `version`, `status_code`, `status_message`, `time`, `cost`, `tasks_count`, `tasks_error`, `tasks[]`. Each task carries its own `id` (UUID), `status_code` (10000–60000), `cost`, `path`, `data` (echo of POST), `result[]`.
- **Multi-task POST:** the POST body is an array — up to 100 tasks per call. Batch aggressively; the per-request fee is charged per task, but fewer HTTP calls means less rate-limit pressure.

## 4. Live vs Standard (task-based) — decision rule

| Family | Modes |
|---|---|
| Backlinks | **Live only** |
| DataForSEO Labs | **Live only** |
| SERP | Live *and* Standard (normal / high priority) + `tasks_ready` polling, `pingback_url`, `postback_url` |
| OnPage | Task-based crawl (`task_post` → `tasks_ready`/pingback → result endpoints) + `instant_pages` live |

Rule for AOOS: anything scheduled and non-interactive should use the **Standard queue with a
callback** (SERP) or the **task crawl with pingback** (OnPage). Live mode is for operator-initiated
inspection only — it is roughly 3.3× the Standard normal price for SERP.

Callbacks: `postback_url` requires `postback_data` (`regular` | `advanced` | `html`).
`pingback_url` only notifies; you then fetch the result. Both support `$id` / `$tag` macros.

## 5. Rate limits, storage, freshness

- 2000 API calls per minute account-wide (POST + GET combined); each POST up to 100 tasks.
- **Max 30 simultaneous in-flight requests** for Backlinks and Labs — concurrency, not just RPM, is the real ceiling.
- Per-endpoint ceilings exposed in `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers — read them, do not guess.
- Result retention: Standard 30 days, Live not stored, HTML 7 days. SERP JSON 30 days in both modes.
- Freshness: Backlinks from a continuously updated live index; Labs from an in-house SERP/keyword database (near-real-time, not live SERP); SERP API is a live fetch.
- Turnaround: Live/Labs ~2s; SERP Live ~6s; SERP Standard ~5 min normal (45 min guaranteed), ~1 min high.

## 6. Cost model (2026-08-10 published prices)

| Family | Pricing |
|---|---|
| Backlinks | $0.02 per request (pricing page also lists $0.024) + $0.00003 per row ($0.06 per 1,000 rows on the pricing page). Max 1,000 rows per request. **Requires a $100/mo access subscription** — the money stays as account balance. |
| Labs — most endpoints | $0.012 per task + $0.00012 per item (~$132 / 1M items) |
| Labs — Historical Rank | $0.12 per task + $0.0012 per item |
| Labs — Historical SERPs | $0.00012 per SERP item |
| Labs — Search Intent | $0.012 per task + $0.00012 per keyword |
| Labs — Bulk Traffic Estimation / Domain Metrics by Categories | $0.12 per task + $0.0012 per domain |
| `include_clickstream_data: true` | **doubles** the request cost |
| SERP Google organic | base per 10 results: Live $0.002, Standard normal $0.0006, Standard high $0.0012. `depth` above default multiplies. Extra paid params: `calculate_rectangles`, `get_website_url`, some keyword operators. |
| OnPage | $0.00015 per crawled page (basic). Multipliers: load resources ×3, load JS ×10, Lighthouse ×34, keyword density ×2, screenshots extra. |

Cost controls: per-API and per-endpoint daily spend limits in the account panel (breach returns
error `40203`); OnPage **Force Stop** aborts a runaway crawl; the **User Data** endpoint returns
balance and per-API rate limits and should be polled cheaply for observability.
Every response reports its own `cost` — AOOS must persist it per call.

## 7. Query semantics common to Backlinks and Labs

- `filters`: up to 8 conditions with `and` / `or`, operators `=`, `<>`, `in`, `not_in`, `like`, `not_like`, `ilike`, `not_ilike`, `regex`, `not_regex`, `match`, `not_match`; `%` wildcard with `like`. Filtering and sorting are **free** — filter server-side rather than pulling rows and discarding them.
- `order_by`: up to 3 rules, `field,asc|desc`.
- Pagination: `limit` (default 100, max 1000) + `offset`. Backlinks Backlinks Live also supports `mode` (`as_is`, `one_per_domain`, `one_per_anchor`) — a native dedup that removes the need for local dedup logic.
- `backlinks_status_type`: `all` | `live` | `lost`. `backlinks_filters` pre-filters the dataset that aggregate metrics are computed from (e.g. dofollow-only profiles).
- `rank_scale`: `one_hundred` | `one_thousand`.
- `internal_list_limit` caps nested arrays in Summary responses.
- `tag` field on tasks: use it to carry the AOOS run id / fingerprint through callbacks.

## 8. Capability inventory relevant to AOOS

**Backlinks API** — `summary`, `backlinks`, `history`, `timeseries_summary`, `timeseries_new_lost_summary`,
`anchors`, `domain_pages`, `domain_pages_summary`, `referring_domains`, `referring_networks`,
`competitors`, `domain_intersection`, `page_intersection`, `bulk_ranks`, `bulk_backlinks`,
`bulk_spam_score`, `bulk_referring_domains`, `bulk_new_lost_backlinks`, `bulk_new_lost_referring_domains`,
`bulk_pages_summary` (bulk endpoints accept up to 1,000 targets in one call). History reaches back to
the start of 2019; new/lost deltas exist from May 2021.

**DataForSEO Labs** — `ranked_keywords`, `serp_competitors`, `competitors_domain`, `domain_intersection`,
`subdomains`, `relevant_pages`, `page_intersection`, `domain_rank_overview`, `historical_rank_overview`,
`historical_serps`, `historical_search_volume`, `keyword_ideas`, `keyword_suggestions`,
`related_keywords`, `keywords_for_site`, `keyword_overview`, `bulk_keyword_difficulty`,
`search_intent`, `bulk_traffic_estimation`, `top_searches`, `categories_for_domain`. Amazon/Bing
variants also exist.

**SERP API** — live and queued SERPs across Google/Bing/etc., `tasks_ready`, HTML retrieval,
AI Overview and SERP-feature parsing, locale via `location_code`/`language_code`.

**OnPage API** — `task_post`, `tasks_ready`, `summary`, `pages`, `pages_by_resource`, `resources`,
`duplicate_tags`, `duplicate_content`, `links`, `redirect_chains`, `non_indexable`, `waterfall`,
`keyword_density`, `microdata`, `lighthouse`, `content_parsing`, `instant_pages`, `force_stop`.

**Domain Analytics** — `technologies` (tech stack by domain), `whois/overview` (with backlink and
rank filters). **Content Analysis** — brand/citation mentions and sentiment across the web.
**Business Data** — Google Business Profile info/reviews/questions, local pack, Trustpilot/Yelp
reviews: directly relevant to a moving company's local visibility.

## 9. Errors, retries, idempotency

- HTTP: `401` bad credentials, `402` balance problem, `404` unknown endpoint, `500` internal.
- Task codes 10000–60000. `20000` = OK. `40200` payment required. `40203` cost limit exceeded.
  `40501` internal task error. `40602`/`40603` task in queue / handed to the crawler.
- Retry policy for AOOS: retry only on `5xx`, transport failures and `40501`, with exponential
  backoff and a concurrency cap of 30. **Never** blind-retry a `402`/`40200`/`40203` — it is a
  budget condition and belongs in the Inbox as `needs_attention`.
- No provider-side idempotency key. Idempotency is AOOS's job: derive a deterministic request
  fingerprint (endpoint + normalized params + reporting date) and skip a call when a snapshot with
  that fingerprint already exists — the same pattern already used for Search Console snapshots.

## 10. Common implementation mistakes to avoid

1. Paginating a Live endpoint client-side instead of using server-side `filters` (which are free).
2. Using Live SERP for scheduled jobs (3.3× cost) instead of Standard + `postback_url`.
3. Ignoring the 30-concurrent-request cap and getting throttled at well under 2000 rpm.
4. Averaging rank/position across rows instead of weighting — same rule as GSC.
5. Turning on `include_clickstream_data` without noticing the 2× cost.
6. Crawling a whole site with Lighthouse enabled (34× per page) when a sampled subset would do.
7. Treating Labs data as live SERP truth — it is a database snapshot, good for trend and gap
   analysis, not for "what does the SERP look like right now".
8. Storing the login/password anywhere near knowledge or registry config.

## 11. Deferred but valuable later

Content Analysis brand mentions, Business Data reviews/local pack, Domain Analytics technologies,
`historical_serps`, `bulk_traffic_estimation`, SERP AI Overview capture, OnPage Lighthouse sampling,
Merchant/App Data. All are recorded here so a future implementation agent does not rediscover them.
