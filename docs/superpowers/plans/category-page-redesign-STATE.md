# Category-page redesign — work state

Living record of where the six-phase build has got to. Updated at the end of every phase.

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
| 1 | Shell + Command center | in review | see branch `claude/category-page-redesign-convz1` |
| 2 | Getting found on Google | not started | |
| 3 | Your pages | not started | |
| 4 | Who visits your site | not started | |
| 5 | Your competition, Site health, Connections | not started | |
| 6 | Ask Marky composer | not started | |

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
- Ignoring an audit finding has nowhere to persist to, so the queue reports `canIgnore: false`
  for that kind rather than showing a button that cannot work. A later phase that adds
  suppression storage should revisit `canIgnoreSource` in `src/lib/suggestion-queue.ts`.
- Repo-wide `npm run lint` was already failing before this work (thousands of pre-existing
  prettier errors). Every file these phases touch is kept lint clean individually.
