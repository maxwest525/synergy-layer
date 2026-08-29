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

## Google connections — deliberately NOT wired

**Standing decision (2026-08-28, operator):** OpenSEO is a DataForSEO front end.
Google data does not come through it. Do not connect GSC or GA4 here.

`get_search_console_performance` and `inspect_urls` are therefore two of OpenSEO's
24 tools that AOOS will never call. Treat them as out of scope, not as a gap.

The reason is narrowing. OpenSEO exposes exactly two Google tools. AOOS reads
Search Console directly and stores far more than those two return — including
`search_console_url_inspections`, which the robots lane grades indexation on — and
the operator holds three separate GA4 APIs. Routing Google data through OpenSEO
would cap both surfaces at whatever its wrapper chose to expose, and would put a
DataForSEO credit meter on data Google serves free.

The mirrored `SELF_HOSTING_GOOGLE_ANALYTICS.md` and
`SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md` beside this file are upstream's
instructions, kept for completeness. **They are not a to-do list.** An earlier
version of this digest carried a five-step "to connect" procedure in this
position; it was removed because it read as pending work rather than as a
declined option.

The container has only `DATAFORSEO_API_KEY` and `OPENROUTER_API_KEY` set, and that
is the intended state. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
`BETTER_AUTH_SECRET` are absent by decision, not by oversight.

One fact worth keeping from the removed procedure, because it applies to the
direct Google path too: the operator's GCP organization enforces
`iam.disableServiceAccountKeyCreation`, so service-account JSON keys do not work
on this account. Any Google integration here must use an OAuth web client.

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
