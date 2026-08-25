# Restored context: verification and repository map

Written 2026-08-25 against `cb586dd` (PR #64) on `main`, working tree clean,
`origin/main` fetched and identical.

Two purposes, kept separate on purpose:

1. **Part A** audits the working state that `/restore` loaded from
   `~/.claude/work-state/aoos.md` (saved 2026-08-24 21:20) against this
   repository. The restored context is *not* overwritten anywhere; each claim is
   quoted and then marked. Where it is wrong, the correction and the evidence
   are both given.
2. **Part B** is the structural map — entrypoints, module boundaries,
   dependencies and the call paths that matter — read from code at the same
   commit.

Verified here: `npm run typecheck` clean · `npm test` 1256 passing in 123 files ·
`npx eslint .` 0 errors, 14 pre-existing `react-refresh/only-export-components`
warnings.

---

## Part A — audit of the restored context

### A1. Stale — the facts moved

| Restored claim | Now | Evidence |
| --- | --- | --- |
| "`main` = `f1b7534`, CI green, checkout clean" | `main` = **`cb586dd`** — PR #64, "Surface the status code the connector probe already recorded", landed after the save. Clean and level with `origin/main`. | `git rev-parse HEAD` / `git rev-list --count HEAD..origin/main` = 0 |
| "`npm test` 123 files / 1253 tests" | 123 files / **1256** tests. The three new ones are #64's. Typecheck and lint figures are unchanged and still correct. | test run above |

### A2. Superseded — the work described as pending is done in code

**Restored claim:** *"Unproven: the app calling self-hosted Firecrawl. Page
audits use Crawl4AI first and it has never failed over."*

The second sentence still holds. The first is now too pessimistic, and the
distinction matters because it is the difference between a code gap and a
runtime observation:

- **The wiring exists and is centralised.** `src/lib/firecrawl-endpoint.ts`
  exports `firecrawlEndpoint(env)`, the single chooser. It returns the
  self-hosted deployment whenever `SELFHOSTED_FIRECRAWL_BASE_URL` **and**
  `SELFHOSTED_FIRECRAWL_API_KEY` are both non-empty, and only then falls through
  to `FIRECRAWL_CLOUD_URL`. Cloud is the fallback, never the default.
- **Six production call sites, no bypasses.** `dataforseo/competitor-pages.server.ts:65`,
  `execution/execute.server.ts:286`, `execution/execution.functions.ts:218`,
  `page-audit.server.ts:463`, `web-research.server.ts:78`, plus the connector
  probe. A repo-wide grep for `api.firecrawl.dev` finds it in exactly two
  places: the constant inside `firecrawl-endpoint.ts`, and the *cloud
  connector's own probe* (`probes.server.ts:89`), which is correct — that probe
  exists to report on the cloud account.
- **The false comment is gone.** The `command-center.ts` comment that once
  asserted Firecrawl was self-hosted and therefore free now reads accurately:
  the audit renders on Crawl4AI when configured, and it names the fallback.

**What is genuinely still unproven** is narrower than the saved note implies:
no stored observation in this repo records a scrape that *executed* against
`fire.marky.systems`. `runPageAudit` prefers Crawl4AI (`vpsScraperConfigured`)
and the Firecrawl branch has not been observed firing. That is a
runtime-evidence gap, not a wiring gap.

*Loose end found while checking this:* `connectors/surface-inventory.ts:558`
still describes the fallback as "the metered Firecrawl". That is only true when
the self-hosted entry is unconfigured or half-configured. The sentence is not
wrong so much as it predates the chooser; it reads as though the fallback is
always billed.

### A3. Contradicted — the stated blocker is not the real one

**Restored claim:** *"GA4 has no safe probe and cannot get one cheaply. The
probe model is a plain `{url, headers}` descriptor; GA4 needs service-account
JWT signing first. Real build, not a tweak."*

The premise is right and the conclusion drawn from it is wrong.

`RequestDescriptor` is indeed `{ url, headers }` (`probes.server.ts:29-32`), and
GA4 does need signing. But **the descriptor path is not the only path.**
`probeConnector` dispatches to a dedicated module *before* it ever builds a
descriptor:

```
probeConnector(key)
  ├─ key === "google_ads" → import("./google-ads.server").probeGoogleAds()   ← escape hatch
  ├─ readiness "missing"   → { health: unknown, outcome: missing_configuration }
  ├─ key ∈ noSafeProbe     → { health: degraded, outcome: configured_no_safe_probe }
  └─ configuredRequest()   → the {url, headers} path
```

`google-ads.server.ts` is 133 lines and already does the harder version of
exactly this problem: an OAuth `refresh_token` exchange against
`googleapis.com/oauth2/v3/token`, then a read-only Google Ads v25 call with the
resulting token. GA4 would follow the same shape.

So: still real work, still not a tweak — but "the probe model blocks it" is not
the reason, and the next session should not plan around a rewrite that is not
needed. The precedent to copy is named above.

### A4. Confirmed — verified true at this commit

- **19 connectors.** `CONNECTOR_CATALOG` in `catalog.ts` has exactly 19 `key:`
  entries.
- **Four with no probe.** `noSafeProbe` (`probes.server.ts:34-39`) =
  `google_search_console`, `google_analytics_4`, `pagespeed_insights`,
  `perplexity`. Note that **Google Ads is not one of them** — it is probed via
  the dedicated module, so the count is 15 probed / 4 not.
- **n8n needs `N8N_WEBHOOK_SECRET` only.** Confirmed twice over:
  `credentialStrategies: [["N8N_WEBHOOK_SECRET"]]`, and both of its config
  requirements (`N8N_BASE_URL`, `N8N_SEO_WORKFLOW_WEBHOOK_URL`) carry in-code
  defaults in `AOOS_CONNECTOR_DEFAULTS` — `https://n8n.marky.systems` and
  `https://n8n.marky.systems/webhook/aoos-governed-seo`. Nothing else is
  outstanding for that row.
- **The OpenSEO probe is correct.** It GETs `${OPENSEO_BASE_URL}/api/health`
  with HTTP basic auth from `OPENSEO_USERNAME` / `OPENSEO_PASSWORD`, and
  `isOpenSeoHealth` requires exactly `{ status: "ok", version, authMode, checks }`
  — the shape the box was observed returning. The probe is not the problem;
  the password is.
- **`eslint.config.js` ignores `previewAuthStorage.ts`** — line 24, with the
  reason on line 15.
- **Both lockfiles present**, `package-lock.json` (403 KB) and `bun.lock`
  (247 KB). Neither was touched.
- **Row labels are unambiguous** and match the standing decision that the cloud
  Firecrawl row *should* read missing: `firecrawl` → "Firecrawl",
  `selfhosted_firecrawl` → "Firecrawl (VPS)", `vps_scraper` → "Crawl4AI".

### A5. Unverifiable from this repository — do not restate as fact

- **"Verified base URLs, all correct: litellm · n8n · umami · vps_scraper ·
  selfhosted_firecrawl."** Only two of those five are in code:
  `N8N_BASE_URL` and `VPS_SCRAPER_BASE_URL` are defaulted in
  `AOOS_CONNECTOR_DEFAULTS`. `LITELLM_BASE_URL`, `UMAMI_BASE_URL`,
  `OPENSEO_BASE_URL` and `SELFHOSTED_FIRECRAWL_BASE_URL` exist only as env-var
  *names*; their values live in the deployment. The repo can confirm the shape,
  never the value.
- **Whether the 2026-08-24 ~21:40 republish rolled.** The live
  `x-deployment-id` on `https://trumove.marky.systems` is
  `501d4416…37f`. The saved state recorded no prior id, so there is nothing to
  compare against. This cannot be settled from memory — only by re-probing.
- **Every credential state** (OpenSEO password, PageSpeed, Google Ads,
  Perplexity, GSC). These are values in Lovable's environment. The repo shows
  what is *required*, never what is *set*.

### A6. Documentation drift found while auditing

`docs/context/CURRENT_BUILD.md` still says "Last updated: 2026-08-21, at
`2a2e87f` (PR #48)" and quotes a baseline of 1168 tests in 118 files. Sixteen
PRs and 88 tests later, its section 0 no longer describes the build. It is not
corrected here — it is a current-state file and rewriting it is its own task —
but it should not be read as current until it is.

---

## Part B — repository map

### B1. Stack and entrypoints

TanStack Start (React 19 + Vite), TypeScript throughout, Tailwind + shadcn/ui,
Supabase Postgres. Built and hosted by Lovable; `main` is the connected branch.

| Entrypoint | File | Role |
| --- | --- | --- |
| SSR fetch handler | `src/server.ts` | Lazy-imports `@tanstack/react-start/server-entry` so a cold SSR graph failure is catchable. Normalises h3's swallowed 500s (`{"unhandled":true,"message":"HTTPError"}`) into a real error page, and treats client aborts as cancellations rather than failures. |
| Start instance | `src/start.ts` | `functionMiddleware: [attachStoredAuth]`; `requestMiddleware: [errorMiddleware, csrfMiddleware]`. CSRF is re-added explicitly — defining `start.ts` opts out of Start's automatic install. |
| Router | `src/router.tsx` + generated `src/routeTree.gen.ts` | |
| Routes | `src/routes/` — 67 entries | File-based. Plus `src/routes/api/` (`agent-chat.ts`, `studio-chat.ts`, `public/`) and `src/routes/mcp.ts`. |
| Ingestion CLI | `scripts/ingest-governed-knowledge.ts` | `npm run knowledge:ingest` |

### B2. Module boundaries — the conventions that carry the architecture

Three filename suffixes are the real boundary markers, and they are load-bearing:

- **`*.server.ts` (77 files)** — server-only. Touches `process.env`, the
  Supabase service-role client, or an outbound provider. Never imported by a
  component.
- **`*.functions.ts` (41 files)** — TanStack server functions: the *only*
  sanctioned door from the browser into server code. Auth is attached by
  `attachStoredAuth`; CSRF is enforced by the middleware in `start.ts`.
- **Everything else in `src/lib/`** — pure, isomorphic, unit-tested. The large
  rule and view-model modules live here (`page-checks.ts` 1075 lines,
  `getting-found.ts`, `site-health.ts`, `your-pages.ts`, `next-actions.ts`).

`src/lib/` subsystems: `ai/` · `authority/` · `connectors/` · `dataforseo/` ·
`execution/` · `knowledge/` · `mcp/` · `measurement/` · `openai-ads/` ·
`openseo/` · `proposals/` · `seo-runs/` · `serpapi/` · `umami/`.

`src/registry/` is the capability registry — `modules/` holds one file per
provider surface (`search-console.ts`, `ga4.ts`, `dataforseo.ts`, `serpapi-ads.ts`,
`self-hosted-analytics.ts`, `automation-runtime.ts`, `agent-integrations.ts`,
`content-operations.ts`, `growth-operations.ts`, `research-operations.ts`,
`openai-ads.ts`), with `sync.server.ts` and `operational-bridges.test.ts`.

`src/integrations/` holds the two platform clients: `supabase/`
(`client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`,
generated `types.ts`, and the Lovable-regenerated `previewAuthStorage.ts`) and
`lovable/`. 80 migrations under `supabase/migrations/`.

### B3. Call path — connector health, the ledger at `/capabilities/systems`

```
src/routes/capabilities.systems.index.tsx
  └─ @/lib/connectors/functions.ts        getConnectorReadiness · checkConnectorReadiness
       └─ connectors/connections.server.ts   syncConnectorReadiness
            ├─ catalog.ts     describeConnectorReadiness(env)   ← 19 items, credential strategies,
            │                 withConnectorDefaults(env)          config requirements, safeConfig
            ├─ probes.server.ts  probeConnector(key) × 19, in parallel via Promise.all
            │    ├─ google_ads → google-ads.server.ts (OAuth refresh, then read-only v25)
            │    ├─ noSafeProbe (4) → configured_no_safe_probe, no network call, no spend
            │    └─ configuredRequest() → { url, headers } → fetch → readBoundedResponseBody
            │         └─ shape validators: isOpenSeoHealth · isDataForSeoSuccessEnvelope
            ├─ current-readiness.ts  projectCurrentConnectorReadiness
            └─ → tenant_connections rows (proof.statusCode, proof.endpoint — redacted origin+path)
```

Design properties worth not breaking:

- **Probes never spend.** A provider with no free read-only endpoint is placed
  in `noSafeProbe` and reported `degraded / configured_no_safe_probe` rather
  than being called.
- **Bodies are bounded and never leaked.** `MAX_SCHEMA_PROBE_BODY_BYTES` is
  32 KB; an oversized or over-declared body is cancelled. DataForSEO gets a
  raised cap of its own because its legitimate `user_data` response exceeds the
  default and was being reported as `schema_error`.
- **Endpoints are redacted** to origin + pathname before storage
  (`redactedEndpoint`), so a key in a query string cannot reach the database.
- **A probe must authenticate the way the client does.** `umamiProbeAuth`
  deliberately mirrors `umamiAuthHeaders()`'s precedence — bearer, then API key,
  then basic. Divergence there is what made a working Umami report as failing.
- **HTTP 200 is not health.** Several probes parse and shape-check the body;
  a 200 with the wrong envelope degrades.

Thin per-connector wrappers exist for the two self-hosted boxes:
`vps-scraper.server.ts` → `probeVpsScraper()`, `n8n.server.ts` → `probeN8n()`,
both delegating to `probeConnector`.

### B4. Call path — page audit and page rendering

```
runPageAudit(client, tenantId, actorId)          src/lib/page-audit.server.ts
  ├─ selectedProperty()                          Search Console property, required
  ├─ vpsScraperConfigured(process.env)           Crawl4AI — preferred renderer
  ├─ firecrawlEndpoint(process.env)              self-hosted first, cloud as fallback
  │    └─ neither configured → named refusal, never a silent zero
  ├─ readSiteDocuments(origin)                   robots.txt + sitemap, robots respected
  ├─ reportedPageUrls()                          pages Google already reported come first
  └─ one immutable observation per page; a page that cannot render is stored
     with its failure reason and `rendered_by`, never skipped
```

### B5. Call path — model calls

`src/lib/ai/routing.ts` decides the route. LiteLLM
(`LITELLM_BASE_URL` / `LITELLM_PROXY_API_BASE` + `LITELLM_API_KEY`) is the
intended route and the only one that can use prompt caching; the Lovable AI
Gateway (`LOVABLE_API_KEY`) is the legacy path. With neither configured,
`routing.ts` returns a named absence rather than falling back to a metered
vendor SDK. `gateway.server.ts`, `structured.server.ts`, `models.ts`,
`require-operator.server.ts` and `tools/` sit around it.

### B6. Where the documented contracts live

`docs/execution-handbook/` is the governing set — `SOURCE_OF_TRUTH.md`,
`DETECTION_RULES.md`, `EVIDENCE_POLICY.md`, `VALIDATION_GATES.md`,
`TENANCY_PERMISSIONS.md`, `EXECUTION_ROLLBACK.md`, `OUTCOME_MEASUREMENT.md`,
`PROPOSAL_DATA_CONTRACT.md` and others, indexed by `INDEX.md`. Per `AGENTS.md`,
a change touching a schema, threshold, lifecycle, permission or execution guard
updates the matching document in the same change. Provider behaviour is
authoritative only in `docs/integrations/<provider>/DIGEST.md`.
