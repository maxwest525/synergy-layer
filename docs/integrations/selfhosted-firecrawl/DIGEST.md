# Self-hosted Firecrawl digest

Discovered 2026-08-25. Sources: the operator's live stack (inspected directly on the VPS)
and the upstream `SELF_HOST.md` / Compose file mirrored beside this file. Authoritative
until re-verified.

Upstream: https://github.com/firecrawl/firecrawl · docs https://docs.firecrawl.dev

**This is not the paid Firecrawl.** The `firecrawl` connector (cloud, `api.firecrawl.dev`)
should read *missing* and that is correct — the operator does not hold a paid account.
The connector that matters is `selfhosted_firecrawl`.

## Instance

- Base URL: `https://fire.marky.systems`
- Host: self-host VPS `212.227.242.130` (ssh alias `selfhost`), **not** the marketing box
- API published on `127.0.0.1:3002` only — never reachable from off-box except through Caddy
- `ENV=local`, `FIRECRAWL_BUILD_SHA=unknown` (locally built image `firecrawl-api`, not a
  pinned upstream tag — upstream advises pinning an exact release tag, `SELF_HOST.md:22-24`)

Containers running:

| Container | Image | Role |
| --- | --- | --- |
| `firecrawl-api-1` | `firecrawl-api` (local build) | API + workers, `127.0.0.1:3002` |
| `firecrawl-playwright-service-1` | `firecrawl-playwright-service` | browser rendering |
| `firecrawl-redis-1` | `redis:alpine` | cache / rate limit |
| `firecrawl-rabbitmq-1` | `rabbitmq:3-management` | queue transport |
| `firecrawl-nuq-postgres-1` | `firecrawl-nuq-postgres` | NuQ queue backend |
| `firecrawl-foundationdb-1` | `foundationdb/foundationdb:7.3.63` | optional queue backend |

Separate and frequently confused: **`crawl4ai`** (`unclecode/crawl4ai:0.7.4`,
`127.0.0.1:11235`) behind `crawl.marky.systems`. Different product, different connector
(`vps_scraper`). Page audits reach for Crawl4AI first.

## Authentication — the bearer is Caddy's, not Firecrawl's

**Firecrawl itself is unauthenticated on this deployment.** `USE_DB_AUTHENTICATION=false`,
which upstream states is the intended starting posture and warns is not a complete auth
design (`SELF_HOST.md:25-28`, and "The default API is unauthenticated", `SELF_HOST.md:54-56`).
Verified: a scrape sent to `127.0.0.1:3002` from inside the box with **no** Authorization
header succeeds.

All access control is Caddy, and it is an exact header match, not basic auth:

```
fire.marky.systems {
    @authorized header Authorization "Bearer <token>"
    handle @authorized { reverse_proxy 127.0.0.1:3002 }
    handle { respond "Unauthorized" 401 }
}
```

What this means in practice:

- The match is on the **whole header value**, byte for byte. `SELFHOSTED_FIRECRAWL_API_KEY`
  must be exactly the token — a trailing space or newline from a paste produces a flat 401
  with no diagnostic anywhere.
- The gate covers **every path**, so the same bearer that scrapes also reaches liveness.
- A 401 from `fire.marky.systems` is Caddy refusing, never Firecrawl rejecting a key.
  Firecrawl has no keys.
- Structurally identical to `seo.marky.systems`, which uses `basic_auth` instead of a
  header matcher for the same reason: an unauthenticated app behind a proxy that owns auth.

## Health probe

`GET {SELFHOSTED_FIRECRAWL_BASE_URL}/is-production` with `Authorization: Bearer <key>`.

Returns HTTP 200 with body `{}` — verified 2026-08-25. Free, instant, renders nothing.
Never probe `/v2/scrape`: a health check must not cost a page fetch.

Synergy-layer declares `SELFHOSTED_FIRECRAWL_API_KEY` + `SELFHOSTED_FIRECRAWL_BASE_URL`
and probes exactly this endpoint. That code is on `main` at `f1b7534` and is correct.

## Scraping — verified working

`POST {base}/v2/scrape`, `Content-Type: application/json`,
body `{"url": "...", "formats": ["markdown"]}`.

Proven twice on 2026-08-25 against `127.0.0.1:3002`:

- `example.com` — `"success":true`, 180 chars of markdown
- `https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_ANALYTICS.md`
  — `"success":true`, `statusCode:200`, full JS-rendered markdown,
  `"proxyUsed":"basic"`, `"creditsUsed":1`

`creditsUsed` is an accounting field the code emits regardless of deployment; on a
self-hosted instance it is not a charge.

## Limits and risks

- **`PROXY_SERVER` and `SEARXNG_ENDPOINT` are empty.** Scrapes go out from the VPS's own
  IP with no rotation, and Firecrawl's `/search` has no engine behind it. Do not assume
  search works because scrape does.
- **CRLF kills requests.** A URL list saved on Windows sends `\r` inside the JSON and every
  request dies with `BAD_REQUEST_INVALID_JSON`. Strip carriage returns before posting.
- **Persistence is unverified.** Upstream's root Compose defines no persistent volumes for
  NuQ PostgreSQL, Redis or RabbitMQ (`SELF_HOST.md:57-61`). This deployment uses a local
  build, so check its Compose before assuming queue state survives a container replace.
- **Unpinned image.** `FIRECRAWL_BUILD_SHA=unknown` means there is no record of what
  revision is running; a rebuild can change behaviour with nothing to diff against.
- **`BULL_AUTH_KEY` is set** — if the queue admin UI is exposed, it must stay behind the
  same network restriction as everything else.
- Whether **synergy-layer itself** can reach this instance from Lovable's cloud is still
  unproven. Firecrawl works and the bearer works; the cloud→VPS call has never been
  observed succeeding, because page audits try Crawl4AI first and have never failed over.

## Mirrored upstream files

Beside this file, fetched 2026-08-25: `SELF_HOST.md`, `README.md`, `CONTRIBUTING.md`,
`docker-compose.yaml`, and `apps-api-env-example.txt` (upstream `apps/api/.env.example` —
upstream warns it is **not** a drop-in Compose contract, `SELF_HOST.md:40-41`).
