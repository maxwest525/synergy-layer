# Status: ACTIVE — merge train pending, two fix sessions in flight, first execution queued

Written 2026-08-28 from the audit-and-fix session (Claude session
`session_01AZeG4xBVE1hhUZXYU5tsgm`, branch `claude/hello-5m91tk`, PR #73).
This file is the working context for whoever picks any of this up: what was
found, what was fixed where, what order things merge in, and what is still
waiting on a human. When a listed item completes, update or close this file in
the same change.

## 1. The audit

A full front-to-back audit ran on 2026-08-28 over the working tree at
`47f6ae9`: every connector, API, registry declaration, and pipeline stage,
graded real / partial / declared-only / dead-end. The rendered report lives as
a private artifact ("AOOS Reality Audit",
https://claude.ai/code/artifact/8b224f6d-fc92-469b-871b-f0f1918f20c4). Headline:
zero fake wiring anywhere; the gaps are two credentials, four structural
pipeline breaks, a missing last mile (five connectors collect data no rule
module reads), and two nightly jobs failing silently.

## 2. What landed today

- `GITHUB_EXECUTOR_TOKEN` was placed in the AOOS Lovable project secret store
  and published; the `github_executor` probe reads healthy (GitHub 200 with
  the token). Where the token lives is now recorded in CURRENT_BUILD.md and
  `.env.example`.
- Two approved `title_h1` change requests await the first real end-to-end
  execution: `/services/corporate-relocation` and `/blog/true-cost-of-a-move`.
  Procedure: open the change at `/changes/$id`, Execute, then Check published.
  The operator drives the clicks; verification happens from the stored rows.

## 3. PR #73 (this branch) — merge this first

Three changes, all de-centering the first-built lane:

1. **Crawl4AI-first rendering** for proposal drafting and publish proof
   (`createRenderedVerifier`), Firecrawl fallback with recorded provenance.
   Fixes the live failure where "Propose the fix" died on a broken Firecrawl
   while Crawl4AI sat healthy.
2. **Measurement beyond title/H1**: migration `20260828100000` extends both
   lifecycle triggers to `page_metadata` (same observable, same grounded
   14/28/56/90 windows, backfill included). `site.crawl_directives` is
   deliberately unmeasured (indexation-shaped outcome), stated in the
   migration.
3. **The robots lane completes**: migration `20260828110000` plus
   `verifyPublishedRobots` prove a robots.txt change by whole-file comparison
   of the deployed file against the committed file at the recorded commit. No
   renderer involved.

## 4. The merge train (all nine PRs verified green and mergeable, 2026-08-28)

Order: **#73 → #72 → #77 → #74 → #76 → #80 → #78 → #81 → #75**, then close
**#79** (duplicate of #78 without the migration) and do **one Lovable
Publish** at the end.

Known frictions to resolve at merge time, not before:

- `docs/context/CURRENT_BUILD.md` is edited by nearly every PR; conflicts are
  expected from roughly the third merge onward. Resolve by keeping every dated
  section.
- **Migration timestamp collision**: #74 and #78 both created
  `20260828000000_*.sql`. Merge #74 first; rename #78's migration before it
  merges.
- **#73 and #81 genuinely overlap**: both edit
  `docs/execution-handbook/OUTCOME_MEASUREMENT.md` and
  `src/components/os/execution-card.tsx`. Merge #73 first; #81 then needs a
  real conflict resolution keeping both the wording-lanes section (#73) and
  the verdict-layer section (#81), and both card additions.
- **Pinned knowledge estimate is a three-way collision**: #73 (72,722), #77
  (72,615) and #81 (72,953) each pinned `estimatedInputTokens` from their own
  tree. Whichever merges after another must re-run
  `npm run knowledge:ingest` on the merged tree and paste the real total.

## 5. In flight elsewhere

- **Prompt 9 landed**: PR #81 (verdict loop). Verified green.
- **Prompt 10** (give observation-only findings their Not now / Put it back
  verbs) has produced no PR yet — session still running or not started. If it
  never arrives, the prompt text lives in the chat session named at the top of
  this file and can be re-run.

## 6. Still open after all of the above

- Title/H1-isms that remain by design of scope: the nightly proposal job files
  only `title_h1` proposals (`proposals/daily.server.ts`), and the regenerate
  verb exists only for title_h1 cards (`suggestion-queue.ts:200-206`).
- Last-mile rule modules (PageSpeed first; then SerpAPI `ad_*`, Umami,
  backlinks) — prompt 11 of the batch is written and unused.
- OpenAI Ads delivery default flip to `validate_only` — prompt 12, unused.
- Operator decisions: Google Ads wire-or-delete; n8n wire-or-delete; agents
  build-or-remove; SerpAPI free-gate revalidation; the six-domain competitor
  shortlist in `/competitors`; the two unbuilt category pages.
- A stated intention to migrate off Lovable exists (CATALOG.md mentions it in
  passing) with no plan, target, or timeline recorded. The known tie-downs are
  listed in the audit artifact; the cron target hostname hardcoded in three
  migrations is the one that fails silently.
