import { describe, expect, it } from "vitest";

import { cohortVerdict, exactBinomialTwoSidedP } from "./cohort-verdict";

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
    const up = { before: 10, after: 14 },
      down = { before: 10, after: 7 };
    expect(cohortVerdict([...Array(10).fill(up), ...Array(2).fill(down)])!.unanimousEnough).toBe(
      true,
    );
    expect(cohortVerdict([...Array(9).fill(up), ...Array(3).fill(down)])!.unanimousEnough).toBe(
      false,
    );
  });
});

describe("the pieces the verdict is built from", () => {
  it("returns null with no members at all", () => {
    expect(cohortVerdict([])).toBeNull();
  });

  it("calls an exact tie flat with a p of 1", () => {
    const verdict = cohortVerdict([{ before: 100, after: 100 }]);
    expect(verdict?.direction).toBe("flat");
    expect(verdict?.p).toBeCloseTo(1, 9);
  });

  it("names the pooled counts, the member count and both test outcomes in the reason", () => {
    const up = { before: 10, after: 14 },
      down = { before: 10, after: 7 };
    const verdict = cohortVerdict([...Array(10).fill(up), ...Array(2).fill(down)]);
    expect(verdict?.reason).toContain("12");
    expect(verdict?.reason).toMatch(/\d+ to \d+/);
  });

  it("pools before-counts across members rather than judging any one alone", () => {
    // Each member's own before-count (6) sits under MIN_BASELINE (10), but the
    // pooled before-count (12) clears it, so the verdict is not refused.
    expect(
      cohortVerdict([
        { before: 6, after: 9 },
        { before: 6, after: 9 },
      ]),
    ).not.toBeNull();
  });

  it("computes the textbook exact two-sided binomial p at one half", () => {
    // A coin landing heads 8 times out of 10 is not surprising enough to call
    // significant at p<0.05 (two-sided exact p is about 0.109).
    expect(exactBinomialTwoSidedP(10, 8)).toBeGreaterThan(0.05);
    expect(exactBinomialTwoSidedP(10, 8)).toBeCloseTo(0.109, 3);
  });
});
