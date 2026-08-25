# Firecrawl — how AOOS wires it

Written 2026-08-25 at `cb586dd`. The **vendor surface** (every endpoint, every
scrape parameter, pricing, gotchas) lives in the global digest at
`~/.claude/integration-docs/firecrawl.md` — read that for what Firecrawl *can*
do. This file is only about what **this repo** does with it.

Deployment specifics for the box itself — containers, ports, Caddy — are in
[`selfhosted-firecrawl/DIGEST.md`](selfhosted-firecrawl/DIGEST.md).

## Two connectors, one API

| Connector key | Label on screen | Base URL | Should be |
| --- | --- | --- | --- |
| `selfhosted_firecrawl` | Firecrawl (VPS) | `SELFHOSTED_FIRECRAWL_BASE_URL` → `fire.marky.systems` | **configured** |
| `firecrawl` | Firecrawl | hardcoded `api.firecrawl.dev` | **missing, and that is correct** |

Max holds no paid Firecrawl account. The cloud row reading *missing* is the
intended state, not a problem to fix.

## The one chooser

`src/lib/firecrawl-endpoint.ts` → `firecrawlEndpoint(env)` is the only place that
decides which deployment answers:

1. `SELFHOSTED_FIRECRAWL_BASE_URL` **and** `SELFHOSTED_FIRECRAWL_API_KEY` both
   non-empty → `{ url: "${base}/v2/scrape", selfHosted: true }`.
2. Otherwise `FIRECRAWL_API_KEY` non-empty → `FIRECRAWL_CLOUD_URL`
   (`api.firecrawl.dev/v2/scrape`), `selfHosted: false`.
3. Otherwise `null` — callers render a named absence.

A **half-configured** self-hosted entry (base URL set, key blank) deliberately
falls through to cloud rather than failing the audit. That is a documented
trade-off, and it is also the one way spend can silently resume: if the key ever
goes blank while the URL is set, scrapes are billed with no error. `selfHosted`
is returned precisely so a caller can say which one answered.

## Callers — six, no bypasses

| File | Line | What it scrapes |
| --- | --- | --- |
| `src/lib/page-audit.server.ts` | 463 | site-wide page wording audit |
| `src/lib/execution/execute.server.ts` | 286 | post-change verification |
| `src/lib/execution/execution.functions.ts` | 218 | rendered-page proof |
| `src/lib/dataforseo/competitor-pages.server.ts` | 65 | competitor page reads |
| `src/lib/web-research.server.ts` | 78 | cited-source reads |
| `src/lib/connectors/probes.server.ts` | 152-160 | health probe only |

A repo-wide grep for `api.firecrawl.dev` returns exactly two hits: the constant
inside `firecrawl-endpoint.ts`, and the **cloud connector's own probe**
(`probes.server.ts:89`, `/v1/team/credit-usage`) which is correct — that probe
exists to report on the cloud account.

## What AOOS actually sends

Of the ~20 `/v2/scrape` parameters the API accepts, AOOS sends up to four, and
the two proof-critical callers send all four:

| Caller | `formats` | `onlyMainContent` | `waitFor` | `maxAge` |
| --- | --- | --- | --- | --- |
| `execution/execute.server.ts:271` `buildRenderedScrapeRequest` | `["rawHtml","markdown"]` | `false` | `3000` | **`0`** |
| `page-audit.server.ts:116` | `["rawHtml","markdown"]` | `false` | `3000` | **`0`** |
| `dataforseo/competitor-pages.server.ts:85` | `["markdown","rawHtml"]` | `false` | — | — |
| `web-research.server.ts:89` | `["markdown"]` | `true` | — | — |

### The cache question, and how it is already handled

Firecrawl's `maxAge` serves a cached page if one exists younger than the value,
and **its default is two days**. A verification scrape that hit that cache would
return the pre-edit page and record it as the live state — a confidently wrong
proof.

**Both paths where that would matter already send `maxAge: 0`**, and
`execute.server.ts:277` says why in a comment: *"Publish proof must never use
Firecrawl's two-day default cache."* `page-audit.server.ts` does the same.
`onlyMainContent: false` is likewise explicit at both, so nav, header and footer
are **not** stripped from what the audit reads.

The two callers that omit `maxAge` — `web-research.server.ts` (reading a cited
source) and `dataforseo/competitor-pages.server.ts` (reading a competitor's
page) — are not verification paths. For those a two-day cache is defensible and,
on the metered cloud, cheaper. Leave them alone unless a rule starts depending on
competitor freshness.

> **Correction, 2026-08-25.** An earlier draft of this file and of the
> remediation plan claimed AOOS never sends `maxAge` and that the page audit
> relied on `onlyMainContent`'s default. **Both were wrong.** The error came from
> grepping only for `formats:` and inferring the rest of each request object from
> one line, instead of reading the object. The vendor fact about the two-day
> default is correct; the claim about this repo was not.

## Probes

- `selfhosted_firecrawl` → `GET ${base}/is-production` with bearer auth. Chosen
  because it is free; the comment at `probes.server.ts:154` explicitly forbids
  probing `/v2/scrape`, since a health check must not cost a page fetch.
- `firecrawl` (cloud) → `GET /v1/team/credit-usage`. Cloud-only; a self-hosted
  instance has no credit ledger.

Reachability on 2026-08-25: `fire.marky.systems/is-production` → **401**
unauthenticated. Host up, auth required, app credential state unknown from
outside the deployment.

## Firecrawl vs Crawl4AI — not the same thing

`vps_scraper` is **Crawl4AI** at `crawl.marky.systems`, a different product on a
different box, labelled "Crawl4AI" on screen. It is the *preferred* renderer:
`runPageAudit` checks `vpsScraperConfigured()` first and only reaches for
Firecrawl as a fallback. Confusing the two is a long-standing trap — see
`selfhosted-firecrawl/DIGEST.md:32`.

## Endpoints AOOS does not use

Everything except `/v2/scrape`. From the vendor digest, the unused surface is:

`/v2/crawl` · `/v2/map` · `/v2/search` · `/v2/parse` · `/v2/agent` ·
`/v2/browser-create` · `/v2/scrape/{id}/interact` · `/v2/monitor-create` · batch
scrape.

Two are worth a thought rather than a shrug:

- **`/v2/map`** returns every URL on a site without fetching pages. `runPageAudit`
  currently discovers pages from robots.txt + sitemap + what Google reported
  (`readSiteDocuments`, `reportedPageUrls`). `/v2/map` would be a cheap
  cross-check on sitemap completeness — and on self-hosted it costs nothing.
- **`/v2/monitor-create`** schedules recurring change checks. AOOS already has
  its own scheduler and change-measurement machinery, so this would duplicate
  rather than add. Noted so nobody proposes it twice.

`/v2/search` is **not** a candidate: per the digest, a self-hosted instance has
no search engine behind it and runs from a single IP.

## Open question

No stored observation records a scrape that actually executed against
`fire.marky.systems`. Crawl4AI wins first and has not been seen failing over, so
the self-hosted Firecrawl path is correct in code and unexercised in practice.
Cheapest way to close it: run one page audit with `VPS_SCRAPER_BASE_URL`
deliberately unset and check `rendered_by` on the resulting observations.
