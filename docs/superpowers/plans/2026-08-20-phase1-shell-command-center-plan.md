# Phase 1 — Shell + Command center (implementation plan)

Spec: `docs/superpowers/specs/2026-08-20-category-page-redesign-design.md`.
Boards: `design/Home.dc.html` (Command center), `design/Main.dc.html` (Category page shell).
Spec build order, phase 1: *"new nav (rail + panel + top bar), black skin tokens, home page.
Old routes still reachable; nav switched. Riskiest UI change first, **no new data needed**."*

## Hard constraints carried into every decision

1. **No demo data.** Every number renders from a real stored row. Absent data renders as an
   absence with the stored reason, never as `0`, `—`, or a placeholder.
2. **No new data.** Phase 1 adds no migration and no table. Ignore reuses the existing
   `rejected` state on `recommendations` / `change_requests`.
3. **No metered calls** except behind an explicit operator click, with the cost on the button.
4. **Approve routes through the existing change-request flow** (`approveChangeRequest`), never a bypass.
5. **Nav cap:** at most 7 categories plus home. Phase 1 ships the 6 categories the spec table
   defines; a unit test enforces the cap so a later phase cannot quietly exceed it.

## Deliverables

### A. Black skin tokens — `src/styles.css`

Retune `:root` to the board palette. The file's own rule ("all colors MUST use oklch") stands,
so hexes from the board are converted, not pasted:
`#000` bg, `#0a0a0a` card, `#060606` inner card, `#262626` border, `#1fd15f` green,
`#eab308` yellow, `#ef4444` red, `#38bdf8` blue (new `--info` token for "nice to have"),
`#a3a3a3` / `#8a8f98` explanation text.
`GlassCard`'s blur and gradient hairline give way to the board's flat card.

### B. Category model — `src/lib/categories.ts` (pure, tested)

The single source of truth for the new nav. Exports the ordered category list
(id, slug, route, title, one-sentence purpose, icon key), `CATEGORY_NAV_CAP = 7`,
`categoryForPath()`, and `breadcrumbsForCategory()` producing
`trumoveinc.com › Categories › <page>`.
Categories per the spec table: Getting found on Google, Who visits your site, Your pages,
Your competition, Site health, Connections.

### C. Suggestion queue state machine — `src/lib/suggestion-queue.ts` (pure, tested)

Satisfies the spec's per-phase testing requirement
(*"queue state transitions (open/ignored/done, restore, dedup)"*) and gives phase 2 its
foundation. Derives, from existing stored states only:

- `open` — recommendations in `draft|proposed|under_review|observed` with no linked change
  request; change requests in `proposed`.
- `ignored` — either kind in `rejected`. Restorable only where the underlying transition is
  legal; `canRestore` says so rather than offering a button that would fail.
- `done` — either kind in `applied|verified`.
- **dedup** by `issue_fingerprint`, then by `(kind, id)`.
- **urgency rank** `fix_now` / `worth_doing` / `nice_to_have` from real fields only:
  page-audit `severity` maps directly (critical / warning / advice); recommendations and change
  requests map by stored age (> 14d, > 3d, else). Urgency is written as elapsed time
  ("waiting 6 days") because the stored field is a timestamp.
- Weekly visible cap of 7, ranked.

Colour follows the spec's stated palette semantics — `fix_now` red, `worth_doing` yellow,
`nice_to_have` blue. (The board paints a count of 1 green; the spec text assigns green to
good/approve/active and blue to "nice to have". Spec governs behaviour, so rank drives colour.)

### D. Command center view model — `src/lib/command-center.ts` (pure, tested)

Turns facts into exactly what the board renders, with every absence explicit.
`Tile = { label, icon, value: number | null, delta: Delta | null, explanation, missingReason: string | null }`.

| Tile | Real source | Delta | Absence |
|---|---|---|---|
| Google clicks · 28d | `buildPeriodComparison(...).current.clicks` (existing, tested) | `change.clicksPercent` | `status:"insufficient"` gives value `null` plus "Only N of 56 required calendar days are stored." |
| Visits · 28d | latest GA4 28-day snapshot `totalSessions` | only when a stored snapshot ends exactly 28 days earlier (a genuinely disjoint prior window); otherwise `null` plus reason. Rolling windows are never diffed. | no stored snapshot gives `null` plus `describeGa4Connection().statement` |
| Fixes live | `change_requests` with `published_proof_at IS NOT NULL`, proven live on the rendered page | none | read failure throws; a true `0` is shown as `0` |
| Pages improved | distinct `target_url` of `change_requests` in state `verified`, approved and live and outcome checked | none | as above. No improvement verdict is synthesised; `describeOutcome` refuses to and so do we. |
| Pages needing fixes | distinct URLs across `getPageAudit().findings[].pages[].url` | none | audit never ran gives `null` plus "The page audit has never run, so page checks are blind." |

Also builds: the assist stat line, the top-3 cards across all categories (highest urgency,
oldest first), per-category waiting counts and tone, and the "Suggested next" rows, including
the metered `Run it · reads up to 100 pages` row, which is an operator click with its cost stated.

### E. Facts reader — `src/lib/command-center.functions.ts`

`getCommandCenterFacts`, `createServerFn({method:"POST"}).middleware([requireSupabaseAuth])`,
tenant-scoped, every read wrapped in `assertRead` so a failed read surfaces as an error and
never as a zero. Reuses existing readers rather than new SQL wherever one exists.

### F. Shell — `src/components/os/app-shell.tsx`

Top bar (logo, breadcrumb, centered "Search or ask Marky ⌘K", right-side status), 52px icon
rail (Command center, 6 categories, settings at the foot, active item boxed green), 208px
secondary panel (in-category views, then other categories with waiting counts).
`⌘K` opens the existing command palette; "Ask Marky" is phase-gated last and is not wired here.
Old routes stay reachable by URL; only the nav changes.

### G. Home — `src/routes/index.tsx`

The Command center, rendering D. `/command-center` (the old evidence page) is untouched and
drops out of the nav.

## Test plan (TDD, tests first)

`vitest`, `environment: "node"`, no DOM. Logic lives in pure modules and is tested exhaustively;
components are asserted via `renderToStaticMarkup` per the existing single component-test idiom.

- `src/lib/categories.test.ts` — ordering, cap enforcement, path matching, breadcrumbs.
- `src/lib/suggestion-queue.test.ts` — open/ignored/done, restore legality, dedup by
  fingerprint, urgency ranking, weekly cap of 7.
- `src/lib/command-center.test.ts` — every tile's present / absent / insufficient case;
  explicit assertions that no tile ever yields a fabricated number; GA4 rolling-window
  delta refusal; top-3 selection and ordering.
- `src/components/os/app-shell.test.tsx` — rail renders home plus 6 categories plus settings and
  no more; active state; breadcrumb text.

Gates: full `npm test` green, `npx tsc --noEmit` clean, `npm run lint` clean.

## Out of scope for this phase

The category page template and its queue UI (phase 2), Ask Marky (last), deleting old route
files, any new rule or executor kind.
