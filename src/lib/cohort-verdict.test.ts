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

  it("never prints the same rounded p on both sides of the 0.05 threshold", () => {
    // Fix-round receipt: pooled 25 -> 42 (p = 0.0498) and pooled 10 -> 22
    // (p = 0.0501) both round to a naive "0.050" at three decimals — the same
    // printed number sitting beside opposite verdicts. Rounding away from the
    // threshold (floor when significant, ceil when not) tells them apart.
    const clears = cohortVerdict([{ before: 25, after: 42 }]);
    expect(clears?.p).toBeLessThan(0.05);
    expect(clears?.reason).toContain("clears the noise (p 0.049)");

    const doesNot = cohortVerdict([{ before: 10, after: 22 }]);
    expect(doesNot?.p).toBeGreaterThan(0.05);
    expect(doesNot?.reason).toContain("does not clear the noise (p 0.051)");
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

  it("does not call a pooled rise unanimous when it is really one page's doing", () => {
    // Fix-round receipt: 11 pages fall 10 -> 8, one page rises 10 -> 300. The
    // pool still reads as a rise (120 -> 388), but only one of twelve members
    // actually moved that way — measuring "agreement" against the other
    // members instead of against the pooled direction let this read as
    // unanimous, which is exactly the lie the sign test exists to catch.
    const fallen = { before: 10, after: 8 },
      risen = { before: 10, after: 300 };
    const verdict = cohortVerdict([...Array(11).fill(fallen), risen]);
    expect(verdict?.direction).toBe("rise");
    expect(verdict?.unanimousEnough).toBe(false);
    expect(verdict?.reason).not.toMatch(/not one page's doing/);
    expect(verdict?.reason).toMatch(/could be one page's doing/);
  });

  it("says too few changes to run the check under six members, rather than claiming domination", () => {
    // A two-sided exact sign test cannot reach p<0.05 below six members no
    // matter the split, so calling three-of-three "unanimous" or "not
    // unanimous" both assert something the test was never powered to show.
    const up = { before: 10, after: 14 };
    const verdict = cohortVerdict(Array(3).fill(up));
    expect(verdict?.unanimousEnough).toBe(false);
    expect(verdict?.reason).toMatch(/too few/);
    expect(verdict?.reason).not.toMatch(/not one page's doing/);
    expect(verdict?.reason).not.toMatch(/could be one page's doing/);
    // The seam: the significance clause's closing paren must be followed by
    // a comma and a conjunction, not run straight into the next clause.
    expect(verdict?.reason).toMatch(/\), but \d+ of \d+ moved/);
  });

  it("uses a conjunction that matches whether the pooled result cleared the noise", () => {
    // Under six members the too-few clause always follows a significance
    // clause, and "and" reads as a continuation while "but" reads as a
    // contrast — a single hardcoded conjunction cannot serve both.
    const significant = cohortVerdict(Array(3).fill({ before: 10, after: 18 }));
    expect(significant?.p).toBeLessThan(0.05);
    expect(significant?.reason).toMatch(/\), and \d+ of \d+ moved the same way, though/);

    const notSignificant = cohortVerdict(Array(3).fill({ before: 10, after: 14 }));
    expect(notSignificant?.p).toBeGreaterThan(0.05);
    expect(notSignificant?.reason).toMatch(/\), but \d+ of \d+ moved the same way, and/);
  });

  it("uses singular grammar when only one change is non-tied", () => {
    const verdict = cohortVerdict([{ before: 10, after: 14 }]);
    expect(verdict?.reason).toMatch(/1 change is too few/);
    expect(verdict?.reason).not.toMatch(/1 changes are too few/);
  });

  it("clears the too-few floor at six members and calls a clean sweep unanimous", () => {
    // Strong enough per-member rise that the pooled result also clears the
    // noise, so the unanimity clause is not suppressed as an affirmative
    // claim riding on a null pooled result (see the suppression tests below).
    const up = { before: 10, after: 16 };
    const verdict = cohortVerdict(Array(6).fill(up));
    expect(verdict?.p).toBeLessThan(0.05);
    expect(verdict?.unanimousEnough).toBe(true);
    expect(verdict?.reason).toMatch(/\), and is not one page's doing/);
  });

  it("does not claim robustness for a pooled result that never cleared the noise", () => {
    // 6 members each 2 -> 3: every one of them rose (sign test unanimous),
    // but the pooled count itself (12 -> 18) does not clear the noise. An
    // affirmative "not one page's doing" here would misrepresent a null
    // result as a robust one.
    const up = { before: 2, after: 3 };
    const verdict = cohortVerdict(Array(6).fill(up));
    expect(verdict?.p).toBeGreaterThan(0.05);
    expect(verdict?.unanimousEnough).toBe(true);
    expect(verdict?.reason).not.toMatch(/one page's doing/);
    expect(verdict?.reason).toMatch(/does not clear the noise \(p [\d.]+\)\.$/);
  });
});

describe("the pieces the verdict is built from", () => {
  it("returns null with no members at all", () => {
    expect(cohortVerdict([])).toBeNull();
  });

  it("calls an exact tie flat with a p of 1, never unanimous", () => {
    const verdict = cohortVerdict([{ before: 100, after: 100 }]);
    expect(verdict?.direction).toBe("flat");
    expect(verdict?.p).toBeCloseTo(1, 9);
    expect(verdict?.unanimousEnough).toBe(false);
  });

  it("tells apart a pool where every member held level from one that cancelled out", () => {
    const level = cohortVerdict(Array(3).fill({ before: 10, after: 10 }));
    expect(level?.reason).toMatch(/\), and every page held exactly level/);

    const cancelled = cohortVerdict([
      { before: 10, after: 14 },
      { before: 10, after: 6 },
    ]);
    expect(cancelled?.direction).toBe("flat");
    expect(cancelled?.reason).toMatch(/\), and individual changes moved.*cancelled out/);
    expect(cancelled?.reason).toMatch(/no single page drove it/);
    expect(cancelled?.reason).not.toMatch(/this is not one page's doing/);
    // No dangling "either" — nothing earlier in the sentence for it to refer to.
    expect(cancelled?.reason).not.toMatch(/either/);
  });

  it("never rounds a tiny p down to a false '0.00'", () => {
    const verdict = cohortVerdict([{ before: 100, after: 1000 }]);
    expect(verdict?.reason).toContain("p below 0.01");
    expect(verdict?.reason).not.toContain("p 0.00");
  });

  it("names the pooled counts, the member count and both test outcomes in the reason", () => {
    const up = { before: 10, after: 14 },
      down = { before: 10, after: 7 };
    const verdict = cohortVerdict([...Array(10).fill(up), ...Array(2).fill(down)]);
    // The member count (12), distinct from any digit inside the pooled counts.
    expect(verdict?.reason).toMatch(/\b12 measured changes\b/);
    expect(verdict?.reason).toMatch(/\d+ to \d+/);
    // Both test outcomes: the pooled significance clause and the sign-test clause.
    expect(verdict?.reason).toMatch(/clears the noise|does not clear the noise/);
    expect(verdict?.reason).toMatch(/not one page's doing|could be one page's doing/);
  });

  it("uses singular grammar for one measured change", () => {
    const verdict = cohortVerdict([{ before: 120, after: 155 }]);
    expect(verdict?.reason).toMatch(/\b1 measured change\b/);
    expect(verdict?.reason).not.toMatch(/1 measured changes/);
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
