/**
 * Judging many small changes together.
 *
 * At this property's volume — around 10 impressions per page per month — a
 * single page almost never gathers enough events to clear the noise floor in
 * `confidence.ts`. Twelve approved changes pooled together can, because the
 * exact test below runs on the summed before/after counts rather than on any
 * one page's counts alone.
 *
 * The test is the exact conditional binomial test for two Poisson rates
 * (Przyborowski & Wilenski 1940; the two-sided form and its small-sample
 * behaviour are laid out in Krishnamoorthy & Thomson 2004,
 * https://userweb.ucs.louisiana.edu/~kxk4695/JSPI-04.pdf): conditional on
 * before + after, and under the null that nothing changed, `after` is
 * Binomial(before + after, 1/2). Figures cross-checked against
 * docs/superpowers/research/2026-08-20-low-volume-measurement-research.md §2-3.
 *
 * Pooling has one specific way to lie: a cohort can "clear the noise" because
 * one page had a huge, unrelated swing while the other eleven did nothing.
 * The sign test below is the guard against that — it counts how many members
 * moved in the *same direction as the pooled verdict* (not merely how many
 * agree with each other — a pooled rise driven by eleven falls and one huge
 * rise must not read as unanimous), independent of size, so one page
 * dominating the sum cannot pass as many changes working. Below six members
 * a two-sided exact sign test cannot reach p<0.05 at all, so under that count
 * the module says honestly that there are too few changes to run the check,
 * rather than asserting domination that the test was never powered to find.
 */

import { MIN_BASELINE } from "./confidence";

export type CohortMember = { readonly before: number; readonly after: number };

export type CohortVerdict = {
  readonly direction: "rise" | "fall" | "flat";
  /** Two-sided p from the exact conditional test on pooled counts. */
  readonly p: number;
  /**
   * True when the pooled result also survives the sign test at p<0.05.
   *
   * `reason` deliberately omits the affirmative "not one page's doing" claim
   * when the pooled test itself did not clear the noise, even though this
   * field is still `true` in that case — a future caller rendering this
   * boolean directly, instead of `reason`, would reintroduce that claim.
   */
  readonly unanimousEnough: boolean;
  readonly reason: string;
};

/**
 * Exact log of `n choose k`, as a sum of logs rather than a factorial. `n`
 * stays in the low thousands here, so a loop is both exact and fast enough —
 * no Stirling approximation, per the research digest's rule against them.
 */
function logChoose(n: number, k: number): number {
  let sum = 0;
  for (let i = 1; i <= k; i += 1) sum += Math.log(n - k + i) - Math.log(i);
  return sum;
}

function binomialPmf(n: number, k: number): number {
  return Math.exp(logChoose(n, k) + n * Math.log(0.5));
}

/** Two-sided exact binomial p at p₀ = ½: the sum of every outcome no more likely than the one observed. */
export function exactBinomialTwoSidedP(n: number, k: number): number {
  if (n === 0) return 1;
  const observed = binomialPmf(n, k);
  let p = 0;
  for (let i = 0; i <= n; i += 1)
    if (binomialPmf(n, i) <= observed * (1 + 1e-9)) p += binomialPmf(n, i);
  return Math.min(1, p);
}

/**
 * "p below 0.01" instead of a rounded "p 0.00", which reads as certainty this
 * test never claims. Above that, round three decimal places AWAY from the
 * significance threshold rather than to the nearest value: a p of 0.0498
 * naively rounds to "0.050", and a p of 0.0501 also rounds to "0.050" — the
 * same printed number sitting beside opposite verdicts. Rounding toward
 * "clears" when it does, and toward "does not" when it doesn't, guarantees
 * the printed p can never contradict the word next to it.
 */
function pClause(p: number, significant: boolean): string {
  if (p < 0.01) return "p below 0.01";
  const rounded = significant ? Math.floor(p * 1000) / 1000 : Math.ceil(p * 1000) / 1000;
  if (rounded < 0.1) return `p ${rounded.toFixed(3)}`;
  return `p ${rounded.toFixed(2)}`;
}

/**
 * The sign-test half of the verdict: how many members moved the same way as
 * the pooled direction, and whether that count is itself hard to explain by
 * chance. Below six members the two-sided exact test cannot reach p<0.05 for
 * any split, so that case is named rather than silently returning false with
 * copy that implies the check ran.
 */
function unanimity(
  direction: CohortVerdict["direction"],
  members: readonly CohortMember[],
  significant: boolean,
): { readonly unanimousEnough: boolean; readonly clause: string } {
  const nonTied = members.filter((member) => member.after !== member.before).length;

  if (direction === "flat") {
    // A flat pool can never be unanimous: there is no direction to agree with.
    // It can still happen two ways worth telling apart — every page held
    // exactly level, or individual pages moved but cancelled out.
    return {
      unanimousEnough: false,
      clause:
        nonTied === 0
          ? "and every page held exactly level, so there is nothing to test agreement on"
          : "and individual changes moved in both directions and cancelled out, so this is not one page's doing",
    };
  }

  const agreeing = members.filter((member) =>
    direction === "rise" ? member.after > member.before : member.after < member.before,
  ).length;
  const nonTiedWord = nonTied === 1 ? "change is" : "changes are";

  if (nonTied < 6) {
    // The leading conjunction has to match the clause it follows: "and" reads
    // as a continuation after a significant result, "but" as a contrast
    // after one that did not clear the noise. A single hardcoded word cannot
    // serve both.
    return {
      unanimousEnough: false,
      clause: significant
        ? `and ${agreeing} of ${nonTied} moved the same way, though ${nonTied} ${nonTiedWord} too few for that agreement to rule out chance`
        : `but ${agreeing} of ${nonTied} moved the same way, and ${nonTied} ${nonTiedWord} too few for that agreement to rule out chance`,
    };
  }

  const signP = exactBinomialTwoSidedP(nonTied, agreeing);
  const unanimousEnough = agreeing > nonTied / 2 && signP < 0.05;
  return {
    unanimousEnough,
    clause: unanimousEnough
      ? "and is not one page's doing"
      : `but only ${agreeing} of ${nonTied} moved the same way, so it could be one page's doing`,
  };
}

/**
 * Judge a cohort of changes together, or refuse when there is not enough to
 * judge.
 *
 * Returns null when there are no members, or when the pooled before-count is
 * below `MIN_BASELINE` — the same floor `confidence.ts` uses for a single
 * change, applied here to the pooled total.
 */
export function cohortVerdict(members: readonly CohortMember[]): CohortVerdict | null {
  if (members.length === 0) return null;

  const before = members.reduce((sum, member) => sum + member.before, 0);
  const after = members.reduce((sum, member) => sum + member.after, 0);
  if (before + after === 0 || before < MIN_BASELINE) return null;

  const p = exactBinomialTwoSidedP(before + after, after);
  const significant = p < 0.05;
  const direction = after > before ? "rise" : after < before ? "fall" : "flat";
  const { unanimousEnough, clause: unanimityClause } = unanimity(direction, members, significant);

  const pooledClause =
    direction === "flat"
      ? `stayed at ${before}`
      : `${direction === "rise" ? "rose" : "fell"} from ${before} to ${after}`;
  const significanceClause = significant
    ? `clears the noise (${pClause(p, significant)})`
    : `does not clear the noise (${pClause(p, significant)})`;
  const changeWord = members.length === 1 ? "change" : "changes";

  // An affirmative "not one page's doing" is a robustness claim, and a
  // robustness claim about a result that did not itself clear the noise is a
  // claim this module cannot back. `unanimousEnough` still reports what the
  // sign test found; only the copy is suppressed here.
  const showUnanimityClause = !(unanimousEnough && !significant);

  const sentence = showUnanimityClause
    ? `Your ${members.length} measured ${changeWord}, judged together: impressions ${pooledClause}, which ${significanceClause}, ${unanimityClause}.`
    : `Your ${members.length} measured ${changeWord}, judged together: impressions ${pooledClause}, which ${significanceClause}.`;

  return {
    direction,
    p,
    unanimousEnough,
    reason: sentence,
  };
}
