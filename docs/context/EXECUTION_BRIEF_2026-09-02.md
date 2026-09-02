# Execution brief, 2026-09-02

The first required output of the full-ownership mandate: what is verified,
what is at risk, and the order the work runs in. Every sentence here was
checked against this repository, the live database, the live origins, or the
GitHub API on 2026-09-01 and 2026-09-02; where something could not be checked
from here it says so. The ten-lens analysis this draws on is filed at
`docs/handoffs/2026-09-02-gap-analysis-digest.md`; every open finding has a
`BACKLOG.md` ID.

Status vocabulary used throughout: VERIFIED, IMPLEMENTED, PARTIALLY
IMPLEMENTED, WIRED BUT UNVERIFIED, SIMULATED OR PLACEHOLDER, BROKEN, BLOCKED,
EXTERNALLY DEFERRED, NEXT ACTIONS.

## 1. Current architecture, as verified

- **Application.** TanStack Start on React 19, Vite 8, Nitro (`node-server`
  preset; `vercel` when `VERCEL=1`), Tailwind 4, Vitest (153 files, 1694
  tests on 2026-09-02). Server functions carry `requireSupabaseAuth`; every
  operator verb asserts the operator or admin role through `assertOperator`.
- **Database.** Supabase Postgres, project `zrfzllupoccm…`. 88 tables in
  `public`, all RLS-enabled; `SECURITY DEFINER` routines for the governed
  writes; `supabase_migrations.schema_migrations` now matches the migrations
  directory (97 rows). One tenant, two admin accounts, both with membership
  and an active workspace as of today.
- **Scheduling.** Four `pg_cron` jobs post through `pg_net` to the scheduler
  hook: Search Console, GA4 and Umami daily observation, and the nightly
  propose-from-evidence job. The tick runs only schedules on an explicit
  allow-list.
- **Governed change lifecycle.** Finding rules (42 registered, five fix
  lanes) draft proposals; `transition_change_request` is the only state
  machine (approve, reject, mark applied, verify, roll back); the GitHub
  executor makes exact string replacements in allow-listed files of the
  website repository; `apply_change_request_rendered_proof` moves a change to
  applied only from a rendered proof of the live page; measurement windows
  open at approval (baseline) and at live (14, 28, 56, 90 days, Pacific
  dates); outcome verdicts file Inbox items.
- **Providers wired and real.** Search Console, GA4, PageSpeed, Umami,
  DataForSEO (Labs, SERP, backlinks, with a spend ledger and a hard ceiling),
  SerpAPI (ads transparency, paid SERP), Google Ads (read-only campaign
  reporting), the OpenAI Ads event and conversion bridge, Crawl4AI and
  Firecrawl rendering, Perplexity, and a LiteLLM model gateway with a
  monthly budget ledger.
- **Agent surface.** An MCP server (four generated route files that are not
  edited by hand), two streaming model routes, a manual-first workflow
  runner that parks before any mutating step.

## 2. Lovable, GitHub and Vercel, one by one

VERIFIED, recorded in full in `DEPLOYMENT_TOPOLOGY.md`.

| Surface                                    | State                                                                                                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lovable "Marky Sysyems" (`4aa4b3cf…`)      | Production, `trumove.marky.systems`. Since 2026-08-30 it syncs with `maxwest525/trumove-resource-center` (private), a repository Lovable created on reconnect. It does not see `synergy-layer`.                                                 |
| GitHub `maxwest525/synergy-layer` (public) | Where the work happens: CI on every push, the migrations directory, the docs. Everything merged to `main` since 2026-08-30 is live nowhere.                                                                                                     |
| GitHub `trumove-resource-center`           | The mirror production builds from. Diverged from `synergy-layer` at `a076088`; three files resolve to the `synergy-layer` side on merge (`app-shell.tsx`, `vite.config.ts`, `types.ts`). A validated reconciliation merge exists locally (§12). |
| Vercel `synergy-layer`                     | A shadow of GitHub `main` with no secrets and no production role. Its `.vercel.app` alias is public and serves the sign-up form against the production auth project (CODE-46).                                                                  |
| Website `brittmove-829a7519`               | `trumoveinc.com`, Lovable-hosted, prerendered SPA with an SPA fallback the host cannot turn into a real 404 (CODE-12, EXTERNALLY DEFERRED). The governed target of every change request.                                                        |

## 3. Source of truth

- **Code:** `synergy-layer` `main` is the governed source (CI, review,
  documentation), and production does not build from it. Until the operator
  decides §6 of `DEPLOYMENT_TOPOLOGY.md`, every merge to `main` must be
  followed by the reconciliation push (§5 step 2 there). Recommendation:
  Option B, adopt `trumove-resource-center` as the one repository, because
  Lovable's documentation says a reconnect always creates a new repository,
  so Option A (point Lovable back at `synergy-layer`) is not available.
- **Database:** the live Supabase project. The migrations directory is now
  a faithful record of it (CODE-38 closed today); it was not on 2026-09-01.
- **Vercel is not a candidate for primary.** The import proves nothing about
  intent; it has no secrets, no domain, and no operator. Recommendation:
  extend Vercel Authentication to the production alias or pause the project.

## 4. Highest-risk findings

Ordered by the mandate's priority (security and tenant risk, then
production, data accuracy, broken core workflows).

| #   | Finding                                                                                                                                                                        | Status                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | The website's "Talk to a specialist" form fakes success: nothing is stored, nobody is notified (MEAS-1, critical).                                                             | BROKEN, open. Website repository; pushes there are outside this session's branch permission. |
| 2   | Sign-up is open on the production auth project and seven registry read policies are `USING (true)` for any authenticated account (OP-11).                                      | Operator decision, open.                                                                     |
| 3   | The DataForSEO postback authenticates with the committed, browser-shipped publishable key (CODE-34).                                                                           | Open, next slice.                                                                            |
| 4   | The OpenAI Ads relay on the website is unauthenticated and trusts a spoofable Origin (MEAS-5); AOOS's bridge uses one global secret with a caller-chosen tenant (CODE-37).     | Open.                                                                                        |
| 5   | Scheduled runs resolve their tenant through the service-role fallback chain and pin the first answer for the process lifetime (AGT-1, CQ-1). Latent with one tenant.           | Open.                                                                                        |
| 6   | `mark_applied` is an operator-callable, proof-free route to the applied state (AGT-2, CODE-7).                                                                                 | Open.                                                                                        |
| 7   | Production builds from a repository `main` does not reach (OP-10).                                                                                                             | BLOCKED on the push permission (§12, §13).                                                   |
| 8   | The next rendered proof would have failed: the windows CHECK refused the 56 and 90-day rows the live trigger inserts (CODE-49).                                                | Fixed 2026-09-02, applied live.                                                              |
| 9   | Any signed-in account could run metered model calls; membership alone could advance runs, rewrite approved content, and read most tables as anon (SEC-2, DB-3 to DB-8, DB-13). | Closed 2026-09-02 (PR #110 and the hardening migration).                                     |
| 10  | "All systems normal" on the Command center is derived from a column nothing writes (MON-4); nothing notices when the scheduler stops (MON-2); no outbound channel (MON-1).     | Open.                                                                                        |

## 5. Measurement and attribution gaps

- **Canonical event taxonomy: absent on the website.** GA4 `page_location`
  is stripped of its query string, so `utm_*` and `gclid` never reach GA4
  from the only page view (MEAS-2). Leads carry no attribution columns
  (MEAS-3). AOOS never sees the full lead count; its lead signals are the
  consent-gated browser events (MEAS-4). The event contract in the website's
  `docs/analytics/ga4-event-contract.md` is the right place to define the
  taxonomy once these land.
- **Verdict confidence never reaches the screen** while it can be as low as
  0.4 (MEAS-7).
- **Absences rendered as zero or as nothing:** the GA4 rule node records
  `observations: 0` with no reason across 27 runs (CODE-47); Search Console
  never writes a `measurement_runs` row, so its failures cannot show on the
  cadence card (MON-5); `essential_concern_evaluations` has readers and no
  writer (CODE-43); scheduler outcomes are not durable (CODE-48, MON-3).
- **Deterministic before probabilistic:** the rule registry is the sparse-data
  model that exists; there is no forecasting layer, and the "Revenue impact"
  shown on rule findings is a copy of the business impact text (AGT-3).

## 6. SEO, AEO, paid, backlinks, CRO, monitoring

- **Technical SEO (website).** The `/research` hub is prerendered empty, so
  four research pages are orphaned in crawlable HTML (SEO-1). Every
  prerendered page carries the homepage's Open Graph tags before its own
  (SEO-2). The homepage FAQ JSON-LD names two questions that are not on the
  page (SEO-3). Unknown URLs serve the full homepage with `canonical /` and
  `index, follow` (SEO-6; host side is CODE-12).
- **AEO.** Structured data exists (FAQ, breadcrumbs, organisation);
  `llms.txt` links a page that does not exist (`/about`). No answer-engine
  surface is measured; DataForSEO SERP tasks use `regular` rather than
  `advanced` postback data, so SERP features are structurally invisible
  (COMP-4).
- **Paid.** Google Ads is read-only reporting with no budgets or
  conversions in the query (PAID-1, CODE-28); the OpenAI Ads bridge is real
  and instrumented; no other platform is connected (PAID-2, operator
  question).
- **Backlinks.** Toxicity is a never-scored scaffold (LINK-1); lost links are
  collected and never read (LINK-2); unlinked brand mentions are a pure set
  difference away (LINK-3); competitor link intersect is declared only
  (LINK-4).
- **Competitors.** Discovery is bounded to the approved keyword list, which
  the doctrine forbids (COMP-1); the hard-coded surface list hides the
  publisher rivals the research log names (COMP-2).
- **CRO.** No capability for owned pages (CRO-1); nothing measures form or
  CTA outcomes, and the one lead form is broken (MEAS-1).
- **Monitoring.** No outbound channel (MON-1), no overdue state (MON-2), no
  per-firing record (MON-3), a status line derived from nothing (MON-4).

## 7. Multi-tenant and security

Closed 2026-09-02: operator role on the model routes and the next-actions
re-ranking (SEC-2), constant-time hook secrets and no configuration detail in
failure bodies (SEC-8, SEC-9), credential presence disclosed only after
authentication (SEC-13), and the database pass (approval locks every lane,
actor bound to the session, membership-only writes closed, provisioning
creates membership, active workspace requires membership, anon privileges
revoked, vendor schedules off, ledger repaired).

Open: the postback key (CODE-34), audit rows with no tenant readable by every
authenticated account (CODE-36), the Ads bridge secret (CODE-37), sign-up
and the `USING (true)` registry policies (OP-11), tenant resolution for
scheduled runs (AGT-1), the Vercel origin (CODE-46), and the absence of tests
on the security-critical paths (CQ-5). Multi-tenant architecture is present
in the schema and the policies; the second tenant has never been created,
and AGT-1 is the one path that would break the day it is.

## 8. Agent runtime

The runner is manual-first and parks before mutating steps; the tick runs an
explicit allow-list; model spend is ledgered with a hard ceiling. Gaps: the
tenant fallback for scheduled runs (AGT-1); the proof-free `mark_applied`
verb (AGT-2); invented revenue and traffic impact on findings (AGT-3); the
three vendor workflows are unwired (their schedules are now honestly off,
CODE-42); the content brief builder is declared only (CONTENT-3, CODE-14);
the concern evaluator is unbuilt (CODE-43); six SEO runs are
`preflight_blocked` with no stored reason (CODE-44).

## 9. UX and information architecture

Two pages are called "Command center" and the legacy one is still linked as
"Evidence" (NAV-1). Four pages answer "is this connection working" in four
vocabularies (NAV-5). Legacy pages render zeros for first-run and failed
reads where the redesigned pages state the absence (STATE-1). Two design
systems coexist across 57 and six files (DS-1). Raw enum values reach the
screen on at least 20 surfaces (COPY-1). The six category slots land on both
systems.

## 10. Contradictory documentation

- `AGENTS.md` and `README.md` say `main` syncs to Lovable; it has not since
  2026-08-30 (DOC-1). `PROJECTS.md` names `synergy-layer` as the AOOS
  repository in two tables while its own warning says otherwise (DOC-2).
- `CURRENT_BUILD.md` contradicts itself on whether `GITHUB_EXECUTOR_TOKEN`
  is configured; the execution rows prove it is (DOC-3).
- `COMPETITIVE_MODEL.md` §4 and §7 disagree with the surface inventory on
  what paid SERP evidence reaches a page (growth DOC-1).
- Fixed today: `PROPOSAL_DATA_CONTRACT.md` (the naming trap, the revise
  routine), `TENANCY_PERMISSIONS.md`, `DEPLOYMENT_TOPOLOGY.md` §3, and
  `BACKLOG.md` CARRY-3 versus the live schedules.

## 11. Prioritised sequence

1. **Security and tenant risk.** CODE-34 (per-task postback token), CODE-36
   (tenant on audit rows, `activity_read` narrowed), CODE-37 (per-tenant
   bridge secret, no CORS), AGT-1 and CQ-1 (explicit tenant through the
   scheduler), CQ-5 (tests on `assertOperator`, tenant resolution, the five
   hooks). Operator: OP-11.
2. **Production and deployment.** The reconciliation push (Task 6, needs the
   permission in §13), the §6 decision, DOC-1 and DOC-2, the Vercel
   protection or pause (CODE-46).
3. **Data accuracy.** CODE-47 (GA4 absence in words), MON-5 (Search Console
   runs), CODE-44 (preflight reason), AGT-3 (no invented impact), MEAS-7
   (confidence on screen).
4. **Broken core workflows.** MEAS-1 on the website (needs a website push
   path), AGT-2 (`mark_applied` removed), CODE-43 (evaluator or honest
   absence).
5. **Search visibility.** SEO-1, SEO-2, SEO-3, SEO-6 repo side, COMP-4
   (`advanced` postback data on a click).
6. **Conversion.** MEAS-2, MEAS-3, MEAS-4, CRO-1.
7. **Growth.** COMP-1, COMP-2, LINK-1 to LINK-4, CONTENT-1 and CONTENT-4,
   PAID-1.
8. **Agent reliability.** MON-1 to MON-4, CODE-48, MON-9 to MON-11.
9. **UX.** NAV-1, STATE-1, COPY-1, NAV-5, then DS-1.
10. **Maintainability.** DOC-3 and the remaining documentation rows, the
    code-quality rows (CQ-2 to CQ-4).

Each step is a verified vertical slice: one focused commit, the gate green
(`npm run lint && npm run typecheck && npm test && npm run build`), a draft
PR, `CURRENT_BUILD.md` and `BACKLOG.md` updated in the same change, and a
named rollback.

## 12. First changes made in this session

All on `claude/marketing-intelligence-platform-8a4tba`, each merged to `main`
after a green gate unless noted.

- `DEPLOYMENT_TOPOLOGY.md` and the `PROJECTS.md` warning: the verified map
  (PR #104).
- Approval names the change in flight and the shared publish blocker is one
  Inbox item (CODE-31, PRs #107 and #108); a page's own description is a
  governed edit (CODE-33, PR #109); every rule says why it has no draft
  (CODE-1).
- Identity is not authority on the model routes and hooks (SEC-2, SEC-8,
  SEC-9, SEC-13; PR #110).
- The database-side hardening pass and the ledger repair (CODE-35, 38, 39,
  40, 41, 42, 45, 49), applied live and ledgered (PR #111).
- Applied live and ledgered on the way: `domain_ownership_candidates`
  (DB-1) and the five-argument `transition_change_request`.
- Rehearsed and validated (lint, 1638 tests, build) but **not pushed**: the
  reconciliation merge `52aae9e` of `synergy-layer` `main` into
  `trumove-resource-center` `reconcile-main`. The push is outside this
  session's branch permission.

## 13. Missing credentials and decisions

Credentials, verified from code and the live database (the Lovable secret
store itself cannot be enumerated from here):

- Unset, so the surfaces that need them render the named absence:
  `CLARITY_API_TOKEN`, `BING_WEBMASTER_*` (PR #91 territory), `AI_PRICE_*`
  (CODE-2: model spend is ledgered unpriced).
- Gated: SerpAPI on the free tier; Firecrawl cloud, Perplexity and SearXNG
  pending per the connections screen.
- Configured and proven by stored rows: `GITHUB_EXECUTOR_TOKEN`,
  Search Console, GA4, Umami, DataForSEO, Google Ads read access, the
  scheduler hook secret.
- Vercel: no environment variables, by design (§3).

Decisions only the operator can make:

1. Permission to push the reconciliation merge to `trumove-resource-center`
   `main` (command and rollback in `DEPLOYMENT_TOPOLOGY.md` §5 step 2), then
   publish in Lovable.
2. Adopt one repository (Option B) or keep reconciling on every merge.
3. Close sign-up or allow-list domains on the auth project, and decide
   whether the registry read policies stay open (OP-11).
4. Pause the Vercel project or extend Vercel Authentication to the
   production alias (CODE-46).
5. Reject or roll back the duplicate approvals: `78fc8c5e`, one of
   `b8e1c2e7` / `f10b0506`, and `26725aea` (CODE-31 residue).
6. PR #91 (Bing and Clarity): rebase and split, or close.
7. Whether the three vendor workflows should ever run, and on whose click
   (CODE-42).
8. A push path for the website repository, so MEAS-1 and the SEO rows can
   be fixed where they live.
