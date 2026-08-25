# OpenSEO digest (self-hosted)

Discovered 2026-08-25. Sources: the operator's live instance (probed directly on the
VPS), the upstream doc set mirrored beside this file, and an MCP tool-list capture
taken 2026-07-27. This digest is authoritative until re-verified.

Upstream: https://github.com/every-app/open-seo · product site https://openseo.so

## Instance

- Base URL: `https://seo.marky.systems`
- Host: self-host VPS `212.227.242.130` (ssh alias `selfhost`), **not** the marketing box
- Container `openseo`, image `ghcr.io/every-app/open-seo:latest`
- Bound `127.0.0.1:3003 -> 3003`; the image also exposes `3001/tcp` internally
- App version **0.1.6** (from `/api/health` on 2026-08-25)

`GET http://127.0.0.1:3003/api/health` from inside the box returns HTTP 200:

```json
{"status":"ok","version":"0.1.6","authMode":"local_noauth",
 "checks":{"auth":{"status":"ok","detail":"local_noauth — no auth, single admin user. Do not expose publicly without your own auth in front."},
           "dataforseo":{"status":"ok","detail":"Set"},
           "gsc":{"status":"ok","detail":"Not configured (optional). See docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md."},
           "ai":{"status":"ok","detail":"OPENROUTER_API_KEY set"},
           "database":{"status":"ok"}}}
```

## Authentication — read this before changing any credential

**OpenSEO has no authentication of its own on this deployment.** `AUTH_MODE=local_noauth`
is the documented and only mode for Docker self-hosting (`SELF_HOSTING_DOCKER.md:5`):
no auth checks, single admin user `admin@localhost`. Upstream's own instruction is to
"only expose it behind your own auth-protected reverse proxy."

That proxy is Caddy. The site block for `seo.marky.systems` is a `basic_auth` block with
**two valid users, `max` and `aoos`** (bcrypt hashes), fronting `reverse_proxy 127.0.0.1:3003`.
It is unscoped, so it covers every path including `/api/health` and `/mcp`.

Consequences that have already cost time:

- A 401 from `https://seo.marky.systems/...` is **Caddy**, not OpenSEO. The response carries
  `Server: Caddy` and `WWW-Authenticate: Basic realm="restricted"`. Check those headers
  before diagnosing anything about OpenSEO accounts, tokens, or the app database.
- Because both `max` and `aoos` are valid proxy users, a username is almost never the fault.
- Credentials live in the operator's Vaultwarden on the same box. Never ask for them in chat.

Synergy-layer connects with `OPENSEO_USERNAME` + `OPENSEO_PASSWORD` against
`OPENSEO_BASE_URL`, which is correct: those are the Caddy basic-auth pair, not app logins.

## Health probe

`GET {OPENSEO_BASE_URL}/api/health` with `Authorization: Basic base64(user:pass)`.

Free, instant, no upstream provider call, no credits. The response shape the connector
probe validates (`status` / `version` / `authMode` / `checks`) matches the live payload
above exactly, so this is a legitimate safe probe and OpenSEO must not sit in `noSafeProbe`.

## MCP surface

Endpoint `POST {base}/mcp`, protocol `2025-06-18`, server `OpenSEO MCP`.
Captured 2026-07-27 at server version 0.0.11 — note that the MCP server version and the
app version (0.1.6) are different numbers and drift apart.

The server advertises: "OpenSEO research tools use credits. Proceed with normal focused
research, but ask the user for confirmation before planned batches over 2,000 credits."
Treat that as binding — credits are DataForSEO spend.

24 tools, grouped:

| Group | Tools |
| --- | --- |
| Session | `whoami` |
| Projects | `list_projects`, `create_project` |
| Keywords | `research_keywords`, `save_keywords`, `list_saved_keywords`, `get_keyword_metrics` |
| Domain | `get_domain_overview`, `get_domain_keyword_suggestions` |
| Backlinks | `get_backlinks_overview`, `get_backlinks_profile` |
| SERP | `get_serp_results`, `get_ranked_keywords`, `get_rank_tracker`, `find_serp_competitors` |
| Local | `search_local_businesses`, `get_local_serp_results`, `get_google_business_questions` |
| Search Console | `get_search_console_performance`, `inspect_urls` |
| Site audit | `run_site_audit`, `get_audit_status`, `get_audit_issues`, `get_audit_pages` |

`whoami` returns the authenticated user, organization, server mode, token scopes and
credit balance, and **uses no credits** — it does not call DataForSEO. It is the correct
call for establishing context before any paid tool.

Every other tool should be assumed to cost credits until individually verified.

## Google connections — possible, not currently wired

`get_search_console_performance`, `inspect_urls`, and any GA4 reads need a Google OAuth
grant. As of 2026-08-25 the container has **only** `DATAFORSEO_API_KEY` and
`OPENROUTER_API_KEY` set — no `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or
`BETTER_AUTH_SECRET`. So GSC and GA4 through OpenSEO are available but not connected.

To connect (per `SELF_HOSTING_GOOGLE_ANALYTICS.md` and `SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`,
both mirrored beside this file):

1. Enable the Analytics Admin API and Analytics Data API in Google Cloud.
2. Create a **Web application** OAuth client; while the consent screen is in Testing,
   add every connecting account as a test user.
3. Register redirect URIs on the deployment origin:
   `https://seo.marky.systems/api/ga4/oauth/callback` and
   `https://seo.marky.systems/api/gsc/oauth/callback`. One client serves both.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (≥32 chars,
   `openssl rand -base64 32`) on the container and restart.
5. Connect the property from Project settings → Analytics / Search Console.

**Why this route matters here:** the operator's GCP organization enforces
`iam.disableServiceAccountKeyCreation`, which kills service-account JSON keys. OAuth web
clients are not covered by that policy, so this is a Google path that actually works on
this account.

Tokens are stored encrypted in Better Auth's account table. Disconnecting GA4 does not
disconnect Search Console.

## Limits and risks

- **Credits are real spend.** OpenSEO bills DataForSEO underneath. Confirm before batches
  over 2,000 credits, per the server's own instruction.
- **The proxy is the only thing standing between the public internet and a no-auth admin
  app.** Do not add a path exception to the Caddy block, and do not bypass it.
- `DATAFORSEO_API_KEY` here is base64 of `email:password`, not a bare token
  (`SELF_HOSTING_DOCKER.md:102-104`).
- The operator runs roughly five OpenSEO installs. A credential that works on one is not
  evidence for another — match on the exact hostname.
- MCP version 0.0.11 predates app 0.1.6 by a month; re-probe `/mcp` before relying on the
  tool list above.

## Mirrored upstream docs

The complete upstream `docs/` tree is beside this file (15 files, fetched 2026-08-25):
`SELF_HOSTING_DOCKER.md`, `SELF_HOSTING_GOOGLE_ANALYTICS.md`,
`SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`, `SELF_HOSTING_CLOUDFLARE*.md` (3),
`DATAFORSEO_API_KEY.md`, `LOCAL_DEVELOPMENT.md`, `LOCAL_POSTGRES.md`,
`PREVIEW_DEPLOYMENTS.md`, `CONTRIBUTING.md`, `MAINTAINERS.md`,
`EveryAppLearnings.md`, `default-project-cleanup.md`, `site-audit-pm-research.md`,
plus the repo `README.md`.
