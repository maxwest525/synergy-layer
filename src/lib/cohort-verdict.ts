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
 * The sign test below is the guard against that — it asks how many members
 * moved in the same direction as the pooled verdict, independent of size, so
 * one page dominating the sum cannot pass as eleven changes working.
 */

import { MIN_BASELINE } from "./confidence";

export type CohortMember = { readonly before: number; readonly after: number };

export type CohortVerdict = {
  readonly direction: "rise" | "fall" | "flat";
  /** Two-sided p from the exact conditional test on pooled counts. */
  readonly p: number;
  /** True when the pooled result also survives the sign test at p<0.05. */
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
  for (let i = 0; i <= n; i += 1) if (binomialPmf(n, i) <= observed + 1e-12) p += binomialPmf(n, i);
  return Math.min(1, p);
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
  const direction = after > before ? "rise" : after < before ? "fall" : "flat";

  const ups = members.filter((member) => member.after > member.before).length;
  const downs = members.filter((member) => member.after < member.before).length;
  const nonTied = ups + downs;
  const signP = exactBinomialTwoSidedP(nonTied, Math.max(ups, downs));
  const unanimousEnough = nonTied > 0 && signP < 0.05;

  const pooledClause =
    direction === "flat"
      ? `stayed at ${before}`
      : `${direction === "rise" ? "rose" : "fell"} from ${before} to ${after}`;
  const significanceClause =
    p < 0.05
      ? `clears the noise (p ${p.toFixed(2)})`
      : `does not clear the noise (p ${p.toFixed(2)})`;
  const unanimityClause = unanimousEnough
    ? "and is not one page's doing"
    : `but only ${Math.max(ups, downs)} of ${nonTied} moved the same way, so it could be one page's doing`;

  return {
    direction,
    p,
    unanimousEnough,
    reason: `Your last ${members.length} measured changes, judged together: impressions ${pooledClause}, which ${significanceClause} ${unanimityClause}.`,
  };
}
