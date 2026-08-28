# AOOS Current Build Context

Purpose: a lightweight, always-current handoff note so a future agent run does not
lose decisions made in chat. This file records **current state only**: architecture,
live integrations, pending approvals, active workflows, and next priorities.

It is not authoritative documentation. Provider digests under
`docs/integrations/<provider>/DIGEST.md` and their PLAN files remain the source of
truth for provider behaviour and must never be overwritten by this file.

Last updated: 2026-08-28. Section 0 below still describes 2026-08-21 and has
NOT been rewritten; the current-state blocks immediately below supersede it.

## 0b. cap.umami promoted to real, 2026-08-28

The registry declared `cap.umami` "pending until one authenticated read stores
a snapshot", and the workflow guard (`src/lib/serpapi/provider-gate.ts`) only
lets `real` capabilities execute, so the enabled pg_cron job
`aoos-umami-daily-observe` (16:45 UTC daily) failed on every firing with
"Capability \"Umami (self-hosted analytics)\" is not authorised yet." —
verified in `workflow_runs` for 2026-08-19, 2026-08-20 and 2026-08-25, with
`capabilities.last_run_at` still null.

The promotion condition was re-verified against the production database, not
recalled from this file: `umami_snapshots` holds exactly four rows (stats,
pageviews, pages, referrers) for TruMove, collected 2026-08-18, joined to a
succeeded `measurement_runs` row with `quota.authenticationSucceeded: true`.
Section 3's Umami row below already recorded this evidence.

`integrationState` in `src/registry/modules/self-hosted-analytics.ts` is now
`"real"`, with the met condition cited in the comment. The runtime gate reads
the database `capabilities` row, which still says `pending`, and registry sync
is an operator action, not a deploy step. **Waiting on a human:** after this
change is merged and published, an operator clicks "Sync from modules" on
`/capabilities/registry`; the daily observation stops failing from the next
16:45 UTC firing after that.

## 0a. Current state, 2026-08-25

Measured on this branch, not recalled: `npm run typecheck` clean, `npm test`
**1259 passing in 123 files**, `npx eslint .` **0 errors and the same 14
pre-existing react-refresh warnings**. Section 0's figures (1168 tests in 118
files, at `2a2e87f`) are superseded and left in place as a dated record.

**Connector ledger: 19 rows.** SearXNG was removed in #65 (catalogued, probed,
read by nothing, and not wanted), and OpenAI Ads conversions was added here --
it was the only outbound-write integration the ledger could not see. GA4 gained
a real probe in #65 using the JWT signing that already existed in
`measurement/ga4.server.ts`; four connectors remain in `noSafeProbe`
(`google_search_console`, `pagespeed_insights`, `perplexity`, `openai_ads`),
each because it has no free read-only endpoint, which is stated rather than
papered over with an invented probe.

**Correction, 2026-08-25:** an earlier version of this block claimed the
change-request lifecycle could not complete through the UI. **It was wrong.**
`transition_change_request` is a Postgres RPC granted to `authenticated`
(`supabase/migrations/20260811180753_*.sql`), so the state machine is enforced in
SQL and reachable without the TypeScript wrapper. The database has rows in
`applied` and `rolled_back`. See item 8 of
`docs/handoffs/2026-08-25-remediation-plan.md` for the retraction and the method
error behind it.

**How to read this file.** Section 0 is the current state and supersedes anything
below it that disagrees. The later sections are kept in the order they were
written, as a dated record of how the build got here. Where an older section
contradicts section 0, section 0 wins and the contradiction is named rather than
quietly edited away.

## 0. State of the build, 2026-08-21

Verified in this worktree at `2a2e87f`: `npm run typecheck` clean, `npm test`
1168 passing in 118 files, `npm run lint` 0 errors and 14 pre-existing
react-refresh warnings. What follows is read from code and applied migrations;
anything about a live provider or the production database is marked as such and
was not re-verified here.

### The product surface

The eight numbered workspaces of the original brief were replaced by a
seven-slot category navigation, defined once in `src/lib/categories.ts` and
capped permanently. The Command center and four of the six category pages are
built:

| Category                | Page                      | Route it renders at       | Reserved slug              |
| ----------------------- | ------------------------- | ------------------------- | -------------------------- |
| Command center          | `command-center-page.tsx` | `/`                       | —                          |
| Getting found on Google | `getting-found-page.tsx`  | `/search`                 | `/getting-found-on-google` |
| Your pages              | `your-pages-page.tsx`     | `/pages`                  | `/your-pages`              |
| Site health             | `site-health-page.tsx`    | `/measurement`            | `/site-health`             |
| Connections             | `connections-page.tsx`    | `/capabilities`           | `/connections`             |
| Who visits your site    | not built                 | `/ga4` (absorbed)         | `/who-visits-your-site`    |
| Your competition        | not built                 | `/competitors` (absorbed) | `/your-competition`        |

**Deviation from the redesign plan, recorded deliberately.** The plan said each
category's `to` would move to `/${slug}` when its page landed. It has not: the
new pages render at the legacy routes instead. `categoryForPath` matches both,
so the navigation and breadcrumbs are correct either way, but the reserved slugs
are still unused. Moving them is a one-line change per category plus redirects,
and nobody has decided when.

The roughly thirty legacy routes are still on disk and still reachable by URL,
outside the new navigation by design. The old sidebar
(`src/components/os/shell.tsx`) is unused and retained.

### Connections: the four stages

`src/lib/connections.ts` grades every account on how far its evidence actually
travels: not configured, configured, collecting-and-reaching-nobody, reaching
you. Stage three is where most of this estate sat, and the page exists to say so
per connection with the row counts behind it. Only four modules in the codebase
write a recommendation, so any connector outside their reach stops at stage
three however well wired it is. `connections.registry.test.ts` asserts the
registry against the rest of the codebase, so a stage claim cannot drift from
what the code does.

### The rule-threshold audit is closed

`docs/handoffs/2026-08-20-rule-thresholds-audit.md` is done. Its finding was that
every threshold had been written for a site with roughly a hundred times this
property's traffic, so almost no rule could fire, and that lowering them until
they fired would have been worse than silence.

What shipped instead, in `src/lib/rule-buckets.ts`: all 24 finding rules across
the Search Console, SEO-validation and GA4 families are assigned a bucket —
**5 `fact`** (answerable at any volume: indexation, robots and sitemap states),
**13 `pooled`** (click-shaped questions answered across the property rather than
per page), **6 `beyond_current_volume`** (the page states the volume that would
make it answerable and ships no threshold). No threshold value is written out by
hand; every number is read from the threshold objects.

The same registry carries `alsoNeeds`, the non-volume prerequisites — a second
collection window, the page audit having run, analytics connected, a stored URL
inspection, approved keywords, two backlink readings. Every empty list on the
category pages now names the prerequisite it is waiting on, and distinguishes
"never run" from "not yet". Migration `20260820200000_grounded_measurement_windows`
carries the grounded windows.

### The suggestion queue can be acted on

`src/lib/suggestion-queue.ts` is the state machine: open / ignored / done, dedup
by `issue_fingerprint`, urgency ranking, seven visible per week. Every card now
renders the verbs the queue says are legal (`suggestion-verbs.ts`,
`suggestion-card.tsx`) or an on-screen sentence saying why a verb is absent —
never a disabled control. Legality that was previously a lie was corrected at
the source: observation-only rows lost `canIgnore`, audit findings gained it
once suppression storage existed (`20260821090000_suggestion_suppressions`,
including the `UPDATE` grant the upsert needs), and the ignore verb on a
change-kind card reads Reject, because `rejectChangeRequest` is terminal.
Approve still routes only through `/changes/$id`.

### The page audit

`src/lib/page-checks.ts` runs 30 checks over the HTML a single render already
returned, up to 100 pages per run. Crawl4AI at `crawl.marky.systems` is the
primary renderer; self-hosted Firecrawl at `fire.marky.systems` is its fallback
and is only called if Crawl4AI throws. A live audit on 2026-08-24 read 30/30
pages entirely through Crawl4AI with zero Firecrawl calls. The structure-enforcement lane added
URL conventions (underscores, parameters), missing image width/height, orphan
pages no internal link path reaches, expected schema type per page kind, and
redirect / canonical-chain / meta-refresh checks. `PAGE_CHECK_FIX` in
`audit-fixes.ts` is exhaustive over `CheckId`, so `tsc` refuses a new check
without its fix target.

Deliberately not built, with the reason recorded in the module header: image
file weight (the render returns no byte sizes), click depth (no Google document
sets a maximum, so any limit would be invented), and per-page speed, which is
the stored PageSpeed reading on Site health.

### The targeting layer

`targeting-rules.ts` plus `dataforseo/targeting-rules.server.ts` is the fourth —
and newest — module that writes a recommendation, which is what moved DataForSEO
from stage three to stage four. Approved keywords that nothing has observed, and
keywords with no page to rank, are now findings. The competitor keyword gap files
as `keyword_candidates` in `pending`, entering the approval flow
`decideKeywordCandidates` already governs; nothing is auto-tracked. Difficulty
and intent scoring runs on an operator click, batched at 1000 keywords with
"scored N of M pending" reported when the queue is longer. Referring-domain
movement is reported from backlink snapshots already stored.

**Verified dead end, so nobody re-derives it:** question mining from stored SERP
payloads does not work. A read-only query against the real stored rows returned
40 `serp_organic` snapshots with an item-type histogram of `{organic: 741}` and
no `people_also_ask` at all, because `payload->'rows'` is a projection filtered
at ingest (`serp.server.ts`). The absence reflects what AOOS chose to keep, not
what Google returned. Recovering it needs a different provider call.

### Model routing

Every model call routes through a self-hosted LiteLLM proxy when
`LITELLM_BASE_URL` and `LITELLM_API_KEY` are set, with OpenRouter behind it, and
falls back to the previous paths when they are not. The server side is deployed
and documented in `docs/litellm-routing.md`, including the stated simplification
that there is no database behind the proxy, so the app authenticates with the
master key rather than a virtual key. `LOVABLE_API_KEY` is still required for
Search Console, which is a data gateway and unaffected by any of this.

### CI is a real gate

`.github/workflows/ci.yml` runs lint, typecheck, test and build on every pull
request. Before that, `vite build` was the only check and type errors could
reach `main` freely despite a strict `tsconfig`. Earlier records in this file and
in the lane plans describe repo-wide lint as "pre-broken with thousands of
prettier errors" — that is no longer true and those notes are stale.

### Still blocked, still waiting on a human

Unchanged from the sections below, restated because they are the things most
likely to waste someone's afternoon:

- `GITHUB_EXECUTOR_TOKEN` is not configured, so no change request has ever been
  executed against the real repository. The UI names this exactly and refuses
  without writing.
- `cap.github` is not connected, which blocks `wf.publish`.
- The six-domain competitor shortlist is still `pending` in `/competitors`. An
  agent must not approve or reject it.
- The free SerpAPI account gate for `cap.serpapi_ads_transparency` still needs
  revalidating. All ads schedules remain disabled.
- Two categories have no page yet: Who visits your site, and Your competition.

## 1. What AOOS is

An internal marketing operating system for the company. It is **not** the public
TruMove website and not a CRM. It manages marketing assets, AI agents, workflows,
MCP tools, connectors, schedulers, recommendations, evidence, and approvals.

Workspaces: Inbox (root route, operational center), Command Center, Assets,
Capabilities, Agents, Workflows, Knowledge, Recommendations, Scheduler, plus
operator surfaces for Keywords and Competitors.

## 2. Permanent rules

1. **Documentation-first integrations.** Authoritative provider docs are read and
   digested before any integration code is written. Required artifacts: persistent
   digest, selective technical cache, capability map, blueprint, risk register,
   operator approval. No secrets are ever written into knowledge or digests.
2. Capabilities, agents, and workflows are declared in `src/registry/modules/*.ts`
   and synced to the database. No hardcoded per-integration UI.
3. Every integration carries a real / simulated / pending / mock state. A mock is
   never presented as connected.
4. Mutating agent or workflow steps require explicit human approval, filed to Inbox.
5. Multi-tenant: `tenants` + `tenant_members`, tenant-scoped RLS on registry tables.
6. UI: dark cyber-luxury theme, semantic tokens only, outlined buttons only, no
   em dashes in copy.

## 3. Live integrations (real, not simulated)

| Capability                                          | State                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PageSpeed Insights (Measurement workspace)          | implemented, provider-blocked, manual only | `/measurement/tools`. One click, one v5 request. No schedule. Runs and immutable snapshots are stored in `measurement_runs` / `pagespeed_snapshots`. The configured provider project is returning HTTP 429 daily-quota failures: 5 stored attempts, 0 stored measurements. Missing data is not reported as zero.                                                                                                                                                                                                                               |
| GA4 Data API                                        | real                                       | Property `properties/536830122`. First successful immutable snapshot stored 2026-08-18: 124 returned rows, 48 pages, 135 sessions, and 748 events for the 28-day window. Daily read-only schedule is enabled.                                                                                                                                                                                                                                                                                                                                  |
| Umami (self-hosted)                                 | real                                       | Credentials, property listing, and the first authenticated 28-day read are proven. Four immutable rows were stored on 2026-08-18 for TruMove. The provider returned zero pageviews, visitors, visits, and bounces for that window; this is a real provider result, not substituted missing data. The deployed instance accepts `metrics type=path`, not `type=url`.                                                                                                                                                                            |
| Google Search Console                               | real                                       | Idempotent daily site / page / query snapshots.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| DataForSEO Labs                                     | real                                       | Keyword ideas, competitor derivation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| DataForSEO SERP (Standard queue)                    | real                                       | Postback hook at `/api/public/hooks/dataforseo-postback`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DataForSEO Backlinks                                | real                                       | Pay-as-you-go pricing as of 2026-07-01.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Firecrawl (self-hosted) / Web Research (Perplexity) | real                                       | Page inspection and cited research. Rendering resolves through `firecrawlEndpoint()`, which prefers the self-hosted deployment; the metered cloud is a fallback only. Rendered-page verification in `execution.functions.ts` now reads that same chooser rather than `FIRECRAWL_API_KEY`, so it no longer reports itself unconnected when only the self-hosted deployment is configured. `FIRECRAWL_API_KEY` is not a project secret and could not be deleted from the project layer; if it is still injected it sits in workspace Connectors. |
| Competitor intelligence                             | real                                       | Built on 39 completed SERP snapshots, 71 observed domains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| MCP read tools                                      | real                                       | Guarded by `src/lib/mcp/guard.ts` (auth + audit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SerpAPI Ads Transparency                            | pending gate, proven canary history        | Direct account/canary code exists and 11 successful canary ledger rows are stored. The free provider gate must be revalidated; creative and live paid-SERP stages remain pending.                                                                                                                                                                                                                                                                                                                                                              |
| GitHub (`cap.github`)                               | not connected                              | Blocks `wf.publish`. Do not connect without approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Spend controls: DataForSEO ceiling **$300/month**, ledgered per request, alerts at
50/75/90/100%. Spend to date is far below ceiling (cents, not dollars).

## 4. Evidence and classification rules

- SERP `competitor` vs `surface` classification is preserved. A domain that ranks
  is not automatically a direct business competitor.
- Competitor confidence and classification uncertainty are always retained.
- Observations are stored separately from recommendations.
- Transparency-style ad evidence never implies spend, impressions, or performance.

## 5. Pending operator approvals

1. **Competitor shortlist** (6 domains: United Van Lines, Allied and others) awaits
   human review in `/competitors`. All six are in `pending`; none are approved,
   rejected, or tracked. The agent must not approve or reject these.
2. GitHub credential / `cap.github` authorization for `wf.publish`.
3. Revalidate the free SerpAPI account gate for `cap.serpapi_ads_transparency`. Direct canary code and prior advertiser evidence exist; downstream creative and live paid-SERP capabilities remain separately pending.

Legacy agent and workflow approval notices were moved to Needs attention because
approval continuation is not wired. New notices use the same honest Open-only
contract until a real continuation handler exists.

## 6. Active workflows

- `gsc-daily-observe` (real)
- `dfs-serp-observe` (real, 40 approved keywords)
- `wf.research_refresh` (real)
- `wf.seo_validation` (real rule engine, 10 rules incl. competitor rules)
- `wf.content_generation` (parked at review)
- `wf.publish` (blocked on `cap.github`)

## 7. Performance baseline (post-optimization)

Measured in-browser client navigation between workspaces: **100-185 ms**, warm
second visits served from the query cache. Applied fixes:

- `defaultPreload: "intent"`, `defaultPreloadDelay: 50`, shared pending component.
- Query defaults `staleTime: 30s`, `gcTime: 5m`, no refetch on window focus.
- `ssr: false` on operator-only workspace routes (removes hydration mismatch).
- Non-blocking loaders: `ensureQueryData(...).catch(() => undefined)`.
- Request-scoped Supabase client cache keyed by bearer token, 60s TTL
  (`src/lib/tenant.server.ts`), removing repeated auth/tenant round trips.
- Command Center metric fan-out collapsed into one `Promise.all` batch.
- The generated route tree is treated as immutable; the former runtime
  parent-link mutation was removed. Development-only route-split HMR wrappers
  are disabled because they could evaluate a child against a stale parent and
  collapse multiple route IDs to `/`; normal Vite updates remain enabled.
- The operator session hook releases its visual gate from persisted identity
  metadata and subscribes to future auth changes. It must not call
  `auth.getSession()`: that competes for the auth client's session lock with the
  server-function middleware and previously left every workspace suspended on
  skeletons for several seconds. Server-function middleware also attaches the
  already-persisted access token directly instead of acquiring that lock.
  Authorization and token validation remain server-side.
- Active tenant resolution now reads its RLS-scoped profile, membership, and
  single-tenant fallbacks concurrently. The tenant switcher also loads the
  visible tenant list and active selection concurrently, removing avoidable
  serial backend round trips from every cold workspace load.
- Node's exact `abortIncoming` / `socketOnClose` error is classified as a browser
  request cancellation at both server boundaries and returns 499 without fatal
  logging, including when the framework logs before wrapping the response.
  Generic application errors named `aborted` remain visible.

## 8. Next build priorities

1. **Google Ads Transparency / paid competitor intelligence** via SerpAPI, applying
   the documentation-first rule. Capability `cap.serpapi_ads_transparency`, modules
   `ads.advertiser_resolution`, `ads.creative_intelligence`,
   `ads.landing_page_intelligence`, `ads.live_serp_observation`,
   `ads.vendor_network_analysis`. Phase 1 is read-only and evidence-first.
2. Vendor watchlist for discovery: equatemedia.com, billy.com, moveadvisor.com,
   mymovingreviews.com, resultcalls.com, doppcall.com, 99calls.com,
   quoterunner.com, movematcher.com, budgetvanlines.com, 2movers.com.
3. After evidence quality is proven: paid-media recommendations, then publish path.

## 9. Operator truth pass (Inbox clarity, observations, Command Center)

- **Clear is reversible.** `inbox_items.cleared_from_lane` + `cleared_by` record
  provenance. `clear_inbox_item` / `reopen_inbox_item` are SECURITY INVOKER RPCs
  (authenticated execute only) and are the only write path. Pending approval can
  never be cleared; Completed shows "Unclear" only for manually cleared rows.
- **Facts are not approvals.** Rows with `metadata.observationOnly = true` now
  carry `state = 'observed'`, `requires_approval = false`, and live in the FYI
  lane. Their detail page states what the evidence is, what it does not mean, and
  the next real decision. Approve/Reject is hidden and rejected server-side.
- **No fake approvals.** `src/lib/recommendation-action.ts` is the single source
  of truth for whether a suggested action has an executable handler. No kind is
  wired to one yet, so every detail page says so plainly instead of offering a
  button that changes a column and nothing else.
- **Command Center leads to work.** Quick actions (safe navigation only), count
  tiles link to their workspace, capability rows link to capability detail, run
  rows link to workflow detail and show the stored error on failure. All of it
  still comes from the one `command_center_overview` RPC.
- **Google Ads Transparency is the product name.** SerpApi appears only in
  connection/account/ledger detail. `/ads/advertisers` is a deep review surface
  reached from Inbox and Command Center, not a sidebar workspace. The one-credit
  canary is behind an explicit spend confirmation dialog.
- **Search Console panel reads as the operator.** `getSearchConsoleState` used an
  anon publishable client, so tenant-scoped RLS correctly returned nothing and the
  panel looked empty even with rows stored. It is now behind `requireSupabaseAuth`
  and reads through `context.supabase`. The panel invokes that protected read via
  `useServerFn`, ensuring the global bearer-token middleware runs before each
  query. `syncProperties` upserts on
  `(tenant_id, site_url)`, matching the real unique index.
- **Vendor advertiser sweep.** `src/lib/serpapi/sweep.server.ts` walks unresolved
  watchlist domains one at a time through the single-credit canary path, so each
  request keeps its own ledger reservation, account floor check, and idempotency
  key. It stops at the first account or credential refusal. A provider "no
  results" reply is a successful empty observation, not a transport failure, and a
  previously failed reservation is retried under a distinct run key.
- **Ads schedules are registry declarations only.** The runtime allowlist and production rows keep every ads cadence disabled. Creative or live paid-SERP work remains manual and capability-gated.
- **Digest is in Knowledge.** The Google Ads Transparency digest v1.0.0 is filed in
  kb.documents, tagged `cap.serpapi_ads_transparency`, pointing at
  `docs/integrations/serpapi/DIGEST.md`.

## 10. Phase 2 visibility slice one: Search workspace

First Phase 2 real-data surface. `/search` renders only what Google Search Console
actually observed for `sc-domain:trumoveinc.com`, read tenant-scoped and
authenticated through `getSearchWorkspace` in `src/lib/search.functions.ts`.

Sections: Overview (property totals per finalized Pacific date), Pages, Queries,
Page + query, Devices and countries, Indexing & sitemaps. No raw JSON, no snapshot
IDs, no ledger rows, no derived score or trend. The evidence-limits notice states
plainly that only three finalized dates exist and volume is sparse.

Proven live values: latest finalized date 2026-08-08 with 1 click, 18 impressions,
5.6% CTR, average position 14.9; 2026-08-06 and 2026-08-03 also stored; nine pages
and eight disclosed queries; two sitemaps (29 and 10 submitted URLs, 0 indexed, 0
warnings, 0 errors).

Placeholder correction applied by migration: the primary marketing site asset now
carries `https://trumoveinc.com` and the domain asset is named `trumoveinc.com`.
The selected Search Console property was not changed.

The Search Console connection controls stay on the asset detail page, which now
links to the Search workspace for the actual metrics.

## Tool estate inventory (2026-08-11)

Tables: `tool_systems`, `tool_operations`, `tool_aliases` (tenant scoped, member read, operator/admin write).
Surface: `/capabilities/systems` and `/capabilities/systems/$key`, linked from the Capability Registry header.
Snapshot: 46 canonical systems, 152 operations, 20 alias registrations, frozen discovery date 2026-08-11.
Truth rule: installed, credentialed, live proven, and callable from AOOS are independent facts. Nothing local is
marked callable; AdLoop and OpenSEO read "Installed locally, not connected to AOOS". Provider APIs are recorded as
"surface counted, full normalized import queued" with no invented operation rows. No credential values, tokens, or
secret paths are stored.

## Tool estate correction (2026-08-11)

- SearchAtlas excluded by operator policy: systems, operations, aliases, and all UI results removed. Search returns zero.
- Vault represented as remote, metadata-only, not AOOS-callable: "25 metadata records checked, 20 active records mapped to 16 providers, secret values never copied." No credential names, labels, IDs, hosts, paths, or values are stored or shown.
- Readiness is six independent facts: available to enable, enabled, credentialed, implemented in AOOS, callable from AOOS, visible. Credential metadata never promotes enabled or callable.
- /capabilities/systems now has Essentials (default, 11 foundational systems) and All systems (58). Keyword Planner is an alias of Google Ads API.
- Counts recalculated from database truth: 58 canonical systems, 139 operations, 21 aliases. Essentials view: 11 systems, 91 operations, 4 aliases.

## Change-request execution adapter (source commit + published proof)

- `src/lib/execution/source-change.ts` — pure guards: exact before/after replacement (refuses on any count other than one), commit marker, published-page title/H1 proof.
- `src/lib/execution/execute.ts` — dependency-injected execute and publish-check loops. Operator-only, id-only input, replay-safe.
- `src/lib/execution/execute.server.ts` — GitHub contents API bridge (`GITHUB_EXECUTOR_TOKEN`), execution store, public page fetch.
- `src/lib/execution/execution.functions.ts` — `getExecutionState`, `executeChangeRequest`, `checkChangeRequestPublished`.
- `src/components/os/execution-card.tsx` — six-stage plain-language status, execute + check published, attempt log, "Provider API charge: $0" with the AI build usage caveat.
- Migration: `change_requests.source_repo/source_branch/source_commit_*/published_proof_*` and `public.change_request_executions` (tenant read, server write).
- Applied now means proven live on the public URL; the manual "Mark applied" button is gone. Verification still requires finalized post-change Search Console rows.
- Blocker: `GITHUB_EXECUTOR_TOKEN` is not configured, so no real commit has been attempted. The UI names this exactly and refuses without writing.

## Direct measurement truth (2026-08-14)

- **GA4 Data API is implemented as an operator-triggered read.** It uses
  `properties/536830122`, a 28-complete-day window, and the official
  `runReport` endpoint. The stored inventory is keyed by hostname, exact page
  path plus query string, and event name. Every attempt opens and closes a
  `measurement_runs` row; only successful provider responses create immutable
  `ga4_snapshots`.
- **Credential presence is not connection proof.** AOOS accepts either
  `GA4_SERVICE_ACCOUNT_JSON` or the complete OAuth refresh-token trio. The UI
  says Configured until a successful snapshot exists, then Connected. A browser
  measurement ID can emit events but cannot authorize reporting reads.
- **No background analytics loop exists.** Refresh is an operator action. GA4 is
  measurement-only and never blocks proposal generation.
- **SerpAPI stays separate from DataForSEO.** Only the free
  `cap.serpapi_ads_transparency` account check may run while pending. Advertiser
  resolution, creative intelligence, and live paid-SERP observation remain
  blocked until their own registry states become real. All ads schedules remain
  disabled.

## Discovery only, no implementation: two further Google APIs

Operator disclosed on 2026-08-19 that the GA4 Measurement Protocol and the GA4
Admin API are available, plus a third "Hub API" that is still unnamed. Per the
documentation-first rule, authoritative digests were filed before any code:

- `docs/integrations/ga4-admin-api/DIGEST.md` — read-only configuration
  discovery. `accountSummaries.list` would make GA4 property binding
  evidence-driven instead of the hardcoded `properties/536830122` reference.
  REST over fetch, not the gRPC GAPIC client, because of the Worker runtime.
- `docs/integrations/ga4-measurement-protocol/DIGEST.md` — a write-only path
  into a live GA4 property. Its live endpoint returns no error codes, so a
  successful POST is not evidence of anything; proof requires a debug-endpoint
  validation pass plus a subsequent Data API read observing the event. Mutating,
  therefore approval-gated and never on a cadence.

No capability, schema, secret, or route exists for either. Both remain
unapproved. The Hub API has no digest because the vendor is unidentified.

## Google Search Essentials skim, 2026-08-19

Operator supplied the Search Essentials, Search Console tooling, starter guide,
Rich Results Test, and Schema.org links. Filed
`docs/integrations/google-search-essentials/DIGEST.md`.

Findings that change how AOOS should treat Search Console:

- Google's material is three layers: Essentials (pass/fail eligibility),
  Strategy (the starter guide's page-level work), and Enhancements (structured
  data). AOOS only touches performance rows, which sit under none of them.
- Page Indexing, Rich result status, Core Web Vitals, Removals, Manual actions,
  and Security have no API. They must be reconstructed URL by URL through URL
  Inspection against a prioritized page list.
- URL Inspection already stores coverage state, canonical mismatch, mobile
  usability, and rich results verdict. Nothing consumes those fields.
- `site.structured_data` is already an allowed change kind, but no code ever
  reads a page's JSON-LD or proposes markup.

Sequencing recommended, none of it implemented: consume the stored inspection
fields, ingest layers 1 and 2 as citable knowledge, add a JSON-LD reader and
diff, then widen page proposals beyond title and H1.
