# Measurement Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the work order in `docs/handoffs/2026-08-20-rule-thresholds-audit.md`: make every verdict grade the change rather than the level, assign every rule to a volume-honest bucket, and make every constant cite a source or admit it is a guess.

**Architecture:** Pure view-model/rule modules stay pure and exhaustively tested (the `command-center.ts` pattern); server functions only plumb stored rows into them. New statistics live in one new pure module (`cohort-verdict.ts`). No new providers, no metered calls, no threshold lowered to make a rule fire.

**Tech Stack:** TypeScript, Vitest (`<module>.test.ts` beside the module, fixture factory taking `Partial<T>`), TanStack Start server functions, Supabase reads via `assertRead`.

**Spec:** `docs/handoffs/2026-08-20-rule-thresholds-audit.md` (work order) + `.claude/skills/seo-measurement/SKILL.md` (method) + `docs/superpowers/research/2026-08-20-low-volume-measurement-research.md` and `2026-08-20-small-site-growth-research.md` (citations — quote URLs from these digests, do not re-research).

## Global Constraints

- **Never lower a threshold to make a rule fire.** Rules become pooled or become honest refusals; numbers move only with a citation.
- Every constant touched ends up with: a citation comment, or a `Stated assumption:` comment naming what would settle it, or deleted.
- No demo data; absence is stated, never rendered as zero. A missing GSC row is **unknown**, not zero (top-rows storage, answer/96568).
- The 14-day window must never report `failure` (recrawl alone is "a few days to a few weeks").
- Copy style: plain words, no rule ids on screen, numbers always from stored rows (the `finding-copy.ts` module-header rules).
- Surgical: match file style; do not reformat untouched code. Repo-wide lint is known-failing; keep each touched file clean individually (`npx prettier --check <file>`, `npx eslint <file>`).
- Run tests as `npx vitest run <file>`; full gate at the end: `npx vitest run && npx tsc --noEmit`.

---

### Task 1: Correct the skill's sourcing (docs only)

**Files:**
- Modify: `.claude/skills/seo-measurement/SKILL.md`

**Interfaces:** none (prose).

- [ ] **Step 1: Fix the anonymized-queries attribution.** In the "Query data is anonymized away" paragraph, keep the quote and change the citation to name both sources: the verbatim definition lives in the 2022 deep-dive post `https://developers.google.com/search/blog/2022/10/performance-data-deep-dive`; `https://support.google.com/webmasters/answer/96568` now carries only softer wording. Add the second top-rows sentence: *"As a result, not all queries beyond anonymized queries will be shown."*
- [ ] **Step 2: Replace the 40-visits claim.** The sentence "published guidance is that a page at forty organic visits a month cannot reach significance in a four week test" traces to an uncited agency blog (class 4 by this skill's own hierarchy). Replace with the derivable statement, citing `docs/superpowers/research/2026-08-20-low-volume-measurement-research.md` §2: at a 28-day baseline of 10 events, the exact two-sample Poisson test (Przyborowski & Wilenski 1940; Krishnamoorthy & Thomson 2004) needs an observed ≥2.3× jump for p<0.05 and a true ~2.7× effect for 80% power; pooled to ~120 events, an observed +29% clears significance. Per-page verdicts at this volume are fabrication for a citable reason.
- [ ] **Step 3: Add the per-dimension completeness fact.** Under the anonymized-queries paragraph: non-query/non-URL dimensions are exported in full ("For requests that don't involve query or URL dimensions… Search Console will display and export all the data", deep-dive post) — one more reason page-dimension beats query-dimension here.
- [ ] **Step 4: Commit** `docs(skill): correct source attributions in seo-measurement`.

---

### Task 2: `not_yet` verdict — the 14-day window never fails

**Files:**
- Modify: `src/lib/outcome-verdict.ts`
- Modify: `src/lib/site-health.ts` (verdict ordering), `src/components/os/site-health-page.tsx` (`VERDICT_LABEL`)
- Test: `src/lib/outcome-verdict.test.ts`, `src/lib/site-health.test.ts`

**Interfaces:**
- Produces: `OutcomeVerdict = "success" | "neutral" | "failure" | "not_yet" | "too_early" | "unmeasurable"`. Later tasks rely on `"not_yet"` existing and on the 14d branch never returning `"failure"`.

- [ ] **Step 1: Write the failing tests** in `outcome-verdict.test.ts` (existing `reading()` factory):

```ts
describe("two weeks is inside Google's own reprocessing time", () => {
  // "Crawling can take anywhere from a few days to a few weeks."
  // https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
  it("reports not yet, never failure, when a 14 day window has no impressions", () => {
    const graded = outcomeVerdict(reading({ windowDays: 14, daysSinceLive: 14, impressions: 0 }));
    expect(graded.verdict).toBe("not_yet");
    expect(graded.reason).toContain("weeks");
  });
  it("still reports success when the page has appeared", () => {
    expect(outcomeVerdict(reading({ windowDays: 14, daysSinceLive: 14, impressions: 3 })).verdict).toBe("success");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/outcome-verdict.test.ts` — expect FAIL (verdict is `"failure"`, `"not_yet"` not in union).
- [ ] **Step 3: Implement.** Add `"not_yet"` to `OutcomeVerdict`. Replace the 14d `failure` branch (currently L113-117) with:

```ts
: {
    verdict: "not_yet",
    reason:
      "Google has not shown this page yet. Google's own timeline says recrawling alone can take a few days to a few weeks, so two quiet weeks is normal, not a failure. Keep waiting.",
  };
```

Update the module comment for the 14d branch: it asks "has Google seen it yet", and the honest negative answer at 14 days is *not yet* (cite the recrawl doc URL in the comment).
- [ ] **Step 4: Rank and label the new verdict.** `site-health.ts` `VERDICT_ORDER`: insert `not_yet: 2` (after `neutral`, before `too_early` — renumber the rest). `tilesFor` already excludes non-verdicts by listing them: add `outcome.verdict !== "not_yet"` to the `judged` filter, so a not-yet is never counted as graded. `site-health-page.tsx` `VERDICT_LABEL`: add `not_yet: "Not yet"`.
- [ ] **Step 5: Run** `npx vitest run src/lib/outcome-verdict.test.ts src/lib/site-health.test.ts` and the component test `npx vitest run src/components/os/site-health-page.test.tsx`. Fix any exhaustiveness breaks the union change surfaces (`tsc` will name them: `npx tsc --noEmit`).
- [ ] **Step 6: Commit** `fix(measurement): a quiet 14 day window is not yet, never failure`.

---

### Task 3: Grade the change, not the level

The stored approval baseline (window_days 0, `anchor_kind 'approval_baseline'`, the 28 days ending the day before approval) has never been read. This task reads it, and grades 28/56/90-day windows as change-vs-baseline with `confidence.ts`, controlled by the site's own movement.

**Files:**
- Modify: `src/lib/outcome-verdict.ts`, `src/lib/site-health.ts`, `src/lib/site-health.functions.ts`, `src/components/os/site-health-page.tsx` (render the new reason strings — no structural change)
- Test: `src/lib/outcome-verdict.test.ts`, `src/lib/site-health.test.ts`

**Interfaces:**
- Produces on `OutcomeReading`:

```ts
/** The 28 days ending the day before approval, from the stored window-0 GSC observation. Null when never stored — stated, not defaulted. */
readonly baseline: { readonly impressions: number; readonly clicks: number } | null;
/** Site-wide impressions over the same before/after pair, from property_totals daily snapshots. Null when fewer days are stored than the pair needs. */
readonly siteTrend: { readonly beforeImpressions: number; readonly afterImpressions: number } | null;
```

- Consumes: `confidenceInCountChange(before, after)` from `./confidence` (returns `{ value, band, reason }`).
- `StoredOutcome` in `site-health.ts` gains the same two fields; `site-health.functions.ts` populates them.

- [ ] **Step 1: Write the failing tests** (extend `reading()` factory defaults with `baseline: null, siteTrend: null`):

```ts
describe("the verdict grades the change, not the level", () => {
  it("holding steady is neutral, not success", () => {
    const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
      impressions: 400, clicks: 40, baseline: { impressions: 400, clicks: 40 }, siteTrend: null }));
    expect(graded.verdict).toBe("neutral");
  });
  it("a fall that clears the noise floor is a failure even with clicks remaining", () => {
    const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
      impressions: 60, clicks: 6, baseline: { impressions: 400, clicks: 50 }, siteTrend: null }));
    expect(graded.verdict).toBe("failure");
  });
  it("a rise inside the noise is neutral and says so", () => {
    const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
      impressions: 13, clicks: 1, baseline: { impressions: 10, clicks: 1 }, siteTrend: null }));
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/noise|ordinary|too little/i);
  });
  it("a rise the whole site shares is the tide, not the treatment", () => {
    const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
      impressions: 200, clicks: 10, baseline: { impressions: 100, clicks: 5 },
      siteTrend: { beforeImpressions: 300, afterImpressions: 620 } }));
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/site/i);
  });
  it("with no stored baseline it says so instead of grading the level", () => {
    const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
      impressions: 150, clicks: 8, baseline: null, siteTrend: null }));
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/baseline|before/i);
  });
  it("shown much more but still unclicked stays neutral (AIO rule survives)", () => {
    const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
      impressions: 160, clicks: 0, baseline: { impressions: 40, clicks: 0 }, siteTrend: null }));
    expect(graded.verdict).not.toBe("failure");
  });
});
```

- [ ] **Step 2: Run to verify failure** (type errors on the new fields count as the failing state).
- [ ] **Step 3: Implement in `outcome-verdict.ts`.** Add the two fields to `OutcomeReading`. Replace the 28/56/90 level checks with change grading:

```ts
import { confidenceInCountChange, MIN_BASELINE } from "./confidence";

function siteRatio(trend: OutcomeReading["siteTrend"]): number | null {
  if (trend === null || trend.beforeImpressions < MIN_BASELINE) return null;
  return trend.afterImpressions / trend.beforeImpressions;
}
```

For windows 28, 56, 90 (56/90 compare against the baseline scaled by `windowDays / 28` — state the scaling in the reason):

1. `baseline === null` → `neutral`, reason: "No before picture was stored for this change, so there is nothing honest to compare against. The level alone cannot say whether the fix did anything."
2. Compute `confidence = confidenceInCountChange(scaledBaselineImpressions, reading.impressions)`. If `confidence.band === "low"` → `neutral`, reason = confidence.reason (it already names the counts).
3. If the change is a **fall** with `band !== "low"` → `failure`, reason naming before/after and `confidence.reason` — unless clicks also held (`reading.clicks >= baseline.clicks` scaled) in which case `neutral` (visibility fell, traffic did not).
4. If the change is a **rise** with `band !== "low"`: compute `const tide = siteRatio(reading.siteTrend)`. If `tide !== null && reading.impressions / scaledBaseline <= tide` → `neutral`, reason: "…rose ×A, but the whole site rose ×B over the same weeks, so this is the tide, not the treatment." Else → `success`, reason naming both numbers (and "site held flat" when tide ≈ 1, or "no site trend stored to compare" when `tide === null` — the success is then qualified in words).
5. Zero-click protections stay: a rise in impressions with zero clicks is never `failure` (keep the AIO module comment and its research citation).

Delete `REAL_EXPOSURE`, `EARNED_CLICKS`, `SUSTAINED_IMPRESSIONS` — the change grading replaces every use. (Definition of done: "every constant… carries a citation, or is labelled, or is gone" — these are gone.)
- [ ] **Step 4: Plumb the baseline in `site-health.functions.ts`.** The windows query already fetches all windows including 0, and `newestByWindow` already holds the window-0 GSC observation. Build `baselineByCycle`:

```ts
const baselineByCycle = new Map<string, { impressions: number; clicks: number }>();
for (const window of windows) {
  if (window.window_days !== 0) continue;
  const observation = newestByWindow.get(window.id);
  if (!observation || readingStatusOf(observation.status) !== "complete") continue;
  const payload = (observation.payload ?? {}) as { totals?: Record<string, unknown> };
  baselineByCycle.set(window.cycle_id, {
    impressions: numberOrZero(totals(payload)?.["impressions"]),
    clicks: numberOrZero(totals(payload)?.["clicks"]),
  });
}
```

In the `outcomes` flatMap, skip emitting window-0 rows as outcomes is **not** the current behaviour (they flow through and are labelled by `ungradedReason`) — keep that, but attach `baseline: window.window_days === 0 ? null : (baselineByCycle.get(window.cycle_id) ?? null)`.
- [ ] **Step 5: Plumb the site trend.** In the same server function, read daily site totals (kind `property_totals`) from `search_console_snapshots` for the tenant, and for each outcome compute the site's summed impressions over the outcome's after-window (`window_days` days ending `period_end_pt`) and its baseline window (28 days ending the day before approval — derivable as the window-0 row's `period_start_pt`/`period_end_pt`; select those two columns on the windows query). Sum in TypeScript with a small pure helper in `site-health.ts`:

```ts
/** Sum of daily site impressions inside [start, end], or null when any day is missing. */
export function sumSiteWindow(days: ReadonlyArray<{ date: string; impressions: number }>, start: string, end: string): { impressions: number } | null
```

with tests (missing day → null, inclusive bounds). `siteTrend` is null whenever either window cannot be fully covered — absence stated via the verdict's step-4 wording.
- [ ] **Step 6: Extend `StoredOutcome`** with the two fields, pass them through `gradeOutcomes` into `outcomeVerdict`, and update `site-health.test.ts` fixtures (add `baseline: null, siteTrend: null` to the factory).
- [ ] **Step 7: Run** `npx vitest run src/lib/outcome-verdict.test.ts src/lib/site-health.test.ts src/components/os/site-health-page.test.tsx && npx tsc --noEmit`.
- [ ] **Step 8: Commit** `feat(measurement): grade the change against the stored baseline and the site's own tide`.

---

### Task 4: Wording treatments are unmeasured when Google may be rewriting them

**Files:**
- Modify: `src/lib/outcome-verdict.ts`, `src/lib/site-health.ts`, `src/lib/site-health.functions.ts`
- Test: `src/lib/outcome-verdict.test.ts`

**Interfaces:**
- Produces on `OutcomeReading`: `readonly wordingTreatment: boolean;` — true when the change altered only what Google *displays* (title/meta description), so the treatment cannot be assumed delivered.

- [ ] **Step 1: Establish which `proposal_type` values are wording.** Read the allowed values in `supabase/migrations/20260819213000_widen_proposal_type_check.sql` and `src/lib/proposal-type-migration.test.ts`; list the title/meta-description types in a `const WORDING_PROPOSAL_TYPES: ReadonlySet<string>` in `site-health.ts` with a comment naming the migration as the source of the enumeration. Do not guess values — copy them from the check constraint.
- [ ] **Step 2: Write the failing test:**

```ts
it("a wording change that would grade failure is reported unmeasured instead", () => {
  const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
    impressions: 60, clicks: 2, baseline: { impressions: 400, clicks: 20 },
    siteTrend: null, wordingTreatment: true }));
  // "We can't manually change title links for individual sites" — Google may be
  // showing its own wording; the treatment was never verified as displayed.
  // https://developers.google.com/search/docs/appearance/title-link
  expect(graded.verdict).toBe("unmeasurable");
  expect(graded.reason).toMatch(/Google|display|title/i);
});
it("a wording change can still succeed", () => {
  const graded = outcomeVerdict(reading({ windowDays: 28, daysSinceLive: 28,
    impressions: 300, clicks: 20, baseline: { impressions: 100, clicks: 5 },
    siteTrend: null, wordingTreatment: true }));
  expect(graded.verdict).toBe("success");
});
```

- [ ] **Step 3: Implement.** In the failure branch only: when `reading.wordingTreatment`, return `unmeasurable` with reason: "The numbers fell, but this change only altered wording, and Google may be showing its own wording instead — it rewrites titles it doesn't like and no one can force the one on the page. Until what Google displays is verified, this is an unmeasured treatment, not a failed one." First WebFetch `https://developers.google.com/search/docs/appearance/title-link` and re-verify the two quotes (the research digest flagged them unverified this pass); cite the URL in the code comment.
- [ ] **Step 4: Plumb.** `site-health.functions.ts`: add `proposal_type` to the `change_requests` select; `wordingTreatment: WORDING_PROPOSAL_TYPES.has(proposalTypeById.get(cycle.change_request_id) ?? "")`. Extend `StoredOutcome` and the `gradeOutcomes` pass-through. Update fixtures (`wordingTreatment: false` default).
- [ ] **Step 5: Run** the three test files + `tsc`. **Commit** `feat(measurement): a rewritten title is an unmeasured treatment, not a failed one`.

---

### Task 5: `cohort-verdict.ts` — judge twelve changes together

**Files:**
- Create: `src/lib/cohort-verdict.ts`
- Test: `src/lib/cohort-verdict.test.ts`
- Modify: `src/lib/site-health.ts` (one cohort line in the view model), `src/components/os/site-health-page.tsx` (render it), `src/lib/site-health.test.ts`

**Interfaces:**
- Produces:

```ts
export type CohortMember = { readonly before: number; readonly after: number };
export type CohortVerdict = {
  readonly direction: "rise" | "fall" | "flat";
  /** Two-sided p from the exact conditional test on pooled counts. */
  readonly p: number;
  /** True when the pooled result also survives the sign test at p<0.05. */
  readonly unanimousEnough: boolean;
  readonly reason: string;
};
export function cohortVerdict(members: readonly CohortMember[]): CohortVerdict | null; // null when pooled before-count < MIN_BASELINE
```

- [ ] **Step 1: Write the failing tests:**

```ts
// Exact conditional test (Przyborowski & Wilenski 1940; Krishnamoorthy & Thomson 2004,
// https://userweb.ucs.louisiana.edu/~kxk4695/JSPI-04.pdf): under the null, the after-count
// is Binomial(before+after, 1/2). Figures from
// docs/superpowers/research/2026-08-20-low-volume-measurement-research.md §2-3.
describe("the pooled exact test", () => {
  it("finds 120 to 155 significant and says so", () => {
    const verdict = cohortVerdict([{ before: 120, after: 155 }]);
    expect(verdict?.direction).toBe("rise");
    expect(verdict!.p).toBeLessThan(0.05);
  });
  it("finds 120 to 152 not significant", () => {
    expect(cohortVerdict([{ before: 120, after: 152 }])!.p).toBeGreaterThan(0.05);
  });
  it("refuses below the confidence module's own baseline floor", () => {
    expect(cohortVerdict([{ before: 4, after: 9 }])).toBeNull();
  });
});
describe("the sign test guards against one page doing all the work", () => {
  it("10 of 12 pages moving the same way is unanimous enough, 9 is not", () => {
    const up = { before: 10, after: 14 }, down = { before: 10, after: 7 };
    expect(cohortVerdict([...Array(10).fill(up), ...Array(2).fill(down)])!.unanimousEnough).toBe(true);
    expect(cohortVerdict([...Array(9).fill(up), ...Array(3).fill(down)])!.unanimousEnough).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** (module absent).
- [ ] **Step 3: Implement.** Pool `before = Σ member.before`, `after = Σ member.after`; return null when `before + after === 0` or `before < MIN_BASELINE` (import from `./confidence`). Exact two-sided binomial p at p₀ = ½ via log-space PMF (sum of tail probabilities ≤ observed PMF — the standard two-sided exact test):

```ts
function logChoose(n: number, k: number): number {
  // Exact log-binomial by summing logs; n stays in the low thousands here, so
  // a loop is both exact and fast enough. No approximation, per the skill.
  let sum = 0;
  for (let i = 1; i <= k; i += 1) sum += Math.log(n - k + i) - Math.log(i);
  return sum;
}
function binomialPmf(n: number, k: number): number { return Math.exp(logChoose(n, k) + n * Math.log(0.5)); }
export function exactBinomialTwoSidedP(n: number, k: number): number {
  const observed = binomialPmf(n, k);
  let p = 0;
  for (let i = 0; i <= n; i += 1) if (binomialPmf(n, i) <= observed + 1e-12) p += binomialPmf(n, i);
  return Math.min(1, p);
}
```

Sign test: count members with `after > before` vs `after < before` (ties dropped); `unanimousEnough = exactBinomialTwoSidedP(nonTied, max(ups, downs)) < 0.05`. `reason` names the pooled counts, the member count, and both test outcomes in plain words. Cite both papers and the digest in the module header; note the one-page-domination weakness the sign test exists to catch.
- [ ] **Step 4: Wire into Site health.** In `buildSiteHealth`: collect graded 28-day outcomes with `verdict !== null`, `baseline !== null`, `readingStatus === "complete"`; when ≥ 3, add to the view model `readonly cohortNote: string | null` built from `cohortVerdict(members)` (members: `{before: baseline.impressions, after: impressions}`), e.g. "Your last 9 measured changes, judged together: impressions rose from 96 to 141, which clears the noise (p 0.02) and is not one page's doing." Render as one line above the outcomes list in `site-health-page.tsx` (same styling as `ungradedNote`). Null when fewer than 3 members or `cohortVerdict` refuses.
- [ ] **Step 5: Run** the four test files + `tsc`. **Commit** `feat(measurement): judge changes as a cohort with an exact pooled test`.

---

### Task 6: Three-bucket assignment, derived confidences, and query-dimension disclosure

**Files:**
- Modify: `src/lib/seo-validation.server.ts`, `src/lib/search-console-rules.server.ts`, `src/lib/search-console-rule-checks.ts`, `src/lib/ga4-rule-checks.ts`
- Test: `src/lib/search-console-rule-checks.test.ts`, `src/lib/ga4-rule-checks.test.ts` (new assertions), plus a new `src/lib/rule-buckets.test.ts` if the assignment table is exported (see Step 1)

**Interfaces:**
- Produces in `search-console-rule-checks.ts` (pure, importable by UI tasks):

```ts
export type RuleBucket = "fact" | "pooled" | "beyond_current_volume";
export type RuleAssignment = { readonly rule: string; readonly bucket: RuleBucket;
  readonly needsPerTarget: number | null; readonly why: string };
export const RULE_ASSIGNMENTS: readonly RuleAssignment[];
```

- [ ] **Step 1: Write the assignment table** covering all 13 handoff rules plus `index_coverage_drift`, `zero_impression_page` and the three GA4 rules. Buckets, with the reasoning string carrying the citation:
  - `fact`: `zero_impression_page`, `index_coverage_drift` (URL-Inspection states, sitemap/robots — no threshold needed; "Google doesn't guarantee that all pages everywhere will make it into the Google index", answer/7440203).
  - `pooled`: `zeroClickPage`, `highImpressionLowCtr`, `weakCtr`, `decliningTraffic`, `decliningImpressions`, `significantChange`, `visibilityGain` — anything click/impression-shaped; per-page they need 5–20× this property's volume, pooled they answer at site level (digest §2 table).
  - `beyond_current_volume`: `strikingDistance`, `decliningPosition`, `positionLoss`, `queryOverlap`, `coverageGap`, `researchTraction` — query-dimension rules; at this volume the query table is mostly anonymized away, and no pooling recovers censored rows. `needsPerTarget` = the existing threshold (so the UI can say what volume would change the answer); the threshold itself is NOT changed.
  - GA4: `trafficShift`/`zeroEngagement` pooled, `disappearedEvent` fact (an event that stopped arriving is a wiring question, not a statistics question).
  Export `RULE_ASSIGNMENTS`; test: every rule id in the three families appears exactly once (import the rule unions and assert coverage — this is the "every rule is assigned, with the reasoning written down" line of the definition of done, made executable).
- [ ] **Step 2: Pooled site-level rules that can actually fire.** In `search-console-rules.server.ts` `evaluate()`, add two observations computed from the stored 28-day window **totals** (`dimensional_rows_window` snapshot `totals` field — already stored) and gated by `confidence.ts`:
  - `site_visibility_shift`: `confidenceInCountChange(priorTotals.impressions, currentTotals.impressions)`; emit only when `band !== "low"`, direction in the title ("Your whole site is being shown more/less than last month"), confidence = the derived value, evidence carries both totals and `confidenceReason`.
  - `site_clicks_shift`: same on clicks.
  These are the pooled replacements the handoff asks for: twelve pages judged together. Add rule ids to the `Rule` union and to `finding-router.ts` `CATEGORY_BY_RULE` (category `"search"`), and to `finding-copy.ts` writers (claim/evidence in the house style). Test in `search-console-rules` path: totals 120→155 fires with medium+ confidence; 120→130 does not fire; missing prior window emits nothing (absence, not zero).
- [ ] **Step 3: Replace bare confidences.** In `search-console-rules.server.ts` (0.7/0.65/0.6), `search-console-rule-checks.ts` (0.6/0.5/0.55/0.8/0.7), `ga4-rule-checks.ts` (0.6/0.7/0.5): where a count exists, derive via `confidenceInCount`/`confidenceInCountChange`; where none does (e.g. `index_coverage_drift` — a fact), set 0.9 with a comment `Stated: facts read from URL Inspection carry no sampling noise; capped below 1 because the inspection itself can be stale.` Every remaining literal gets a `Stated assumption:` comment naming what would settle it. No threshold value changes.
- [ ] **Step 4: Query-dimension disclosure.** Every rule reading the query dimension (`strikingDistance`, `positionLoss` in family B; `decliningPosition`, `queryOverlap` in family A; `coverageGap` in family C) appends to its `description`: `"Caveat: at this site's volume Google hides most queries for privacy (only queries from more than a few dozen users are stored), so this reads a censored sample."` — one shared exported const `QUERY_DIMENSION_CAVEAT` in `search-console-rule-checks.ts` with the deep-dive URL in a comment. Test: emitted findings' descriptions contain the caveat.
- [ ] **Step 5: Family A reads windows, not single days.** `seo-validation.server.ts` `pick()` (L126-130) selects by dimension only, so its "periods" are two adjacent single days — the 28-day fix never reached this family. Change `pick()` to require `kind === "dimensional_rows_window"` (import `RULE_WINDOW_KIND`), falling back to legacy daily rows **only** when no window snapshot exists, with the fallback named in each finding's evidence (`windowDays: 1`). Update its tests' fixtures to window snapshots. This widens evidence ×28 without touching one threshold.
- [ ] **Step 6: Bucket comments in each family file.** Top-of-file comment block in each of the three families pointing at `RULE_ASSIGNMENTS` and the handoff. Run all family tests + `tsc`. **Commit** `feat(rules): every rule assigned to fact, pooled, or beyond current volume — and the pooled ones fire`.

---

### Task 7: Say on screen what the volume can and cannot answer

**Files:**
- Modify: `src/lib/getting-found.ts`, `src/lib/getting-found.functions.ts`, `src/components/os/getting-found-page.tsx`
- Test: `src/lib/getting-found.test.ts`, `src/components/os/getting-found-page.test.tsx`

**Interfaces:**
- Consumes: `RULE_ASSIGNMENTS` from `search-console-rule-checks.ts` (Task 6), the stored 28-day property totals already feeding the page's tiles.
- Produces on the getting-found view model: `readonly answerability: { readonly line: string; readonly beyond: readonly string[] } | null`.

- [ ] **Step 1: Write the failing test** in `getting-found.test.ts`: with 28-day site impressions of 500 across 48 pages, the view model carries an `answerability` note whose `line` names the observed volume and whose `beyond` lists plain-words names of the `beyond_current_volume` rules with the volume each would need ("Position-slip warnings need about 50 appearances on a single search term; your busiest page earns about 10 a month"). With totals missing, `answerability` is null (absence stated by the existing tile missingReason — no second message).
- [ ] **Step 2: Implement** a pure helper in `getting-found.ts`:

```ts
export function describeAnswerability(siteImpressions28d: number, pageCount: number,
  assignments: readonly RuleAssignment[]): { line: string; beyond: string[] } 
```

`line`: "Your site earned ~N appearances over the last four weeks across P pages — enough for the site-wide checks and the yes/no facts, not enough for per-page click judgements. That is a statement about traffic, not about the site's quality." `beyond`: one entry per `beyond_current_volume` assignment using `needsPerTarget` vs `round(siteImpressions28d / pageCount)`. Plain words only — never rule ids.
- [ ] **Step 3: Render** in `getting-found-page.tsx` as a collapsed-by-default section titled "What your traffic can answer" (follow the page's existing note/section primitives; dot+caps intent styling, no new colors). Component test: section renders the line; each `beyond` entry visible when expanded.
- [ ] **Step 4:** The growth hand-off line. Append to `line` (from the growth digest, cited in a comment): "More pages earning appearances is what changes this: Google finds pages mainly through links from pages it already crawled — internal links first, the sitemap second, one recrawl request third, then weeks of patience." This is the operator's requirement that "not measurable yet" never reads as a dead end — the sentence names the lever instead of the lack.
- [ ] **Step 5: Run** both test files + `tsc`. **Commit** `feat(getting-found): the page says what this volume can answer, and what changes it`.

---

### Task 8: `page-checks.ts` / `site-checks.ts` — every check's stated reason is true

**Files:**
- Modify: `src/lib/page-checks.ts`, `src/lib/site-checks.ts`
- Test: `src/lib/page-checks.test.ts`, `src/lib/site-checks.test.ts`

**Interfaces:** none new — `CheckDefinition.label/instruction` copy and comments only, except one severity change (below).

- [ ] **Step 1: Re-verify quotes to be cited.** WebFetch the SEO starter guide (word count, headings), `https://developers.google.com/search/docs/appearance/title-link` (rewriting triggers), `https://developers.google.com/search/docs/appearance/snippet` (description sourcing), and Google's canonicalization and structured-data docs. Use only sentences read this pass; anything unfetchable is cited as "not re-verified" in the comment.
- [ ] **Step 2: Failing copy tests** in `page-checks.test.ts`:

```ts
it("thin_content asks for substance without claiming a word-count ranking rule", () => {
  const check = CHECKS.thin_content;
  // "The length of the content alone doesn't matter for ranking purposes
  //  (there's no magical word count target)" — SEO starter guide.
  expect(check.instruction(3).toLowerCase()).not.toMatch(/rank/);
  expect(check.instruction(3)).toMatch(/understand|about|say/i);
});
it("description checks say they are about the snippet, not the ranking", () => {
  expect(CHECKS.description_too_long.instruction(2)).toMatch(/results|snippet/i);
});
```

- [ ] **Step 3: Rewrite the three contradicted/underspecified reasons.**
  - `thin_content` (severity `warning` → `advice` — its only defensible reason is comprehension, not ranking; the handoff allows keeping the check with a true reason): label "Almost nothing on the page"; instruction: ``(n) => `Give ${n} nearly empty pages something to say — a page with almost no text gives Google nothing to understand.` `` Comment above: the starter-guide no-word-count quote + `THIN_CONTENT_WORDS = 250` marked `Stated assumption: 250 words is a proxy for "nearly empty"; nothing derives it — what would settle it is Google publishing any floor, which it says it will not.`
  - `description_too_long`/`description_too_short`: instructions gain "so the snippet under your link reads well" / comment: meta descriptions affect appearance and click-through, not ranking (snippet doc URL); the 70/160 constants marked `Stated assumption: display truncation is by pixels and unpublished; these character counts are folklore medians, kept only as a proxy.`
  - `h1_multiple`: comment citing the title-link doc's rewrite triggers — competing prominent headings invite Google to rewrite the title link; the instruction already says the true thing.
- [ ] **Step 4: Citation comments for the rest.** One-line comment per check in `CHECKS` and per site check in `evaluateSite`, either the doc URL that supports it (noindex/robots/sitemap/canonical/structured-data/viewport are all directly documented) or `Stated assumption:`. `TITLE_MAX/TITLE_MIN` get the same truncation-proxy label as the description constants. Do not alter any other copy or behaviour.
- [ ] **Step 5: Run** both test files (update any test asserting the old copy verbatim) + `tsc`. **Commit** `docs(checks): every check states the reason Google's documentation supports`.

---

### Task 9: Verification, adversarial review, PR

- [ ] **Step 1: Full gate.** `npx vitest run && npx tsc --noEmit`; `npx prettier --check` and `npx eslint` on every touched file. Fix to green.
- [ ] **Step 2: Definition-of-done audit** against `docs/handoffs/2026-08-20-rule-thresholds-audit.md` — walk its six bullets; each must point at a commit in this branch. The handoff's "What not to do" list is the reviewer's checklist: no evidence deleted, no new provider, no threshold lowered.
- [ ] **Step 3: Adversarial review.** Run the `code-review` skill at high effort on the branch diff; fix confirmed findings.
- [ ] **Step 4: PR.** Push `fix/measurement-honesty`; open a draft PR titled "Grade the change, pool the evidence, and say what the volume can answer", body summarising the three buckets and linking handoff + both research digests.
