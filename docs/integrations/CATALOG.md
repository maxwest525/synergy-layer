# Integration catalog

Audited 2026-08-25 against `cb586dd` on `main`. Every claim below is either cited
to a file and symbol, or marked as unverified. Raw normalized output from the
sweep is in [`_audit/`](_audit/) — env-var name inventory, outbound host counts,
per-provider file lists, and the AOOS MCP tool list.

This file is a **catalog**, not a status board. `docs/context/CURRENT_BUILD.md`
is the current-state file; provider behaviour is authoritative only in
`docs/integrations/<provider>/DIGEST.md`.

## How to read the classifications

Each capability carries exactly one label. The labels are not ranked and are not
synonyms for each other.

| Label                   | Means, exactly                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `SUPPORTED_BY_PROVIDER` | The vendor offers it. Says nothing about this repo.                                                |
| `IMPLEMENTED_LOCALLY`   | Code exists in this repo that calls it.                                                            |
| `EXPOSED_AS_TOOL`       | Reachable through the AOOS MCP server or an MCP client. **Not** proof that authorization succeeds. |
| `CONFIGURED`            | Env-var names are declared and read. **Not** a synonym for working.                                |
| `READ_VERIFIED`         | A real read executed in this session and returned real data.                                       |
| `WRITE_VERIFIED`        | A write executed with explicit approval. **Nothing in this audit carries this label.**             |
| `PARTIAL`               | Some operations wired, others absent.                                                              |
| `STUB`                  | Placeholder that returns fabricated or empty results.                                              |
| `BROKEN`                | Wired, and observed failing.                                                                       |
| `UNWIRED`               | Declared, probed, or documented, but read by no code path that would use it.                       |
| `UNKNOWN`               | Could not be determined from here. Most credential states are this.                                |

### What this audit could and could not verify

**Could:** every line of local implementation; the AOOS MCP server's own tool
surface; reachability of all six self-hosted hosts; three external MCP servers
end to end.

**Could not:** whether any _connector credential_ is accepted. Those values live
in the Lovable deployment's environment, not on this machine — the local `.env`
holds six Supabase publishable values and nothing else. Every connector
authentication state below is therefore `UNKNOWN`, and no amount of green in the
`/capabilities/systems` ledger changes that from here.

**Did not attempt:** any write, purchase, publish, send, or permission change.

---

## Cross-cutting findings

Ordered by how much money or trust is at stake.

### 1. Two model paths, and only one goes through LiteLLM

Max's standing rule is that LLM calls route through his LiteLLM gateway. Two
paths exist and they disagree.

- **Through the gateway** — `src/lib/ai/routing.ts` picks LiteLLM
  (`LITELLM_BASE_URL` / `LITELLM_PROXY_API_BASE`) and falls back to the Lovable
  AI Gateway, then to a named absence. `src/lib/ai/gateway.server.ts:26` uses
  `routing.baseURL`. Three importers: `next-actions.server.ts`,
  `routes/api/agent-chat.ts`, `routes/api/studio-chat.ts`.
- **Direct to Google, bypassing it** — `src/lib/gemini.server.ts:19`
  `GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com"`, used by
  `generateStructuredWording` (`:generateContent`) and by
  `src/lib/knowledge/embeddings.server.ts:78,108` (`:batchEmbedContents`,
  `:embedContent`). Three importers: `knowledge/embeddings.server.ts`,
  `page-metadata-proposals.server.ts`, `title-h1-proposals.server.ts`.

This is deliberate, not an accident — the test is literally named _"calls Google
directly with a strict wording-only JSON schema"_
(`gemini.server.test.ts:10`). But it means page-wording generation and all
knowledge embeddings are billed to a Google key outside the gateway that exists
to control spend and routing. **Classification: `IMPLEMENTED_LOCALLY`, policy
violation.**

### 2. `.env` is tracked in git

`git ls-files .env` matches; `.gitignore` (32 lines) has no `env` entry. Today
the file holds only publishable Supabase values — project id, URL, publishable
key — so **nothing secret is currently exposed**. It is a foot-gun, not an
incident: the next secret written there is committed by default.
**Recommended:** `git rm --cached .env`, add `.env` to `.gitignore`, keep
`.env.example` (61 lines) as the template.

### 3. The Supabase MCP server cannot see this project's database

`mcp__claude_ai_Supabase__list_projects` returned 12 projects, all in
organization `amwpxkdhyohqmaygqehg`. AOOS's project ref is `zrfzllupoccmztyweznq`
(`.env`), **which is not among them**. That server is authenticated to a
different account, so it can neither read nor migrate AOOS's data. This confirms
the existing memory note that the route to AOOS's Postgres is the Lovable MCP.
Blast-radius note: that same token _can_ reach 12 other live projects.

### 4. Three connectors are registered and ignored

The exact "declared but read by nothing" pattern. Verified by grepping each name
across `src/` with `catalog.ts`, `probes.server.ts` and `surface-inventory.ts`
excluded:

| Name                                           | Consumers outside the catalog | Reading                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEARXNG_BASE_URL` / `_USERNAME` / `_PASSWORD` | **0**                         | `UNWIRED`. Catalogued at `catalog.ts:202-208` and probed at `probes.server.ts:142-146`, called by nothing. Consistent with the standing decision that SearXNG is not wanted — so the fix is to delete the row, not to wire it.   |
| `GOOGLE_ADS_CUSTOMER_ID`                       | **0**                         | Required as a credential (`catalog.ts:166-175`) and normalized (`catalog.ts:241` strips non-digits), but no call reads it. The only Ads endpoint in the repo is `customers:listAccessibleCustomers`, which takes no customer id. |
| `N8N_API_KEY`                                  | **0**                         | Appears only in a test fixture, `connectors/connections.server.test.ts:38,57,63`. Not in the catalog, not read. Dead name.                                                                                                       |

### 5. Google Ads asks for three secrets and does nothing with them

`src/lib/connectors/google-ads.server.ts` (133 lines) is the _entire_ Google Ads
integration: an OAuth `refresh_token` exchange against
`oauth2.googleapis.com/v3/token`, then a single read-only call to
`googleads.googleapis.com/v25/customers:listAccessibleCustomers`. There is no
reporting call, no campaign read, no spend data, and no product surface that
consumes Ads data. `/ads` and `/ads/advertisers` are the **OpenAI Ads** CAPI
surfaces, not Google Ads.

So placing `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` and the OAuth
triple buys exactly one thing: a green row. **Classification: `PARTIAL` —
authentication path implemented, business capability `UNWIRED`.** Worth deciding
deliberately before spending more time on the credential.

### 6. GA4 already has the auth machinery its probe is said to need

The single most load-bearing correction in this audit.

`src/lib/measurement/ga4.server.ts` implements **both** GA4 auth methods in
full — `serviceAccountToken()` (line 182) signs a JWT with
`createSign("RSA-SHA256")` (line 209) from `GA4_SERVICE_ACCOUNT_JSON`, and
`oauthRefreshToken()` (line 222) exchanges `GA4_OAUTH_REFRESH_TOKEN`. It then
calls `analyticsdata.googleapis.com/v1beta/{property}:runReport` with the
`analytics.readonly` scope.

It even exports `ga4ResponseProvesAuthentication(status)` (line 55) — a helper
whose _only purpose_ is to separate "credential rejected" (401) from
"authenticated but the property read failed" (403/400). Serena confirms its only
callers are `fetchGa4Inventory` inside the same file and `measurement.test.ts`.

Meanwhile `google_analytics_4` sits in `noSafeProbe`
(`probes.server.ts:34-39`), reported as `configured_no_safe_probe`. The saved
working state concluded a GA4 probe "needs service-account JWT signing first —
real build, not a tweak". **The signing already exists, in this repo, tested.**
A GA4 probe is a wiring job against `probeConnector`'s existing dispatch escape
hatch, the same one Google Ads uses.

### 7. Zero stubs, zero TODOs in production code

`grep -E "TODO|FIXME|HACK"` across `src/` and `scripts/` excluding tests: **0
matches**. No `vi.mock`, `createMock` or `__mocks__` outside test files. The
`.claude/hooks/no-fake-wiring.sh` rule is holding. Every `placeholder` hit is a
React input prop or a skeleton component.

---

## Runtime verification performed

Read-only. No writes, no spend, no resource creation.

### Self-hosted hosts — reachability

Unauthenticated `GET`, 12s timeout, from this machine on 2026-08-25:

| Host                      | Path             | Status  | Reading                                                                                    |
| ------------------------- | ---------------- | ------- | ------------------------------------------------------------------------------------------ |
| `n8n.marky.systems`       | `/healthz`       | **200** | `READ_VERIFIED` — reachable, health endpoint public                                        |
| `analytics.marky.systems` | `/api/heartbeat` | **200** | `READ_VERIFIED` — Umami reachable, heartbeat public                                        |
| `fire.marky.systems`      | `/is-production` | 401     | Reachable; auth required. Credential state `UNKNOWN`                                       |
| `crawl.marky.systems`     | `/health`        | 401     | Reachable; auth required. Credential state `UNKNOWN`                                       |
| `seo.marky.systems`       | `/api/health`    | 401     | Reachable; **Caddy** basic_auth, not OpenSEO's own — OpenSEO runs `authMode: local_noauth` |
| `litellm.marky.systems`   | `/v1/models`     | 401     | Reachable; auth required. Credential state `UNKNOWN`                                       |

A 401 here proves DNS, TLS and a live HTTP server — it proves nothing about
whether the app's stored credential is accepted. Those are different questions
and this audit can only answer the first.

### External MCP servers — authentication accepted

| Server   | Read call       | Result                                                                                                     |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| Lovable  | `get_me`        | `READ_VERIFIED`. Account `maxw@trumoveinc.com`; workspaces "Max" (owner) and "JONATHAN's Lovable" (member) |
| Supabase | `list_projects` | `READ_VERIFIED`. 12 projects, org `amwpxkdhyohqmaygqehg` — **none is AOOS**                                |
| Vercel   | `list_teams`    | `READ_VERIFIED`. One team, `maxs-projects-6b4bb981`, plan `pro`                                            |

---

## AOOS as an MCP server

AOOS is not only an MCP client — it **publishes** an MCP server.

- **Registration:** `src/routes/mcp.ts` (auto-generated by `@lovable.dev/mcp-js`,
  do not edit) mounts `createTanStackMcpHandler` at `/mcp`, with OAuth metadata
  at `/.well-known/oauth-protected-resource`.
- **Definition:** `src/lib/mcp/index.ts` — `defineMcp({ name: "aoos-marketing-os",
version: "0.1.0" })`.
- **Auth:** `auth.oauth.issuer({ issuer: "https://${VITE_SUPABASE_PROJECT_ID}.supabase.co/auth/v1",
acceptedAudiences: "authenticated" })`. Tenant scope is the authenticated
  Supabase operator; roles are read from `user_roles` (`guard.ts:25-28`).
- **Tool availability:** **static** — eight tools, listed literally in the
  `tools:` array. Nothing is registered at runtime.

| Tool                     | Annotations                                                          | Destructive / external-write / financial?                           |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `list_inbox`             | `readOnlyHint: true, idempotentHint: true, openWorldHint: false`     | No                                                                  |
| `list_recommendations`   | same                                                                 | No                                                                  |
| `get_recommendation`     | same                                                                 | No                                                                  |
| `list_workflow_runs`     | same                                                                 | No                                                                  |
| `list_capabilities`      | same                                                                 | No                                                                  |
| `list_assets`            | same                                                                 | No                                                                  |
| `list_openseo_tools`     | same                                                                 | No                                                                  |
| `call_openseo_free_read` | `readOnlyHint: true, idempotentHint: false, **openWorldHint: true**` | **The one to watch.** It proxies a live call to another MCP server. |

`call_openseo_free_read` is gated properly: it re-fetches OpenSEO's current
server metadata and refuses unless `classifyOpenSeoTool(tool).mode === "free_read"`
(`call-openseo-free-read.ts:29-31`), then invokes with `confirmed: false`. The
classification is read from live metadata at call time, not cached — so a tool
that stops being free stops being callable.

**Controls that apply to every tool** (`src/lib/mcp/guard.ts`): a best-effort
per-caller rate limit of 60 calls / 60s, and an audit row in `activity_events`
for every call — client, operator, tool, duration, outcome, and argument **keys
only**, never values.

`EXPOSED_AS_TOOL` for all eight. None is `READ_VERIFIED`: verifying would mean
authenticating against the deployed app as an operator, which was out of scope
for a read-only local audit.

### Measured 2026-08-25: nobody has ever called any of them

`guard.ts:43` files every MCP tool call to `activity_events` with
`actor_kind: "mcp_client"`, so usage is a query rather than a guess. Run against
the live database through the Lovable MCP:

```sql
select actor_kind, count(*), max(occurred_at) from activity_events group by 1;
--  system  245   2026-08-25 03:23
--  user    128   2026-08-25 04:41
--  (no mcp_client row)
```

**373 audited events, zero from an MCP client.** The audit trail demonstrably
works — it is recording system and operator activity as recently as today — so
the absence is real, not a logging failure.

So the AOOS MCP server is fully built, OAuth-protected, rate-limited, audited,
and **has never been used**. That is not an argument for deleting it: it was
built so an outside agent _could_ read the OS, and nothing has been pointed at
`/mcp` yet. But it does mean none of the eight tools has ever proven itself
end to end against a real caller, and no design assumption in them has been
tested by use. Treat `EXPOSED_AS_TOOL` here as its literal self and nothing more.

**Next action:** point one MCP client at `https://trumove.marky.systems/mcp` and
call `list_inbox`. One successful call moves eight tools from "written" to
"works", and would be the cheapest verification available anywhere in this
catalog.

---

## Per-integration catalog

Sources marked **[live]** were checked against official documentation during
this audit. **[digest]** means the repo's own `DIGEST.md` is the source and was
not re-derived. **[unverified]** means neither — the capability list is stated
from code only, and the provider's full surface was not enumerated.

### DataForSEO

- **Business purpose:** keyword, SERP, competitor and backlink evidence.
- **Local files:** `src/lib/dataforseo/` — `transport.server.ts` (456 lines, the
  gateway), `budget.server.ts`, `backlinks.server.ts`,
  `competitor-intelligence.server.ts` (527), `competitors.server.ts`,
  `competitor-pages.server.ts`, `keywords.server.ts`, `backlink-evidence.server.ts`,
  `backlink-strategy.ts`. UI: `src/components/os/dataforseo-panel.tsx`.
  Inbound webhook: `src/routes/api/public/hooks/dataforseo-postback.ts`.
- **Auth:** HTTP Basic. `DATAFORSEO_BASIC_TOKEN`, or `DATAFORSEO_LOGIN` +
  `DATAFORSEO_PASSWORD` (`transport.server.ts:73,96`).
- **API version:** v3, pinned at `transport.server.ts:10`.
- **Official capabilities:** [digest] `docs/integrations/dataforseo/DIGEST.md`
  and `PLAN.md`. Not re-derived here.
- **Locally implemented:** `IMPLEMENTED_LOCALLY` — SERP, keyword, competitor and
  backlink reads, plus a postback receiver for async jobs.
- **Reliability controls:** concurrency cap 8, `MAX_ATTEMPTS` 3, retry allowed
  only for provider code `40501`; budget conditions are never retried
  (`transport.server.ts:14-20`). Rate-limit headers `x-ratelimit-{limit,remaining,reset}`
  are read and stored (line 144).
- **Cost controls — the strongest in the repo:** a per-tenant, per-month row in
  `dataforseo_budgets` with a hard stop. `assertBudget` throws `BudgetExceeded`
  before a call that would cross the ceiling (`budget.server.ts:88-95`), and
  every call writes a ledger row with cost attribution.
- **Risk:** metered per call. The hard stop is the mitigation and it is real.
- **Next action:** none. This is the reference implementation the other metered
  providers should be measured against.

### SerpApi

- **Business purpose:** live SERP reads and a canary check.
- **Local files:** `src/lib/serpapi/transport.server.ts` (159),
  `account.server.ts`, `canary.server.ts`.
- **Auth:** `SERPAPI_API_KEY` as a query parameter.
- **Endpoints:** `serpapi.com/search.json`, `serpapi.com/account.json`.
- **Official capabilities:** [digest] `docs/integrations/serpapi/DIGEST.md`.
- **Locally implemented:** `IMPLEMENTED_LOCALLY`. `MAX_SEARCHES_PER_RUN = 120`
  is a deliberate per-run credit ceiling (`transport.server.ts:16-20`). A 429
  raises `SerpApiFailure("rate_limited", …)` (line 89-90) — **no retry, no
  backoff**, which is the safe choice for a credit-billed API.
- **Cost:** one successful request = one credit, whatever it returns
  (`transport.server.ts:12`, citing digest section 8). Cached/empty results
  return `credits: 0`.
- **Next action:** none outstanding.

### Firecrawl — self-hosted, and cloud as fallback

- **Business purpose:** render JavaScript pages the raw HTML cannot prove.
- **The chooser:** `src/lib/firecrawl-endpoint.ts` → `firecrawlEndpoint(env)`.
  Self-hosted wins when `SELFHOSTED_FIRECRAWL_BASE_URL` **and**
  `SELFHOSTED_FIRECRAWL_API_KEY` are both non-empty; otherwise
  `FIRECRAWL_CLOUD_URL` (`api.firecrawl.dev/v2/scrape`) if a cloud key exists;
  otherwise `null`. A half-configured self-hosted entry falls through to cloud
  by design.
- **Callers (6):** `dataforseo/competitor-pages.server.ts:65`,
  `execution/execute.server.ts:286`, `execution/execution.functions.ts:218`,
  `page-audit.server.ts:463`, `web-research.server.ts:78`, and the connector
  probe.
- **Probe:** `selfhosted_firecrawl` → `${BASE}/is-production`, chosen because
  it costs nothing; the comment at `probes.server.ts:154` explicitly forbids
  probing `/v2/scrape`. Cloud `firecrawl` → `/v1/team/credit-usage`.
- **API version:** v2 scrape for both deployments; the file records they were
  verified to return the same `{ success, data: { rawHtml, markdown } }` shape
  on 2026-08-22. [digest] `docs/integrations/selfhosted-firecrawl/`.
- **Classification:** `IMPLEMENTED_LOCALLY` + `CONFIGURED`. **Not**
  `READ_VERIFIED` — no stored evidence records a scrape that executed against
  `fire.marky.systems`, because `runPageAudit` prefers Crawl4AI and the
  Firecrawl branch has not been observed firing.
- **Risk:** the cloud fallback is silent by design. If the self-hosted key is
  ever blank while the base URL is set, spend resumes with no error.
- **Next action:** record `rendered_by` for one real audit to move this to
  `READ_VERIFIED`, or accept it as a documented unknown.
- **Full surface map:** [`firecrawl.md`](firecrawl.md) — which of the ~9 v2
  endpoints AOOS uses (one, `/v2/scrape`) and exactly which parameters each of
  the four callers sends. Note the cache handling recorded there: both
  proof-critical callers already send `maxAge: 0`, so Firecrawl's two-day default
  cache cannot make a verification prove the pre-edit page. Vendor-level
  reference: `~/.claude/integration-docs/firecrawl.md`.
- **Drift:** `connectors/surface-inventory.ts:558` still describes the fallback
  as "the metered Firecrawl", which predates the chooser and reads as though the
  fallback is always billed.

### Crawl4AI (`vps_scraper`)

- **Business purpose:** the preferred page renderer. Runs on Max's box, so a
  page it renders costs nothing (`page-audit.server.ts:66`).
- **Local files:** `src/lib/connectors/vps-scraper.server.ts`, consumed by
  `page-audit.server.ts`.
- **Auth:** `VPS_SCRAPER_API_KEY` bearer; `VPS_SCRAPER_BASE_URL` defaulted
  in code to `https://crawl.marky.systems` (`catalog.ts:64`).
- **Probe:** `${BASE}/health`. **Reachable, 401** from here.
- **Classification:** `IMPLEMENTED_LOCALLY` + `CONFIGURED`; auth state `UNKNOWN`.
- **Official capabilities:** [unverified] — Crawl4AI's full API surface was not
  enumerated.

### Google Analytics 4

- **Business purpose:** event and page inventory, change measurement windows,
  daily observations.
- **Local files:** `src/lib/measurement/ga4.server.ts` (547),
  `measurement/ga4.ts`, `ga4-rules.server.ts`, `ga4-rule-checks.ts`,
  `change-measurements.server.ts`. UI: `/ga4`, `/measurement/tools`.
- **Auth (both implemented):** service-account JWT — RSA-SHA256 via
  `node:crypto` `createSign` (line 209) from `GA4_SERVICE_ACCOUNT_JSON`; or
  OAuth refresh from `GA4_OAUTH_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN`
  (line 222-232). Scope: `https://www.googleapis.com/auth/analytics.readonly`.
- **API version:** Data API **v1beta**, `POST /v1beta/{property}:runReport`.
  **[live]** Verified current: v1beta is the documented current version, docs
  last updated 2026-04-23, and `runReport` is the documented preferred method
  for simple queries. The repo's request shape (dateRanges, dimensions,
  metrics, metricAggregations, orderBys, dimensionFilter, returnPropertyQuota,
  `limit: "10000"`) matches the documented schema.
- **Locally implemented:** `IMPLEMENTED_LOCALLY` — `fetchGa4Inventory`,
  `runGa4Inventory`, `runGa4PageWindow`, `runGa4DailyObservation`. Quota is read
  back via `returnPropertyQuota` and stored.
- **Connector ledger:** `google_analytics_4` ∈ `noSafeProbe` →
  `configured_no_safe_probe`, permanently degraded.
- **The gap:** see cross-cutting finding 6. The probe is missing, not the auth.
- **Next action, highest value in this audit:** add a `google_analytics_4` branch
  to `probeConnector`'s dispatch that calls `runReport` with `limit: "1"` and
  classifies via the existing `ga4ResponseProvesAuthentication`. Small, and it
  removes a permanently-amber row.

### Google Search Console

- **Business purpose:** the primary search-evidence source; property selection
  gates the page audit.
- **Local files:** `src/lib/search-console.server.ts` (936),
  `search-console-rules.server.ts` (448), `search-console-connection.ts`,
  `src/components/os/search-console-panel.tsx`.
- **Auth:** `LOVABLE_API_KEY` + `GOOGLE_SEARCH_CONSOLE_API_KEY`
  (`catalog.ts:89`) — routed through Lovable's connector gateway rather than a
  direct Google OAuth client.
- **Connector ledger:** ∈ `noSafeProbe` → permanently `configured_no_safe_probe`.
- **Classification:** `IMPLEMENTED_LOCALLY`, probe `UNWIRED`, auth `UNKNOWN`.
- **Official capabilities:** [digest] `docs/integrations/google-search-essentials/DIGEST.md`
  covers the guidelines, not the API surface. The Search Console API's full
  capability list is [unverified] here.

### Google Ads

See cross-cutting finding 5.

- **Local files:** `src/lib/connectors/google-ads.server.ts` (133) — the whole
  integration.
- **Auth:** OAuth refresh (`GOOGLE_ADS_OAUTH_CLIENT_ID` / `_SECRET` /
  `_REFRESH_TOKEN`) exchanged at `oauth2.googleapis.com/v3/token`, plus
  `GOOGLE_ADS_DEVELOPER_TOKEN`; `GOOGLE_ADS_ACCESS_TOKEN` is an alternative
  strategy (`catalog.ts:166`).
- **API version:** v25. **[live]** v25 was announced on the Google Ads Developer
  Blog in July 2026 and its reference docs were updated 2026-08-19, so it is
  current. The exact sunset date could not be retrieved — the sunset-dates page
  did not render its table. Google runs three releases and three sunsets a year
  with three versions maintained at once, so **v25 will age out; this pin needs
  a calendar reminder, not a one-time check.**
- **Classification:** `PARTIAL`. Auth path `IMPLEMENTED_LOCALLY`; every business
  capability `UNWIRED`.
- **Next action:** decide explicitly whether Ads reporting is wanted. If not,
  stop asking for three secrets.

### PageSpeed Insights

- **Local files:** `src/lib/measurement/pagespeed.server.ts`.
- **Auth:** `PAGESPEED_API_KEY`, optional — it only lifts the anonymous quota.
- **Connector ledger:** ∈ `noSafeProbe`.
- **Classification:** `IMPLEMENTED_LOCALLY`, `CONFIGURED` optional, probe
  `UNWIRED`. Free.

### Perplexity

- **Local files:** `src/lib/web-research.server.ts` — the only consumer of
  `PERPLEXITY_API_KEY`.
- **Endpoints seen:** `api.perplexity.ai`, `console.perplexity.ai`.
- **Connector ledger:** ∈ `noSafeProbe` — correctly, per
  `probes.server.test.ts:236`, _"does not spend against providers that have no
  read-only health endpoint"_.
- **Classification:** `IMPLEMENTED_LOCALLY`, auth `UNKNOWN`. Metered.
- **Official capabilities:** [unverified].

### Gemini — generation and embeddings

- **Local files:** `src/lib/gemini.server.ts`,
  `src/lib/knowledge/embeddings.server.ts`, consumed by
  `page-metadata-proposals.server.ts`, `title-h1-proposals.server.ts`,
  `knowledge/runtime.server.ts`.
- **Auth:** `GEMINI_API_KEY` via `x-goog-api-key` header (generation) and as a
  `?key=` query parameter (embeddings).
- **API version / models:** `v1beta`. Default generation model
  `gemini-3.6-flash` (`gemini.server.ts:20`); embeddings default
  `gemini-embedding-001`. **[live]** `gemini-3.6-flash` is a real stable model
  ID, released 2026-07-21, on `generativelanguage.googleapis.com/v1beta`. It is
  **no longer the newest Flash** — Gemini 3.7 Flash shipped 2026-08-13 — but it
  is still listed as stable, so this is a currency note, not a break.
- **Reliability:** 20s timeout via `AbortSignal.timeout`
  (`gemini.server.ts:21,121`). **No retry and no spend ceiling** — the weakest
  cost posture of any metered provider here, in contrast to DataForSEO.
- **Classification:** `IMPLEMENTED_LOCALLY`; **bypasses LiteLLM** — see
  cross-cutting finding 1.
- **Next action:** route both through `ai/routing.ts`, or state in writing why
  they are exempt.

### LiteLLM (self-hosted gateway)

- **Local files:** `src/lib/ai/routing.ts` (the decision),
  `ai/gateway.server.ts`, `ai/structured.server.ts`, `ai/models.ts`,
  `ai/require-operator.server.ts`, `ai/tools/`.
- **Auth:** `LITELLM_API_KEY` / `LITELLM_PROXY_API_KEY`, base
  `LITELLM_BASE_URL` / `LITELLM_PROXY_API_BASE`. Model slots:
  `LITELLM_MODEL_REASONING`, `_FAST`, `_WORDING`.
- **Probe:** `${BASE}/v1/models` with a `/v1` suffix guard
  (`probes.server.ts:97`). **Reachable, 401** from here.
- **Routing:** LiteLLM first — the only route that can use prompt caching — then
  the Lovable AI Gateway, then a named absence
  (`routing.ts:139,144`). No silent vendor-SDK fallback.
- **Classification:** `IMPLEMENTED_LOCALLY` + `CONFIGURED`; auth `UNKNOWN`.

### OpenSEO (self-hosted, reached over MCP)

- **Business purpose:** an entire second MCP server's toolset, brokered through
  AOOS with free-read enforcement.
- **Local files:** `src/lib/openseo/` — `mcp.server.ts` (discovery),
  `catalog.ts` (`classifyOpenSeoTool`), `runtime.server.ts`
  (`invokeOpenSeoToolForOperator`), `tool-arguments.ts`, `types.ts`,
  `functions.ts`. UI: `/openseo`. MCP: `list_openseo_tools`,
  `call_openseo_free_read`.
- **Auth:** `OPENSEO_USERNAME` / `OPENSEO_PASSWORD` as HTTP Basic against
  `OPENSEO_BASE_URL`. **The gate is Caddy, not OpenSEO** — the service itself
  runs `authMode: local_noauth` with a single admin user.
- **Probe:** `${BASE}/api/health`, shape-checked against
  `{ status: "ok", version, authMode, checks }` (`probes.server.ts:55-60`).
  **Reachable, 401** from here — expected without the basic-auth password.
- **Tool availability: dynamic.** Unlike the AOOS server's static eight,
  OpenSEO's tools are discovered live and re-classified on every call.
- **Classification:** `IMPLEMENTED_LOCALLY` + `EXPOSED_AS_TOOL`; auth `UNKNOWN`.
- **Official capabilities:** [digest] `docs/integrations/openseo/` — 18 files
  including self-hosting and GA/GSC guides.

### Umami (self-hosted analytics)

- **Local files:** `src/lib/umami/client.server.ts` (245),
  `umami/observe.server.ts`, `umami.functions.ts`,
  `src/components/os/umami-panel.tsx`.
- **Auth — three paths, in precedence order:** `UMAMI_BEARER_TOKEN`, then
  `UMAMI_API_KEY` (`x-umami-api-key`), then `UMAMI_USERNAME` + `UMAMI_PASSWORD`
  exchanged for a token (`client.server.ts:58,98`). The probe's
  `umamiProbeAuth` mirrors this precedence exactly and deliberately
  (`probes.server.ts:177-183`) — divergence here is what previously made a
  working Umami report as failing.
- **Probe:** `${BASE}/api/heartbeat`. **200 from here** — server reachable and
  the heartbeat is public.
- **Classification:** `IMPLEMENTED_LOCALLY` + `CONFIGURED`; host
  `READ_VERIFIED`; auth `UNKNOWN`.
- **Official capabilities:** [digest] `docs/integrations/umami/DIGEST.md`.

### n8n (self-hosted automation)

- **Local files:** `src/lib/connectors/n8n.server.ts`, `workflow-runner.server.ts`
  (980 lines).
- **Auth:** `N8N_WEBHOOK_SECRET` — the only credential. `N8N_BASE_URL` and
  `N8N_SEO_WORKFLOW_WEBHOOK_URL` both carry in-code defaults
  (`catalog.ts:62-63`), so nothing else is outstanding.
- **Probe:** `${BASE}/healthz`, explicitly chosen so a health check never
  triggers a workflow (`probes.server.test.ts:144`). **200 from here.**
- **Classification:** `IMPLEMENTED_LOCALLY`; host `READ_VERIFIED`; the webhook
  secret is `UNKNOWN` and is the one thing blocking this row.
- **Dead name:** `N8N_API_KEY` — test fixture only.

### GitHub (executor)

- **Business purpose:** the approved-change execution path — this is how AOOS
  actually applies a page edit.
- **Local files:** `src/lib/audit-fixes.server.ts`,
  `execution/execute.server.ts`, `execution/execution.functions.ts`,
  `src/components/os/execution-card.tsx`.
- **Auth:** `GITHUB_EXECUTOR_TOKEN`.
- **Probe:** `https://api.github.com/repos/${GOVERNED_REPO}`, and it sends a
  `User-Agent` deliberately — GitHub answers 403 without one
  (`probes.server.test.ts:270`).
- **Classification:** `IMPLEMENTED_LOCALLY`; auth `UNKNOWN`.
- **Risk — the highest-consequence write path in the repo.** Mitigated by the
  approval architecture: changes route through `/changes/$id` and `runTransition`,
  and nothing writes an approved or applied state directly (`AGENTS.md`).

### Supabase

- **Business purpose:** the database, auth, and every stored observation.
- **Local files:** `src/integrations/supabase/` — `client.ts`,
  `client.server.ts` (`supabaseAdmin`), `auth-middleware.ts`, `auth-attacher.ts`,
  generated `types.ts`, `previewAuthStorage.ts` (Lovable-regenerated, eslint-ignored).
  80 migrations in `supabase/migrations/`.
- **Auth:** `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` server-side;
  `VITE_SUPABASE_PUBLISHABLE_KEY` client-side.
- **Probe:** `${SUPABASE_URL}/rest/v1/`.
- **Project:** `zrfzllupoccmztyweznq`. **Not reachable via the connected Supabase
  MCP server** — see cross-cutting finding 3.
- **Classification:** `IMPLEMENTED_LOCALLY` + `CONFIGURED`.

### OpenAI Ads (CAPI bridge)

- **Business purpose:** conversion and event delivery; the `/ads` surfaces.
- **Local files:** `src/lib/openai-ads/` — `capi.server.ts`, `capi-contract.ts`,
  `capi-delivery.ts`, `capi-settings.ts`, `config.ts`, `events.ts`,
  `ingest.server.ts`, `validation.ts`. Routes: `/ads`, `/ads/advertisers`.
- **Inbound webhooks:** `src/routes/api/public/hooks/openai-ads-conversions.ts`
  and `openai-ads-events.ts`, authenticated by `OPENAI_ADS_BRIDGE_SECRET` /
  `OPENAI_ADS_CAPI_BRIDGE_SECRET` (`openai-ads/config.ts`).
- **Not in the 19-connector catalog** — it has its own config module and no
  ledger row, so it is invisible on `/capabilities/systems`.
- **Classification:** `IMPLEMENTED_LOCALLY`; auth `UNKNOWN`. **This is an
  outbound-write integration** (it delivers conversion events), which makes its
  absence from the connector ledger the most notable coverage gap in that
  screen.
- **Official capabilities:** [unverified].

### SearXNG

`UNWIRED`. Catalogued and probed, zero consumers. The standing decision is that
SearXNG is not wanted. **Next action: delete the catalog row and the probe
branch** — a registered connector that nothing calls is exactly the "looks
connected on every dashboard" failure the self-hosted rule warns about.

---

## Inbound surfaces (webhooks)

Five public endpoints under `src/routes/api/public/hooks/`:

| Endpoint                    | Purpose                           | Auth                            |
| --------------------------- | --------------------------------- | ------------------------------- |
| `dataforseo-postback.ts`    | async job results from DataForSEO | provider callback               |
| `openai-ads-conversions.ts` | conversion delivery               | `OPENAI_ADS_BRIDGE_SECRET`      |
| `openai-ads-events.ts`      | event delivery                    | `OPENAI_ADS_CAPI_BRIDGE_SECRET` |
| `propose-from-evidence.ts`  | inbound proposal creation         | see route                       |
| `scheduler-tick.ts`         | external scheduler trigger        | see route                       |

Plus `src/routes/api/agent-chat.ts` and `studio-chat.ts` (model-backed chat) and
`src/routes/mcp.ts` (the MCP server).

---

## Gap analysis

**Provider capabilities not exposed**

- Google Ads: everything except `listAccessibleCustomers`.
- GA4: Admin API — a digest exists (`docs/integrations/ga4-admin-api/DIGEST.md`)
  with no corresponding client.
- GA4 Measurement Protocol: digest exists, no client.

**Local features not connected to runtime**

- `ga4ResponseProvesAuthentication` — purpose-built for a probe, unused by one.
- `GOOGLE_ADS_CUSTOMER_ID` — required, normalized, never read.

**MCP tools with no product UI** — none. All eight map to existing surfaces.

**Product UI calling stubs or mocks** — none found. Zero stubs in `src/`.

**Overlapping integrations**

- Three page renderers: Crawl4AI, self-hosted Firecrawl, cloud Firecrawl. The
  precedence is explicit and correct; the overlap is intentional redundancy.
- Two model paths — see finding 1. This overlap is _not_ intentional redundancy.
- Two search-evidence providers: Search Console and DataForSEO/SerpApi. Distinct
  purposes.

**Missing scopes** — none identified. GA4 requests exactly
`analytics.readonly`, correct for `runReport`.

**Obsolete API versions** — none in use. Ads v25 current, GA4 v1beta current,
DataForSEO v3, Firecrawl v2, Gemini v1beta. Gemini's default model is one
generation behind but stable.

**Duplicated model or network calls** — the Gemini split above. No duplicated
network calls found within a single request path.

**Capabilities connectable directly instead of adding layers**

- The GA4 probe: reuse the existing token helper rather than building anything.
- Search Console currently routes through the Lovable connector gateway
  (`LOVABLE_API_KEY`); given the migration off Lovable, a direct Google OAuth
  client would remove a dependency rather than add one.

---

## Recommended next actions, ranked

1. **Wire the GA4 probe** using the existing JWT/OAuth helpers and
   `ga4ResponseProvesAuthentication`. Highest value, smallest change, removes a
   permanently-degraded ledger row. (finding 6)
2. **Untrack `.env`** and add it to `.gitignore` before anything secret lands in
   it. (finding 2)
3. **Decide on Google Ads.** Either wire a reporting call or stop requiring
   three secrets for a green row. (finding 5)
4. **Route Gemini through LiteLLM**, or write down why it is exempt. (finding 1)
5. **Delete the SearXNG catalog row and probe branch.** (finding 4)
6. **Give the OpenAI Ads CAPI bridge a connector row**, since it is an
   outbound-write integration that the ledger cannot currently see.
7. **Add a spend ceiling to Gemini**, matching the DataForSEO pattern.
8. **Diary the Google Ads v25 sunset** — three versions maintained at a time
   means this pin expires on a schedule.
9. **Fix the `surface-inventory.ts:558` wording** so the Firecrawl fallback is
   not described as always metered.
