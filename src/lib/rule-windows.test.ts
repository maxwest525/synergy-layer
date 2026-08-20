import { describe, expect, it } from "vitest";

import { ruleWindows } from "./search-console";

const WINDOW = 28;

describe("the windows a rule compares", () => {
  it("ends the current window on the reporting date", () => {
    const windows = ruleWindows("2026-08-19", WINDOW);
    expect(windows.current).toEqual({ start: "2026-07-23", end: "2026-08-19" });
  });

  it("puts the prior window immediately before it, touching but not overlapping", () => {
    const windows = ruleWindows("2026-08-19", WINDOW);
    expect(windows.prior).toEqual({ start: "2026-06-25", end: "2026-07-22" });
  });

  it("never overlaps, which is the whole point", () => {
    // Two 28-day windows a week apart share 21 days. A rule diffing those
    // reports a change that did not happen, which is the trap the analytics
    // comparison already refuses to fall into.
    for (const date of ["2026-01-01", "2026-02-28", "2026-03-01", "2026-08-19", "2026-12-31"]) {
      const { current, prior } = ruleWindows(date, WINDOW);
      expect(prior.end < current.start).toBe(true);
    }
  });

  it("covers exactly the window length on both sides, with no gap between them", () => {
    const { current, prior } = ruleWindows("2026-08-19", WINDOW);
    expect(daysBetween(current.start, current.end)).toBe(WINDOW - 1);
    expect(daysBetween(prior.start, prior.end)).toBe(WINDOW - 1);
    // Touching: no day falls between the two windows and is judged by neither.
    expect(daysBetween(prior.end, current.start)).toBe(1);
  });

  it("crosses a month boundary without drifting", () => {
    expect(ruleWindows("2026-03-05", WINDOW).current.start).toBe("2026-02-06");
  });

  it("crosses a year boundary without drifting", () => {
    expect(ruleWindows("2026-01-10", WINDOW)).toEqual({
      current: { start: "2025-12-14", end: "2026-01-10" },
      prior: { start: "2025-11-16", end: "2025-12-13" },
    });
  });

  it("holds the same shape at other window lengths", () => {
    const { current, prior } = ruleWindows("2026-08-19", 7);
    expect(current).toEqual({ start: "2026-08-13", end: "2026-08-19" });
    expect(prior).toEqual({ start: "2026-08-06", end: "2026-08-12" });
    expect(prior.end < current.start).toBe(true);
  });
});

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}
