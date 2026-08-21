# Category-page redesign — work state

Living record of where the six-phase build has got to. Updated at the end of every phase.

Last updated 2026-08-21 at `2a2e87f`.

Authorities, in order: the spec
`docs/superpowers/specs/2026-08-20-category-page-redesign-design.md`, then the approved boards
in `design/` (`Home.dc.html` = Command center, `Main.dc.html` = Category page). These decisions
are settled and are not reopened phase by phase.

## Standing constraints

| Rule | Status |
|---|---|
| No demo data: every number from a real stored row, absences stated | held in phase 1 |
| No metered provider call except on an operator click, cost on the button | held in phase 1 |
| Approve routes through the existing change-request flow, never a bypass | held in phase 1 |
| Nav capped at 7 categories plus home | enforced by `src/lib/nav-contract.test.ts` |

## Phases

| # | Phase | State | PR |
|---|---|---|---|
| 1 | Shell + Command center | shipped | #35 |
| 2 | Getting found on Google | shipped | #38, extended by #40, #43, #45, #46 |
| 3 | Your pages | shipped | #40 |
| 4 | Who visits your site | not started | |
| 5 | Your competition | not started | |
| 5 | Site health | shipped | #41 |
| 5 | Connections | shipped | #44 |
| 6 | Ask Marky composer | not started | |

Phase 5 was split: Site health and Connections shipped as their own pages, Your
competition did not. It and Who visits your site are the two categories still
pointing at the legacy routes they absorb.

**Where the pages actually live.** The plan below says a phase moves its
category's `to` to `/${slug}` when the page lands. That is not what happened:
every built page renders at the legacy route it absorbed (`/search`, `/pages`,
`/measurement`, `/capabilities`) and the reserved slugs are unused.
`categoryForPath` matches both, so nav and breadcrumbs are correct either way.
Moving them is a one-line change per category plus redirects for anything
holding the old URLs, and nobody has decided when.

## What phase 1 established, that later phases build on

- `src/lib/categories.ts` is the only place the navigation is defined. Each category carries a
  permanent `slug` and a `to` pointing at the route it currently absorbs. **When a phase builds a
  category's real page, change that one `to` to `/${slug}` and nothing else needs touching**;
  `categoryForPath` already matches both.
- `src/lib/suggestion-queue.ts` is the queue state machine: open / ignored / done, restore
  legality, dedup by `issue_fingerprint`, the Fix now / Worth doing / Nice to have ranking, and
  the weekly cap of 7. Phase 2's queue UI renders this rather than re-deriving it.
- `src/lib/command-center.ts` is the pattern for a page view model: pure, exhaustively tested,
  and every tile carries `value: null` plus a `missingReason` when no row backs it. Category
  pages should follow the same shape.
- `src/lib/command-center.functions.ts` is the read pattern: one tenant-scoped fetch, every read
  `assertRead` guarded so a failure raises instead of arriving as a zero.
- The black skin tokens live in `src/styles.css`, converted from the boards' hexes to oklch.
  `--info` is the fourth urgency rank ("nice to have"). Use tokens, never raw hexes.

## Known transitional state

- The Action center now lives at `/today`: reachable, deliberately unlinked.
- `src/components/os/shell.tsx` (the old ~30-item sidebar) is unused but still on disk, as the
  spec's "nothing is deleted in this phase" requires.
- ~~Ignoring an audit finding has nowhere to persist to~~ — **resolved in #45.** Migration
  `20260821090000_suggestion_suppressions` gives it storage, `canIgnoreSource` was revisited,
  and the queue's verbs are rendered by `src/lib/suggestion-verbs.ts` through one shared
  `suggestion-card.tsx`.
- ~~Repo-wide `npm run lint` was already failing (thousands of pre-existing prettier errors)~~ —
  **no longer true.** CI became a real gate (lint, typecheck, test, build) and the repo is
  clean: 0 errors, 14 react-refresh warnings, verified at `2a2e87f`. The thousands of errors
  were phantom: `eslint .` was following the `node_modules` symlink inside
  `.claude/worktrees/*` and linting every dependency. `eslint.config.js` now ignores
  `.claude`. Do not carry the "lint is pre-broken" line into new plans; it is what let a
  real formatting error sit unnoticed on `main`.
- The lane plans in this directory still carry a Windows worktree path and a
  `bunx`-based test command in their Global Constraints. The repository itself is npm and
  vitest (`npm test`, `npx vitest run <file>`); read those lines as one contributor's local
  setup, not as project convention.
