import { describe, expect, it } from "vitest";

import { failureAlerts } from "./outcome-alerts";
import { gradeOutcomes, type StoredOutcome } from "./site-health";

const NOW_DAYS = 30;

function outcome(overrides: Partial<StoredOutcome> = {}): StoredOutcome {
  return {
    changeId: "chg-1",
    title: "Rewrite the packing page title",
    targetUrl: "https://x.test/services/packing",
    windowDays: 28,
    daysSinceLive: NOW_DAYS,
    impressions: 400,
    clicks: 6,
    measurable: true,
    readingStatus: "complete" as const,
    coverage: null,
    baseline: null,
    siteTrend: null,
    wordingTreatment: false,
    ...overrides,
  };
}

/** A reading outcome-verdict.ts itself grades a failure, not a hand-built one. */
const failing = outcome({
  impressions: 12,
  clicks: 0,
  baseline: { impressions: 100, clicks: 20 },
});

describe("a failed change asks for attention exactly once", () => {
  it("raises an alert only for readings the verdict module graded a failure", () => {
    const graded = gradeOutcomes([
      failing,
      outcome({ changeId: "worked", impressions: 400, baseline: { impressions: 50, clicks: 0 } }),
      outcome({ changeId: "waiting", daysSinceLive: 3 }),
      outcome({ changeId: "unseen", measurable: false }),
    ]);
    const alerts = failureAlerts(graded);
    expect(alerts.map((alert) => alert.changeId)).toEqual(["chg-1"]);
  });

  it("carries the change, the window, and the verdict's own reason", () => {
    const [alert] = failureAlerts(gradeOutcomes([failing]));
    expect(alert?.title).toBe("Rewrite the packing page title");
    expect(alert?.targetUrl).toBe("https://x.test/services/packing");
    expect(alert?.windowDays).toBe(28);
    // The reason is the verdict's, verbatim, naming the numbers it rests on.
    expect(alert?.reason).toMatch(/fell from 100 to 12 impressions/i);
  });

  it("raises one alert per change even when several windows failed", () => {
    const graded = gradeOutcomes([
      failing,
      { ...failing, windowDays: 56, daysSinceLive: 60, baseline: { impressions: 100, clicks: 20 } },
    ]);
    const alerts = failureAlerts(graded);
    expect(alerts).toHaveLength(1);
    // The longest window is the most settled evidence, so it is the one named.
    expect(alerts[0]?.windowDays).toBe(56);
  });

  it("raises nothing when nothing failed", () => {
    expect(failureAlerts(gradeOutcomes([outcome({ daysSinceLive: 3 })]))).toEqual([]);
    expect(failureAlerts([])).toEqual([]);
  });
});
