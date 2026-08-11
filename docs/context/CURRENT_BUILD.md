# AOOS Current Build Context

Purpose: a lightweight, always-current handoff note so a future agent run does not
lose decisions made in chat. This file records **current state only**: architecture,
live integrations, pending approvals, active workflows, and next priorities.

It is not authoritative documentation. Provider digests under
`docs/integrations/<provider>/DIGEST.md` and their PLAN files remain the source of
truth for provider behaviour and must never be overwritten by this file.

Last updated: 2026-08-11 (Phase 2 visibility slice one: Search workspace).

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

| Capability | State | Notes |
| --- | --- | --- |
| Google Search Console | real | Idempotent daily site / page / query snapshots. |
| DataForSEO Labs | real | Keyword ideas, competitor derivation. |
| DataForSEO SERP (Standard queue) | real | Postback hook at `/api/public/hooks/dataforseo-postback`. |
| DataForSEO Backlinks | real | Pay-as-you-go pricing as of 2026-07-01. |
| Firecrawl / Web Research (Perplexity) | real | Page inspection and cited research. |
| Competitor intelligence | real | Built on 39 completed SERP snapshots, 71 observed domains. |
| MCP read tools | real | Guarded by `src/lib/mcp/guard.ts` (auth + audit). |
| SerpAPI Ads Transparency | pending | Digest + plan complete (`docs/integrations/serpapi/`). Blocked on credential and plan-tier approval. |
| GitHub (`cap.github`) | not connected | Blocks `wf.publish`. Do not connect without approval. |

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
3. SerpAPI credential plus plan-tier choice for `cap.serpapi_ads_transparency`. Digest and plan are done; no integration code is written until the key exists and a live auth probe passes.

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
- **Weekly ads cadence registered.** `sch.vendor_ad_refresh`,
  `sch.vendor_landing_page_analysis`, and `sch.vendor_message_synthesis` run
  Tuesdays. Creative ingestion files an FYI Inbox item only on material change
  (new creative families or retirements).
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
