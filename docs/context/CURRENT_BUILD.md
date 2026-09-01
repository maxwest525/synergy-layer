# AOOS Current Build Context

> **Open work lives in [`BACKLOG.md`](BACKLOG.md), not here and not in the handoffs.**
> This file records current state. That one records what is still owed, with a
> stable ID per item and a grade saying whether it was verified or only carried
> forward. If you are looking for "what is left to do", that is the file.

> **2026-08-29 — read the session record first.**
> [`docs/handoffs/2026-08-29-session-record.md`](../handoffs/2026-08-29-session-record.md)
> covers a session that changed several things this file assumes.
>
> The two that matter most:
>
> 1. **The public website served 38 characters of text on every URL**, with one
>    sitewide title and no H1, including to Googlebot — a Vite SPA whose words
>    only existed after JavaScript ran. Fixed by prerendering (brittmove PR #4,
>    merged): 30 pages now ship 27,000–35,000 characters each. Any conclusion in
>    this file drawn from thin search evidence predates that fix.
> 2. **The page wording lane was locked to exactly two changes by the database**,
>    not by preference — `jsonb_array_length(_changes) <> 2`, an equality, since 20260814080000. Four layers enforced it. All four are removed and the
>    migration is applied, so the lane now edits subheadings too.

Purpose: a lightweight, always-current handoff note so a future agent run does not
lose decisions made in chat. This file records **current state only**: architecture,
live integrations, pending approvals, active workflows, and next priorities.

It is not authoritative documentation. Provider digests under
`docs/integrations/<provider>/DIGEST.md` and their PLAN files remain the source of
truth for provider behaviour and must never be overwritten by this file.

Last updated: 2026-08-31, after wiring Google Ads campaign reporting
(CODE-28) on top of the four merged CODE-6 rule sessions
(A: OnPage, B: Backlinks, C: Umami, D: discovery). Section 0 below still
describes 2026-08-21 and has NOT been rewritten; the current-state blocks
immediately below supersede it.

## 0l. Corrections from live evidence, and publish proof reads the page itself, 2026-09-01

Three stale claims in this file and the backlog were contradicted by the live
database and the live site, checked 2026-09-01. Recorded per SOURCE_OF_TRUTH
(live production first), because each one sent the operator chasing a fix that
was not theirs to make.

- **The executor token has been configured and working since 2026-08-11.** The
  "Still blocked" bullet below saying `GITHUB_EXECUTOR_TOKEN` is not configured
  is wrong and stands corrected. `change_request_executions` holds preflights
  reading "Proved with the configured token" (2026-08-11, 2026-08-14) and real
  commits to the website repository on 2026-08-14, 08-25, 08-28 and 08-29, each
  with its SHA and replacements recorded. One change (6aa5a3b1, corporate
  relocation) completed the full pipeline to applied on 2026-08-14.
- **The prerender is live in production.** Measured by direct curl 2026-09-01:
  the homepage returns 243,067 bytes with `#root` fully populated, and
  `/services/corporate-relocation` and `/research` serve real per-route H1s in
  the raw HTML — including the approved values of committed changes 26725aea
  and f8feacee. This supersedes CODE-24's 2026-08-31 empty-shell measurement
  and closes the deploy half of OP-9. Still true: an unknown path returns 200
  with the homepage bytes (soft-404), tracked in the backlog.
- **Publish proof was failing for the platform's own reasons, not the
  operator's.** The proof renderer chain had Crawl4AI answering HTTP 401 since
  at least 2026-08-30 (CODE-29), and its Firecrawl fallback reported the
  research page as "an unrendered application shell" while a plain fetch of
  the same URL served the approved H1. Fixed in this change: publish proof now
  reads the page's own prerendered HTML first, at no charge and with no
  credential, with Crawl4AI-then-Firecrawl kept as the JavaScript fallback for
  client-only routes (`createDirectFetchVerifier` in
  `src/lib/execution/execute.server.ts`, source loop in `checkPublishedPage`,
  contract updated in `docs/execution-handbook/EXECUTION_ROLLBACK.md`). A
  pending verdict now describes the page a source actually saw rather than a
  broken renderer's shell. The three committed-and-live changes should each
  flip to applied on one "Check the live page" click.
- **One change can never prove as targeted.** The homepage meta-description
  change (78fc8c5e) edited `DefaultSeo.tsx`, but the live homepage head serves
  the same old sentence from a different source in the website repo, so the
  edit is committed, deployed, and invisible. That is a proposal-targeting
  defect (CODE-30), not a publish failure.

## 0k. Google Ads reports real campaign data, 2026-08-31

CODE-28 in `BACKLOG.md`, closing the reporting half of OP-1. Until now
`google-ads.server.ts` did one thing: prove OAuth/developer-token access via
`customers:listAccessibleCustomers`. It now also sends a GAQL
`googleAds:search` query for campaign id/name/status/channel type plus
impressions, clicks, cost and conversions, segmented by day over the trailing
30 days, and upserts the rows into `google_ads_snapshots` keyed on
`(tenant_id, customer_id, campaign_id, segment_date)` -- a rerun corrects that
day's numbers rather than duplicating, since Google Ads attributes
conversions for several days after the click.

- New pure module `src/lib/measurement/google-ads.ts` (GAQL builder,
  normalizer, connection-state description) and server module
  `src/lib/measurement/google-ads.server.ts` (token acquisition, fetch,
  upsert, a `measurement_runs` row per attempt) -- mirrors the GA4/PageSpeed
  measurement pattern already in this directory.
- `refreshGoogleAds` server function and a Google Ads card on
  `/measurement/tools`, gated behind `assertOperator` like every other
  provider refresh. One click, one report, no schedule.
- `growth-operations.ts`'s `google.ads` capability gained a
  `campaigns.report_read` operation and dropped `campaign_reads` from its
  `prohibited` list; budget/bid/ad writes stay prohibited.
- `connections.ts`'s `google_ads` entry moved off `table: null` -- it used to
  be this file's own example of "a credential with no code behind it."
- `essentials.tsx`'s Google Ads concern now reads real stored-row counts
  (`data.googleAds`) instead of a hardcoded "nothing stored" sentence.
- **Stated gap, not silently missing:** `google_ads_snapshots` already
  existed live in the database with zero rows and no migration file behind
  it -- the same undocumented-drift shape CODE-9 found elsewhere. A catch-up
  migration (`20260831210000_google_ads_snapshots.sql`) now matches the live
  schema. No rule module reads this table yet, so a stored campaign-day row
  does not yet become a finding; negative keywords and Keyword Planner remain
  unbuilt. 10 new tests, 1624 total, typecheck clean, lint 0 errors.

## 0j. Competitor discovery findings reach the operator, 2026-08-31

Session D of the four-way parallel rule build
(`docs/handoffs/2026-08-28-parallel-rule-sessions.md`, CODE-6 in
`BACKLOG.md`). Labs (`competitors_domain`), Domain Analytics (whois,
technologies) and Content Analysis were all collecting snapshots nothing
read; four rules now do, on `discovery-rule-checks.ts` (pure) and
`discovery-findings.server.ts` (writer, `source_module: "competitor-discovery"`
— never `"dataforseo"`), wired to a new manual workflow
`dfs-discovery-findings` (`registry/modules/competitor-discovery.ts`). Costs
nothing to run: it re-reads stored snapshots, calls no provider.

- `overlap_list_reached_the_row_limit` and `rival_page_mentions_your_brand`
  write `recommendations` like every other fact rule.
- **The other two are not findings.** `same_registration_details_across_two_known_domains`
  and `identical_technology_stack_across_two_known_domains` file a `pending`
  row in a new table, `domain_ownership_candidates`, for the operator to
  confirm or reject — same shape as `ad_advertiser_candidates`. Nothing writes
  `confirmed` or touches `company_classification` from a match; only an
  explicit operator action would, and that action does not exist as a UI yet
  (`CODE-27`). See `COMPETITIVE_MODEL.md` §4 for the full lifecycle.
- **Still a documented gap, not silently missing:** `collectWhoisOverviewForKnownDomains`
  is written and tested but has no caller — no workflow node, no operator
  button — so the whois-match rule stays correctly silent
  (`whois_collection` prerequisite unmet) until one is built.
- Four new non-volume `Prerequisite` members (`whois_collection`,
  `technology_collection`, `brand_mention_collection`,
  `reviewed_competitor_set`) in `rule-buckets.ts`, so an empty competition
  screen would eventually name what it is missing rather than blaming volume.
  The three existing screens that already call `unmetPrerequisites` (Your
  pages, Site health, Getting found) pass `true` for all four: none of them
  reads discovery evidence, so those screens say nothing about it rather than
  guessing.
- Fixed in the same change: `workflow-runner.server.ts`'s brand-term
  derivation for `cap.dataforseo_content_analysis` stripped a domain's TLD but
  left a leading `www.` on, so every mention search for a `www.`-form target
  searched for the wrong word.

## 0i. Umami rule engine reaches the visitors category, 2026-08-31

Session C of `docs/handoffs/2026-08-28-parallel-rule-sessions.md`. `cap.umami`
had been `real` since 2026-08-18 (see 0d) with `umami_snapshots` rows stored
and no rule reading them, so `visitors` was a category with no Umami finding.
Three of the doc's rules shipped, each with every required adversarial-review
correction applied: `umami_zero_recorded` (renamed from the proposed
`umami_tracking_silent`), `umami_site_traffic_shift`, and
`umami_referrer_source_stopped`. `umami_page_traffic_shift` and
`umami_recording_stopped` stay killed, as the doc requires.

- `src/lib/umami-rule-checks.ts` (pure, fully unit-tested),
  `src/lib/umami-rules.server.ts` (writer), `src/registry/modules/umami-findings.ts`
  (registry module) — new. `evaluateUmamiSnapshots` runs inline at the end of
  `observeUmami` (`src/lib/umami/observe.server.ts`), mirroring how
  `evaluatePageSpeedReadings` runs at the end of the PageSpeed read: a rules
  failure never fails the observation itself.
- `src/lib/rule-buckets.ts` gained a new `umami_second_window` prerequisite
  (deliberately not a reuse of `second_collection` or `analytics`, both wired
  to other providers' facts) and the three rule assignments. The three
  call sites that build a `PrerequisiteState` (`your-pages.ts`,
  `site-health.ts`, `getting-found.ts`) pass `umamiSecondWindow: true` as a
  stated placeholder, the same pattern already used there for
  `urlInspection`/`approvedKeywords`/`backlinkCollection` — none of them
  reads Umami yet, so the field is honestly a stub, not a real check.
- `connections.ts`'s `umami` entry now claims `findingSources: ["umami"]`.
- `umami/client.server.ts`'s `fetchUmamiMetrics` slice-to-25 default is now
  `UMAMI_RULE_THRESHOLDS.referrer.appSliceLimit`, read from the same object
  the rule's completeness guard reads, instead of a hand-copied `25`.
- `docs/integrations/umami/DIGEST.md` gained the verified provider default row
  limit (500) for `GET /api/websites/:id/metrics`.

**Inert today, honestly:** as of 0d there is exactly one stored Umami run (four
rows, 2026-08-18, all real zeros). `umami_site_traffic_shift` and
`umami_referrer_source_stopped` both need a second, non-overlapping stored
window before they can fire at all — on the daily 28-day cadence that is
roughly day 29 of collection — and the pending capability-promotion migration
(0d) still has to be applied before the daily job even runs. `umami_zero_recorded`
can fire today once that migration applies, on the existing four rows.

**Not done, flagged in the PR body:** `finding-router.ts`'s `CATEGORY_BY_RULE`
still lists the old `umami_tracking_silent` id, which no rule emits any more;
harmless because `CATEGORY_BY_MODULE`'s `umami: "visitors"` entry routes all
three current rule ids correctly by fallback, but the stale entry is worth
deleting whenever that shared file is next touched.

## 0h. Subheadings surfaced, heading order deleted, 2026-08-28

The page audit parsed `h2Count` and `headingSkips` on every page and no check
read either: two signals collected on every run and shown to nobody. They are
resolved in opposite directions, deliberately.

- **`h2_missing` is now a check.** It fires only when a page has no `<h2>` at
  all AND is long enough for sections to mean something, reusing
  `THIN_CONTENT_WORDS` rather than inventing a second word count. Severity is
  `advice` and the copy makes no ranking claim, because no Google document
  requires a subheading. The reasons given are the documented ones: Google
  reads headings to understand how a page is organised, and unclear headings
  are an input to it replacing the title it displays.
- **`headingSkips` is deleted, not surfaced.** Google states plainly that "it
  doesn't matter if you're using them out of order". A rule on heading order
  would have manufactured findings Google's own documentation contradicts,
  which is the exact failure the no-invented-thresholds rule exists to stop.
  The field, its computation and its consumers are gone, and a test asserts
  the fact no longer exists on the parsed page.
- `PAGE_CHECK_FIX.h2_missing` is `null`: no governed change kind can edit a
  subheading yet, so the finding is reported and honestly has nowhere to go.
  The lane is tracked separately.

## 0g. PageSpeed reaches the operator, 2026-08-28

The fifth module that writes a recommendation. `pagespeed_snapshots` had
stored real Core Web Vitals readings since the measurement slice landed and
nothing read them: `findingSources` for `pagespeed_insights` was empty, so the
connector was pinned at "collecting and reaching nobody" no matter how many
runs it stored.

- `pagespeed-rule-checks.ts` (pure) and `pagespeed-rules.server.ts` (writer,
  `source_module: "pagespeed"`). Two rules: `page_lcp_poor`, `page_cls_poor`.
- **No threshold is invented.** The bands are Google's published Core Web
  Vitals values (LCP good at or under 2.5s, poor above 4.0s; CLS good at or
  under 0.1, poor above 0.25) and only the band Google itself calls poor
  fires. The needs-improvement band is deliberately silent.
- **The lab/field distinction is stated on screen.** The stored values come
  from `lighthouseResult.audits[].numericValue`, one simulated load. Google's
  page-experience signal and the Search Console Core Web Vitals report read
  field data from real visitors (CrUX). The copy says the reading is a test
  load and never claims the page fails Core Web Vitals.
- Both rules are bucketed `fact`: a direct per-page measurement answers at any
  volume, which makes these among the few rules this property's traffic can
  support.
- The rules run after each PageSpeed measurement; a rules failure never fails
  the measurement, because the snapshot is stored and immutable either way.
- `PAGESPEED_API_KEY` is now declared optional in the connector catalog,
  matching the code: the v5 API answers without a key, and a working keyless
  setup previously read as "not configured".

## 0b. Command center queue corrections, 2026-08-28

Three defects around the suggestion queue, fixed on this branch:

- **Rule-finding cards carry their page address again.** The Command center
  read hardcoded `targetUrl: null` for every recommendation row. It now reads
  the stored `suggested_action.target` through `pageUrlFromSuggestedAction`
  (`finding-router.ts`), which returns only a page URL: query terms, `site`
  and bare domains stay off the card, and the coverage-gap `page :: query`
  form is split the same way `deriveFixTarget` splits it.
- **Site crawl findings can draft their fix.** `siteSources` never carried the
  check id, so `verbsFor` could not offer "Draft the fix" even though
  `SITE_CHECK_FIX` maps `robots_blocks_site`, `robots_blocks_pages` and
  `sitemap_not_declared` to the crawl-directives lane and `proposeAuditFix`
  already accepted `scope: "site"`. The check id now travels on the row, the
  card dispatches those three to the site scope, and the verb carries its own
  copy (`DRAFT_SITE`): the site draft is deterministic, so it is not metered
  and says so. The other six site checks still offer no draft.
- **The lying "Run agent" button is gone.** `/agents/$id` offered a button
  whose server function unconditionally throws (`agent-runtime.server.ts`).
  Per the no-lying-controls rule it now renders a sentence saying agent runs
  are switched off in this build; `runReferenceAgent` keeps refusing
  server-side and no longer has a UI caller.

## 0c. Registry and workflow-runner integrity, 2026-08-28

Five related defects around "declared versus wired" were closed in one pass:

- **The runner refuses what it cannot execute.** `executeNode` in
  `src/lib/workflow-runner.server.ts` used to fall through for any capability
  key with no dispatch branch, stamping `last_run_at` and health "healthy" and
  returning success for a step that did nothing. An unmatched capability now
  fails the step with a named error. The same fall-through inside the
  DataForSEO handler (an unrecognised `cap.dataforseo_*` key reported the
  target as observed) now routes to the same refusal.
- **Two "real" claims corrected to `pending`.** `growth.opportunity_scanner`
  and `content.brief_builder` were declared `real` with no execution path in
  the runner; every run of theirs was the silent fall-through above. Both are
  redeclared `pending` per the `types.ts` rule "never claim more than is
  wired". No runtime behaviour changes: their workflows contain agent nodes,
  which `assertRunnableGraph` already refuses.
- **A forcing function now guards the seam.** `operational-bridges.test.ts`
  reads `workflow-runner.server.ts` the way `connections.registry.test.ts`
  reads its sources: every capability a registry workflow references must be
  declared by a module, and every reachable capability declared `real` must be
  dispatched by the runner. Declaring a capability real without wiring it now
  fails `npm test`.
- **`wf.seo_validation` no longer references an undeclared key.** Its first
  node referenced `cap.knowledge_retrieval`, which no module declares (it
  exists only in the 2026-08-04 seed migration) and no runner path executes,
  so the "load" step was a silent no-op. The node is removed; the workflow is
  the single real `seo.validation` step, and a registry-only rebuild is
  self-contained. The seed row for `cap.knowledge_retrieval` still exists in
  the database; any seed-era workflow that references it now fails with the
  named refusal instead of silently succeeding.
- **Sync preserves the earned SerpApi promotion.** `syncRegistryDefinitions`
  unconditionally overwrote `integration_state`, silently reverting the
  runtime promotion `recordSerpApiAccountStatus` earns for
  `cap.serpapi_ads_transparency` when the free account probe succeeds. Sync
  now preserves a stored `real` on that one key while its declared state is
  `pending`; a failed probe still demotes it through the same runtime path.
  Every other capability's state remains the registry's claim. No
  `docs/execution-handbook/` contract covers capability integration states, so
  the decision is recorded here and in the code comments.

## 0d. cap.umami promoted to real, 2026-08-28

The daily `umami-daily-observe` firing (pg_cron `aoos-umami-daily-observe`,
16:45 UTC) had failed on every run with "Capability "Umami (self-hosted
analytics)" is not authorised yet": the workflow runner admits only `real`
capabilities, and `cap.umami` was still declared `pending` even though its own
promotion condition ("pending until one authenticated read stores a snapshot")
was met on 2026-08-18. Re-verified against the production database on
2026-08-28: exactly four `umami_snapshots` rows for TruMove, all from one
succeeded `measurement_runs` row with `authenticationSucceeded: true` and HTTP
200, and three stored `workflow_runs` failures carrying the exact refusal
above.

Promoted in `src/registry/modules/self-hosted-analytics.ts` and, because
registry sync is operator triggered, also in migration
`20260828120000_promote_umami_capability_real.sql`, which flips the
`capabilities` row the runner actually reads.

**Waiting on a human:** the migration is a file until it is applied. After this
branch merges to `main`, apply it (Lovable prompt: "Apply pending Supabase
migrations") or run the registry sync from the admin surface. The 16:45 UTC run
keeps failing until one of those happens.

## 0e. Outcome verdicts feed the loop, 2026-08-28

Until this change, a computed outcome verdict, including `failure`, fed nothing
but a coloured label on Site health: nothing consumed `outcomeVerdict` outside
`site-health.ts`, an operator could mark verified a change the system graded a
failure, and a failed change never suggested its own rollback. Closed, minimally
and honestly:

- **Failure files to Inbox.** `src/lib/outcome-alerts.server.ts` runs at the end
  of each daily Search Console observation, right after the evidence windows are
  captured (the only moment a verdict can newly resolve). Each change whose
  graded reading is a failure gets one needs-attention item, once per change
  ever, carrying the verdict's own reason and window and linking to
  `/changes/$id` where the rollback control already lives. Verdicts come from
  `outcome-verdict.ts` as-is; the new module only selects.
- **Verifying is an informed act.** `fetchChangeRequest` now returns the
  change's graded readings (same assembly and grading as Site health, narrowed
  by a new `changeRequestId` parameter on `fetchStoredOutcomes`), rendered on
  the change page's Outcome card and inside the execution card beside Mark
  verified. The verify gate is deliberately unchanged (finalized post-change
  GSC rows); the verdict is displayed context, and
  `docs/execution-handbook/OUTCOME_MEASUREMENT.md` now records both the verdict
  layer and that non-gating decision.
- **Success reads as a completed journey.** On the Site health outcomes tab,
  decided verdicts sort above the still-waiting readings (worst news still
  first) and a success card states the journey is complete rather than sitting
  under "too early" cards.

`getMeasurementWatch` remains display-only, as designed.

## 0a. Current state, 2026-08-25

- **2026-08-28:** the nightly propose-from-evidence job can now succeed:
  migration `20260828090000` lets `create_title_h1_proposal` accept a null
  actor as the governed system path (drafts logged as a system actor, human
  approval unchanged, non-null actors keep every check), and
  `isTerminalConfigurationFailure` now pauses the job on the tenant-visibility,
  operator-authority, and no-renderer refusals instead of retrying every
  night. The migration still needs applying to the remote project; until then
  the job pauses itself on the first refusal.

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

**Addendum, 2026-08-28: proposal drafting and publish proof render through
Crawl4AI first.** `createRenderedVerifier` in
`src/lib/execution/execute.server.ts` previously consulted only
`firecrawlEndpoint()`, so "Propose the fix" and "Check rendered page" failed or
spent credits whenever Firecrawl was down, while Crawl4AI sat healthy and
preferred everywhere else. The verifier now uses the same precedence as the
page audit: Crawl4AI first, Firecrawl only as fallback, with the fallback
provenance recorded in `renderedBy` the same way the audit records it. The
execution card names the renderer chain and prices the check honestly: no
charge on Crawl4AI, 1 credit only when the Firecrawl fallback answers. A stale
Crawl4AI render can only under-prove a forward change (the approved new wording
cannot exist in a cache older than the commit), so the proof's safety direction
is preserved.

**Addendum, 2026-08-28: measurement is no longer title/H1-only, and the
robots lane completes.** Two structural breaks closed:

- The measurement lifecycle triggers gated on `proposal_type = 'title_h1'`, so
  a meta-description change could be approved, committed, and proven live and
  then never receive a cycle, windows, or a verdict. Migration
  `20260828100000` extends both triggers to `page_metadata` — same observable
  (the page's own Search Console rows; Google places titles and descriptions
  in the same appearance-not-ranking category), so the grounded 14/28/56/90
  windows carry over with no new number invented — and backfills cycles and
  windows for any page_metadata change already approved or live.
  `site.crawl_directives` is deliberately not measured on these windows: its
  outcome is indexation, not click choice, and the migration says so.
- The crawl-directives lane could be committed but never proven applied,
  because the proof routine only accepted title/H1 and meta-description
  shapes. robots.txt is a static file, so its proof is not a render at all:
  the executor now fetches the deployed file, reads the committed file at the
  recorded commit through the GitHub executor, and compares whole files
  (`verifyPublishedRobots`, migration `20260828110000`). Whole-file
  comparison is deliberate — the site-wide unblock fix leaves a bare
  `Disallow:` line that literal containment cannot prove.

Still title/H1-only after this change, recorded so nobody thinks the job is
finished: the nightly autonomous proposal job files only title_h1 proposals,
and the "Write it again" verb exists only for title_h1 cards. Both are
proposal-generation gaps, not measurement gaps, and are tracked separately.

**How to read this file.** Section 0 is the current state and supersedes anything
below it that disagrees. The later sections are kept in the order they were
written, as a dated record of how the build got here. Where an older section
contradicts section 0, section 0 wins and the contradiction is named rather than
quietly edited away.

## 0f. Deletion pass and known orphan registry rows, 2026-08-28

Two deletions landed on this branch:

- `/today` (the old Action center, `src/routes/today.tsx`) is deleted along
  with its `NAV_EXEMPT` entry. It was a full duplicate approval queue on a
  different data path (`getInbox`/`getOverview`) that could silently disagree
  with the Command center at `/`. The server reads it used remain on disk:
  `getOverview` is still consumed by `/command-center`; `getInbox`,
  `resolveInboxItem` and `getMeasurementWatch` now have no route consumer and
  are candidates for a later pass.
- `src/lib/connectors/vps-runtime.server.ts` (a two-line re-export shim nothing
  imported) and its test are deleted. `n8n.server.ts` / `triggerN8nWorkflow`
  and its tests stay: whether n8n gets wired or removed is a pending operator
  decision.

**Known orphan registry rows, documented for a later decision — do not delete
the data.** These database rows exist only because the 2026-08-04 seed
migration (`20260804091534_*.sql`) inserted them; they are not declared in
`src/registry/modules/*.ts`, and `src/registry/sync.server.ts` only upserts —
it never prunes — so a registry sync can neither refresh nor remove them:

- `agent.research` — seed-only, but **still read at runtime** by
  `src/lib/web-research.server.ts`, so pruning it would break web research.
- `wf.research_refresh`, `wf.content_generation`, `wf.publish` — seed-only
  workflows. (`wf.seo_validation` is seeded _and_ declared in code, so it is
  not an orphan.)
- `sch.research_refresh`, `sch.seo_validation`, `sch.content_generation`,
  `sch.publish` — seed-only schedules, all disabled since
  `20260814070000_signal_integrity_recovery.sql` set every schedule except
  `gsc-daily-observe` to disabled.

Whether these rows should be pruned, or re-declared in the code registry, is a
human decision that has not been made.

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
  without writing. **Where this secret lives, recorded 2026-08-28 so nobody
  hunts for it again:** it is a fine-grained GitHub personal access token
  created on the `maxwest525` GitHub account, scoped to the single repository
  `maxwest525/brittmove-829a7519` with Contents read/write only (the executor
  is hard-allowlisted to that repo and branch in
  `src/lib/execution/allowlist.ts`, so a wider token buys nothing). It is
  placed in the AOOS Lovable project's secret store (Project Settings, then
  Secrets, in the Lovable editor for the project deployed at
  `trumove-resource-center.lovable.app`). It is never written into `.env`,
  never a `VITE_` variable, and does not belong to the customer site's
  project. A newly placed value is not live until the next Lovable publish,
  and a deleted one survives until the next publish; see AGENTS.md, "The
  layer that keeps costing hours". Proof of placement is the
  `github_executor` probe on `/capabilities/systems` turning healthy, or the
  execution card on `/changes/$id` reporting the executor connected; the
  settings screen alone proves nothing. If the deployment ever moves off
  Lovable, this secret moves to the new platform's secret store with it; the
  token authenticates to GitHub and is platform-independent.
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
