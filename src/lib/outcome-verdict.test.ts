import { describe, expect, it } from "vitest";

import { GROUNDED_WINDOWS, outcomeVerdict, type OutcomeReading } from "./outcome-verdict";

function reading(overrides: Partial<OutcomeReading> = {}): OutcomeReading {
  return {
    windowDays: 28,
    daysSinceLive: 30,
    impressions: 0,
    clicks: 0,
    measurable: true,
    baseline: null,
    siteTrend: null,
    ...overrides,
  };
}

describe("the windows are the ones the research grounds", () => {
  it("uses 14, 28, 56 and 90", () => {
    // From the operator's own research, under a heading that names the problem
    // it solves: "Prediction-engine thresholds (evidence-based, replacing
    // vibes)". 7 appears nowhere in it.
    expect(GROUNDED_WINDOWS).toEqual([14, 28, 56, 90]);
  });

  it("does not include 7, which nothing derives", () => {
    expect(GROUNDED_WINDOWS).not.toContain(7);
  });
});

describe("the rule that matters most in 2026", () => {
  it("calls no clicks with real impressions neutral, not failure", () => {
    // Organic CTR drops 61% on queries showing an AI Overview. A page shown
    // less but still earning what it is shown is not a failed page.
    const verdict = outcomeVerdict(
      reading({ impressions: 140, clicks: 0, baseline: { impressions: 300, clicks: 0 } }),
    );
    expect(verdict.verdict).toBe("neutral");
    expect(verdict.reason).toMatch(/shown/i);
  });

  it("still calls a real fall with clicks gone a failure", () => {
    const verdict = outcomeVerdict(
      reading({ impressions: 12, clicks: 0, baseline: { impressions: 100, clicks: 20 } }),
    );
    expect(verdict.verdict).toBe("failure");
  });

  it("counts a clear rise with no site trend to explain it as a success", () => {
    const verdict = outcomeVerdict(
      reading({ impressions: 400, clicks: 5, baseline: { impressions: 50, clicks: 0 } }),
    );
    expect(verdict.verdict).toBe("success");
  });
});

describe("the 14 day window asks only whether Google indexed it", () => {
  it("passes as soon as the page has been shown at all", () => {
    const verdict = outcomeVerdict(reading({ windowDays: 14, impressions: 1, clicks: 0 }));
    expect(verdict.verdict).toBe("success");
    expect(verdict.reason).toMatch(/index/i);
  });

  it("does not judge clicks this early", () => {
    // Asking for clicks at 14 days would fail pages that are working.
    const verdict = outcomeVerdict(reading({ windowDays: 14, impressions: 200, clicks: 0 }));
    expect(verdict.verdict).toBe("success");
  });
});

describe("two weeks is inside Google's own reprocessing time", () => {
  // "Crawling can take anywhere from a few days to a few weeks."
  // https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
  it("reports not yet, never failure, when a 14 day window has no impressions", () => {
    const graded = outcomeVerdict(reading({ windowDays: 14, daysSinceLive: 14, impressions: 0 }));
    expect(graded.verdict).toBe("not_yet");
    expect(graded.reason).toContain("weeks");
  });
  it("still reports success when the page has appeared", () => {
    expect(
      outcomeVerdict(reading({ windowDays: 14, daysSinceLive: 14, impressions: 3 })).verdict,
    ).toBe("success");
  });
});

describe("refusing to grade what it cannot", () => {
  it("says too early rather than failure before the window closes", () => {
    const verdict = outcomeVerdict(reading({ daysSinceLive: 9, impressions: 0 }));
    expect(verdict.verdict).toBe("too_early");
    expect(verdict.reason).toContain("19");
  });

  it("says unmeasurable when the page is outside the connected property", () => {
    // A page the connected property cannot see has not failed. Recording a
    // failure here would be inventing one.
    const verdict = outcomeVerdict(reading({ measurable: false }));
    expect(verdict.verdict).toBe("unmeasurable");
    expect(verdict.reason).toMatch(/cannot measure|outside/i);
  });

  it("never grades an unrecognised window", () => {
    const verdict = outcomeVerdict(reading({ windowDays: 21 }));
    expect(verdict.verdict).toBe("unmeasurable");
  });

  it("always explains itself in words the operator can read", () => {
    const samples: OutcomeReading[] = [
      reading({ impressions: 140, clicks: 0 }),
      reading({ impressions: 12 }),
      reading({ windowDays: 14, impressions: 0 }),
      reading({ daysSinceLive: 2 }),
      reading({ measurable: false }),
    ];
    for (const sample of samples) {
      const verdict = outcomeVerdict(sample);
      expect(verdict.reason.length).toBeGreaterThan(20);
      expect(verdict.reason).not.toContain("—");
    }
  });
});

describe("the later windows scale the 28 day baseline", () => {
  it("scales ×2 at 56 days and grades a real rise a success", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 56,
        daysSinceLive: 60,
        impressions: 900,
        clicks: 60,
        baseline: { impressions: 100, clicks: 5 },
      }),
    );
    expect(graded.verdict).toBe("success");
    expect(graded.reason).toContain("200");
  });

  it("scales ×3.21 at 90 days and grades a real fall with clicks gone a failure", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 90,
        daysSinceLive: 95,
        impressions: 10,
        clicks: 0,
        baseline: { impressions: 100, clicks: 20 },
      }),
    );
    expect(graded.verdict).toBe("failure");
  });

  it("without a stored baseline, 56 and 90 day windows say so instead of grading the level", () => {
    expect(
      outcomeVerdict(reading({ windowDays: 56, daysSinceLive: 60, impressions: 300 })).verdict,
    ).toBe("neutral");
    expect(
      outcomeVerdict(reading({ windowDays: 90, daysSinceLive: 95, impressions: 300 })).verdict,
    ).toBe("neutral");
  });
});

describe("the verdict grades the change, not the level", () => {
  it("holding steady is neutral, not success", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 400,
        clicks: 40,
        baseline: { impressions: 400, clicks: 40 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("neutral");
  });
  it("a fall that clears the noise floor is a failure even with clicks remaining", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 60,
        clicks: 6,
        baseline: { impressions: 400, clicks: 50 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("failure");
  });
  it("a rise inside the noise is neutral and says so", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 13,
        clicks: 1,
        baseline: { impressions: 10, clicks: 1 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/noise|ordinary|too little/i);
  });
  it("a rise the whole site shares is the tide, not the treatment", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 200,
        clicks: 10,
        baseline: { impressions: 100, clicks: 5 },
        siteTrend: { beforeImpressions: 300, afterImpressions: 620 },
      }),
    );
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/site/i);
  });
  it("with no stored baseline it says so instead of grading the level", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 150,
        clicks: 8,
        baseline: null,
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/baseline|before/i);
  });
  it("shown much more but still unclicked stays neutral (AIO rule survives)", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 160,
        clicks: 0,
        baseline: { impressions: 40, clicks: 0 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).not.toBe("failure");
  });
});

describe("the site's tide is compared on a per-day footing, not a raw total", () => {
  // Bug the review caught: beforeImpressions covers a fixed 28 days while
  // afterImpressions covers windowDays days. Dividing the raw totals carries
  // that window-length factor into the "ratio", so a perfectly flat site at
  // 90 days reported as having "risen" ×3.21 - a fabricated number in
  // operator-facing copy - and downgraded real successes to neutral with it.
  it("does not read a flat site as a rise just because its window is longer", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 2700,
        clicks: 50,
        baseline: { impressions: 280, clicks: 0 },
        // Same per-day rate (10/day) in both periods: 280 over 28 days,
        // 900 over 90 days. A page that genuinely tripled against that.
        siteTrend: { beforeImpressions: 280, afterImpressions: 900 },
      }),
    );
    expect(graded.verdict).toBe("success");
    expect(graded.reason).toMatch(/held flat/i);
    expect(graded.reason).not.toMatch(/rose ×3|moved ×3/i);
  });
});

describe("a rise only counts once it earns at least as much as before", () => {
  it("being seen more while earning less is neutral, not success", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 300,
        clicks: 0,
        baseline: { impressions: 100, clicks: 20 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/earning less|not yet a win/i);
  });
  it("a rise with clicks held at or above the baseline stays a success", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 300,
        clicks: 25,
        baseline: { impressions: 100, clicks: 20 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("success");
  });
});

describe("no unrounded scaled count reaches the operator", () => {
  it("never puts a three-or-more-decimal number in a reason string", () => {
    const scenarios: OutcomeReading[] = [
      // 90 / 28 does not divide evenly, so every branch below scales a
      // baseline by a fractional factor.
      reading({ windowDays: 90, daysSinceLive: 90, impressions: 8, clicks: 1, baseline: null }),
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 8,
        clicks: 1,
        baseline: { impressions: 2, clicks: 0 },
      }),
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 10,
        clicks: 0,
        baseline: { impressions: 100, clicks: 0 },
      }),
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 5,
        clicks: 0,
        baseline: { impressions: 100, clicks: 20 },
      }),
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 900,
        clicks: 0,
        baseline: { impressions: 50, clicks: 10 },
      }),
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 900,
        clicks: 40,
        baseline: { impressions: 50, clicks: 10 },
        siteTrend: { beforeImpressions: 50, afterImpressions: 900 },
      }),
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 900,
        clicks: 40,
        baseline: { impressions: 50, clicks: 10 },
      }),
    ];
    for (const scenario of scenarios) {
      const graded = outcomeVerdict(scenario);
      expect(graded.reason).not.toMatch(/\d+\.\d{3,}/);
    }
  });
});

describe("the MIN_BASELINE floor is checked before rounding, not after", () => {
  it("never lets a scaled-up baseline round past the floor it never actually cleared", () => {
    // 3 scaled ×3.214... at 90 days is 9.64, which rounds to 10 and would clear
    // MIN_BASELINE if the floor were checked on the rounded value.
    const graded = outcomeVerdict(
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 100,
        clicks: 5,
        baseline: { impressions: 3, clicks: 0 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("neutral");
    expect(graded.verdict).not.toBe("success");
  });
});

describe("the scaling note appears in every branch that quotes a scaled number", () => {
  it("is present on the low-confidence return at 56/90 days", () => {
    // scaledBaselineImpressions rounds to 321; matching it exactly forces the
    // "both periods hold the same count" low-confidence branch.
    const graded = outcomeVerdict(
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 321,
        clicks: 5,
        baseline: { impressions: 100, clicks: 5 },
        siteTrend: null,
      }),
    );
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/scaled ×3\.21/);
  });

  it("is present on the tide-neutral return at 56/90 days", () => {
    const graded = outcomeVerdict(
      reading({
        windowDays: 90,
        daysSinceLive: 90,
        impressions: 700,
        clicks: 50,
        baseline: { impressions: 100, clicks: 5 },
        // Rate 10/day before, rate ~22.2/day after: the site outran the page.
        siteTrend: { beforeImpressions: 280, afterImpressions: 2000 },
      }),
    );
    expect(graded.verdict).toBe("neutral");
    expect(graded.reason).toMatch(/scaled ×3\.21/);
    expect(graded.reason).toMatch(/tide/i);
    // The page's own ratio (700 / 321 ≈ ×2.18) and the site's (2000/90 over
    // 280/28 ≈ ×2.22) round to the same ×2.2, so the copy should not assert a
    // contrast between two numbers that print identically.
    expect(graded.reason).toMatch(/kept pace \(×2\.2\)/);
    expect(graded.reason).not.toMatch(/site rose ×2\.2/);
  });
});
