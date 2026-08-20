import { describe, expect, it } from "vitest";

import { GROUNDED_WINDOWS, outcomeVerdict, type OutcomeReading } from "./outcome-verdict";

function reading(overrides: Partial<OutcomeReading> = {}): OutcomeReading {
  return {
    windowDays: 28,
    daysSinceLive: 30,
    impressions: 0,
    clicks: 0,
    measurable: true,
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
    // Organic CTR drops 61% on queries showing an AI Overview. A page appearing
    // in search but unclicked is not a failed page.
    const verdict = outcomeVerdict(reading({ impressions: 140, clicks: 0 }));
    expect(verdict.verdict).toBe("neutral");
    expect(verdict.reason).toMatch(/AI Overview|shown/i);
  });

  it("still calls no clicks and almost no impressions a failure", () => {
    const verdict = outcomeVerdict(reading({ impressions: 12, clicks: 0 }));
    expect(verdict.verdict).toBe("failure");
  });

  it("counts five clicks as a success at 28 days", () => {
    const verdict = outcomeVerdict(reading({ impressions: 400, clicks: 5 }));
    expect(verdict.verdict).toBe("success");
  });

  it("counts four clicks as not yet a success", () => {
    const verdict = outcomeVerdict(reading({ impressions: 400, clicks: 4 }));
    expect(verdict.verdict).toBe("neutral");
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

describe("the later windows", () => {
  it("judges 56 days on sustained visibility", () => {
    expect(
      outcomeVerdict(reading({ windowDays: 56, daysSinceLive: 60, impressions: 300 })).verdict,
    ).toBe("success");
    expect(
      outcomeVerdict(reading({ windowDays: 56, daysSinceLive: 60, impressions: 40 })).verdict,
    ).toBe("neutral");
    expect(
      outcomeVerdict(reading({ windowDays: 56, daysSinceLive: 60, impressions: 0 })).verdict,
    ).toBe("failure");
  });

  it("judges 90 days the same way, on a longer horizon", () => {
    expect(
      outcomeVerdict(reading({ windowDays: 90, daysSinceLive: 95, impressions: 300 })).verdict,
    ).toBe("success");
  });
});
