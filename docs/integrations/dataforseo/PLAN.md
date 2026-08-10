# DataForSEO — AOOS Capability Map, Integration Blueprint, Risk Register

Companion to `DIGEST.md`. Nothing here is implemented. This is the pre-implementation
decision record required by the documentation-first integration rule.

## 1. Capability map — what DataForSEO adds that AOOS does not already have

| AOOS need | Today | DataForSEO fit | Verdict |
|---|---|---|---|
| Owned-property clicks/impressions/CTR/position | Search Console (real, authoritative, free) | Labs `ranked_keywords` estimates the same shape, worse | **Do not replace GSC.** Keep GSC as the source of truth for owned performance. |
| Competitor keyword/position visibility | none | Labs `competitors_domain`, `domain_intersection`, `ranked_keywords` for a competitor domain | **Genuine gap filled** |
| Keyword volume, difficulty, intent for keywords TruMove does *not* rank for | none (GSC only shows what already ranks) | Labs `keyword_ideas`, `keyword_suggestions`, `bulk_keyword_difficulty`, `search_intent` | **Genuine gap filled** |
| Live SERP composition for a target query | none | SERP API Standard queue | **Genuine gap filled** |
| Backlink profile, new/lost links, referring domains | none | Backlinks `summary`, `history`, `timeseries_summary`, `bulk_*` | **Genuine gap filled** (pay-as-you-go since 2026-07-01, no commitment) |
| Technical crawl of TruMove pages | Firecrawl (scrape/extract only, no audit) | OnPage API — 60+ technical metrics, duplicate content, redirect chains, non-indexable | **Genuine gap filled**, partial overlap with Firecrawl |
| Page content retrieval for research | Firecrawl (real, already wired) | OnPage `content_parsing`, `instant_pages` | **Overlap — keep Firecrawl.** |
| Open-web research answers with citations | Perplexity (real, already wired) | none | No overlap |
| Local pack / GBP reviews visibility | none | Business Data API | Gap, deferred |

**Conclusion:** DataForSEO is complementary, not a replacement for any existing real capability.
It should enter AOOS as a *separate* capability with its own registry entry, not by absorbing
`cap.web_research` or `cap.search_console`.

## 2. Proposed capability decomposition

Rather than one monolithic `cap.dataforseo`, register one capability per data family so the
registry keeps stating exactly what is wired:

| Key | Kind | Purpose | Mutating |
|---|---|---|---|
| `cap.dataforseo_labs` | api | keyword ideas, difficulty, intent, competitor domains, ranked keywords | no |
| `cap.dataforseo_serp` | api | queued SERP capture for tracked queries | no |
| `cap.dataforseo_backlinks` | api | backlink profile + new/lost deltas | no |
| `cap.dataforseo_onpage` | api | technical crawl audit of owned properties | no |

All four are observation-only, same posture as Search Console. Phase one should promote **only
`cap.dataforseo_labs`** to `real`; the other three stay `pending` until there is a workflow that
needs them and a budget decision.

## 3. Integration blueprint (for a later turn — not built)

- **Credential:** one secret pair, `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`, requested via the
  secret flow after approval. Basic auth header built server-side only.
- **Server module:** `src/lib/dataforseo.server.ts` — a single `dataforseoPost(path, tasks[])`
  transport with: Basic auth, 30-slot concurrency semaphore, exponential backoff on 5xx/`40501`,
  hard stop and Inbox filing on `402`/`40200`/`40203`, per-call `cost` capture, and rate-limit
  header logging. Per-family helpers sit on top of it; no endpoint is called directly from a route.
- **Snapshot storage:** a `dataforseo_snapshots` table mirroring the Search Console snapshot
  contract — tenant-scoped, immutable, `request_fingerprint`, `checksum`, `cost_usd`,
  `reporting_date`, `payload`, provenance fields. Idempotency = skip when fingerprint+date exists.
- **Registry:** `src/registry/modules/dataforseo.ts` declaring the capabilities above with real
  `operations`, all `mutates: false`.
- **Workflow:** `dfs-weekly-keyword-observe` — weekly, not daily (Labs data is a database
  snapshot; daily polling buys nothing and costs money). Feeds the existing
  `src/lib/seo-validation.server.ts` rule engine with new evidence types.
- **Rules:** new evidence-backed rules only after data exists. No thresholds invented up front.
- **Budget guard:** a configured monthly ceiling checked before each call, plus a daily spend cap
  set in the DataForSEO account panel as a second, provider-side backstop.

## 4. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Unbounded spend from a looping workflow | **High** | Provider daily cost limits + AOOS pre-call budget guard + persisted per-call `cost` + Inbox alert on `40203` |
| Backlinks spend (pay-as-you-go since 2026-07-01, no commitment) | Low | Per-request cost ledger plus the $300/mo AOOS ceiling. Superseded risk: the earlier "$100/mo access commitment" was stale, see DIGEST v1.1.0 |
| 30-concurrency cap causing silent throttling | Medium | Semaphore in the transport, read `X-RateLimit-*` headers, never fan out unbounded |
| Treating Labs estimates as truth alongside GSC actuals | **High** | Label every Labs-derived figure as `estimated` in evidence payloads; GSC remains authoritative for owned properties |
| Credential leakage | **High** | Secrets only, server-side only, never in registry config, knowledge, or client bundles |
| Endpoint/pricing drift | Medium | This digest is versioned and dated; re-verify before any expansion |
| Duplicate/overlapping capability with Firecrawl | Low | OnPage is scoped to technical audit, Firecrawl stays the content fetcher |
| Multi-tenant leakage | **High** | Snapshots tenant-scoped with RLS from the first migration, same as GSC |

## 5. Open decisions requiring your call

1. Which families to authorize now — Labs only, or Labs + SERP?
2. ~~Backlinks: accept the $100/mo access commitment, or defer?~~ Resolved: no commitment exists as of 2026-07-01. Backlinks runs in the first ingestion under the shared ceiling.
3. Budget ceiling per month for AOOS to spend against this account.
4. Which competitor domains to track for TruMove (the Labs value depends on this list).
5. Whether OnPage should audit the TruMove site now or wait until the publish chain is live.

**Status: STOPPED before implementation, per the documentation-first rule.**
