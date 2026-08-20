# Phase 2 — Getting found on Google (implementation plan)

Spec: `docs/superpowers/specs/2026-08-20-category-page-redesign-design.md`.
Board: `design/Main.dc.html` — the category-page template, rendered as this category.
Spec build order, phase 2: *"full template on GSC data; queue backed by existing findings +
Draft-the-fix; proves the card to change-request handoff."*

This phase builds the template every later category page reuses, and proves the handoff end to
end: a rule finding becomes a card, the card becomes a change request, the change request goes
through the existing governed flow.

## Three things reconnaissance changed

1. **Rule evidence is one day, not 28.** Every rule runs over a single finalized Pacific date's
   snapshot (`period_start_pt === period_end_pt`), except `position_loss` and `visibility_gain`,
   which compare that date with the one 7 days earlier. Only `buildPeriodComparison` carries
   28-day numbers. The board's card reads "118 times shown, 2 clicks in 28 days" — writing that
   from finding evidence would be a fabricated window. Evidence lines name the date the rule
   actually saw.
2. **`proposeFixFromFinding` cannot regenerate.** Its `idempotencyKey` input is accepted and then
   ignored; the real key is `finding:${recommendationId}`, so a second call returns the existing
   change request with `changed: false`. Regenerate is `regenerateTitleH1Proposal`, which only
   accepts `proposal_type === "title_h1"` in state `proposed`. There is no `page_metadata`
   equivalent, and `weak_ctr_page` findings produce exactly that. So Regenerate is offered only
   where it can actually work, the same way phase 1 handles Restore and Ignore.
3. **Two bugs phase 1 shipped**, both found by this reconnaissance and fixed here:
   - `categoryForProposalType` never returns `"search"`, so a change request drafted from a
     search finding is counted under Your pages. It must follow `recommendation_id` to the
     recommendation's `source_module`.
   - `/approvals` and `/changes/$id` invalidate `["command-center"]`, but the shell's key is
     `["command-center-facts"]`. Approving anywhere leaves the nav badges stale.

## Deliverables

### A. The reusable template

`src/lib/category-page.ts` (pure, tested) — the shape every category page renders:
header (title, purpose, status line), tab strip with counts, metric tiles, queue, detail lists.
`src/components/os/category-page.tsx` — the renderer, in the phase-1 visual language
(flat `bg-card` on `border-border`, caps labels in `text-subtle`), not the older GlassCard one.

Sub-views are URL state, not component state, so a card can be linked to. This establishes the
pattern: `validateSearch` returning a required `view` with a default, per `auth.tsx`'s idiom.

### B. The queue card

Expanded, per the board: icon + claim in plain words, evidence line from real data, the
Now → After-approving pair, three fixed explainer lines (What this is / Why it matters / What
approving does), and the verb footer in fixed order — **Approve · Regenerate · Ignore · ···**.
Collapsed rows for the rest, receipt rows for handled ones, and the `j / k / Enter / i` hint.

The Now → After pair comes from `change_requests.changes`, parsed by the existing
`actionCenterFieldChanges`, which drops malformed rows rather than rendering `undefined`.

### C. Plain-words findings — `src/lib/finding-copy.ts` (pure, tested)

One function per rule turning stored `search_console_observations.evidence` into a claim and an
evidence line. Every number comes from the evidence JSON; every line names the date the rule saw.
Rules covered: `striking_distance_query`, `position_loss`, `weak_ctr_page`, `visibility_gain`,
`possible_query_overlap`, `zero_impression_page`, `query_coverage_gap`, `index_coverage_drift`
(whose three sub-cases are distinguished by evidence, since the rule id does not).

A rule whose evidence is missing or malformed produces a claim with **no** evidence line, never
an invented one.

### D. The read — `src/lib/getting-found.functions.ts`

`getGettingFoundFacts`, tenant-scoped, `assertRead` guarded. Widens what
`getSearchFindings` reads so the evidence is actually available (it is stored today and never
read). Pulls dimensional rows only for the latest `period_end_pt` rather than every stored date.

### E. Tiles — from `PeriodComparison`, the one real 28-day source

| Board tile | Source | Absence |
|---|---|---|
| People who clicked | `comparison.current.clicks`, delta `change.clicksPercent` | "Only N of 56 required calendar days are stored" |
| Times you showed up | `current.impressions`, delta `change.impressionsPercent` | as above |
| Seeing to clicking | `current.ctr` (a fraction, rendered as a percent) , delta `change.ctrPoints` — already in points, never multiplied twice | as above |
| Average spot | `current.position`, delta `change.position` — **lower is better**, so the delta's good direction is down | as above |

### F. The route switch

Create `src/routes/getting-found-on-google.tsx` **first**, regenerate the route tree, and only
then change `categories.ts` `to: "/search"` to `to: "/getting-found-on-google"`. The
nav-contract test asserts every nav destination exists in the route tree, so the reverse order
fails the build. `/search` stays on disk, unlinked.

### G. In-category views in the nav panel

The panel has no sub-view region today; the board shows one. Adds `views` to `Category` and
renders them above "Other categories".

## Test plan (TDD, tests first)

- `src/lib/finding-copy.test.ts` — every rule's claim and evidence line, including missing and
  malformed evidence, and an assertion that no line claims a 28-day window.
- `src/lib/category-page.test.ts` — tab counts, status line, tile absence, queue tab routing.
- `src/lib/getting-found.test.ts` — every tile present / absent / insufficient; the CTR fraction
  and the ctrPoints double-multiply trap; position's inverted direction.
- `src/lib/suggestion-queue.test.ts` — Regenerate legality by proposal type and state.
- `src/lib/nav-contract.test.ts` — the new route exists and the category points at it.
- Existing `categories.test.ts` breadcrumb expectations move from `/search` to the new route.

Gates: full `npm test` green, `npx tsc --noEmit` clean, every touched file lint clean, then the
same adversarial multi-agent review as phase 1.

## Out of scope

The remaining category pages, Ask Marky, deleting `/search`, any new rule or executor kind, and
a `page_metadata` regenerate lane (noted as a real gap; Regenerate is simply not offered there).
