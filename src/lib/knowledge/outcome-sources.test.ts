import { describe, expect, it } from "vitest";

import type { GradedOutcome } from "../site-health";
import { composeOutcomeMemorySource, OUTCOME_MEMORY_STABLE_KEY } from "./outcome-sources";

function graded(overrides: Partial<GradedOutcome>): GradedOutcome {
  return {
    changeId: "chg-1",
    title: "Rewrite the moving quotes title",
    targetUrl: "https://trumoveinc.com/moving-quotes",
    windowDays: 28,
    daysSinceLive: 40,
    impressions: 1200,
    clicks: 80,
    measurable: true,
    readingStatus: "complete",
    coverage: { expectedDays: 28, observedDays: 28 },
    baseline: { impressions: 900, clicks: 50 },
    siteTrend: { beforeImpressions: 9000, afterImpressions: 9100 },
    wordingTreatment: true,
    verdict: "success",
    reason: "Clicks rose 60% against a flat site.",
    ...overrides,
  };
}

describe("composeOutcomeMemorySource", () => {
  it("returns null when nothing has concluded — an empty history is absence, not a document", () => {
    expect(composeOutcomeMemorySource([])).toBeNull();
    expect(
      composeOutcomeMemorySource([
        graded({ verdict: "too_early", reason: "Only 3 of 14 days have passed." }),
        graded({ verdict: "not_yet", reason: "The window has not closed." }),
        graded({ verdict: "unmeasurable", reason: "The property cannot see this page." }),
        graded({ verdict: null, reason: "Taken at approval, as the before picture." }),
      ]),
    ).toBeNull();
  });

  it("remembers only concluded verdicts, carrying the grader's reason verbatim", () => {
    const source = composeOutcomeMemorySource([
      graded({
        verdict: "success",
        windowDays: 28,
        reason: "Clicks rose 60% against a flat site.",
      }),
      graded({ verdict: "too_early", windowDays: 56, reason: "Only 30 of 56 days have passed." }),
    ]);
    expect(source).not.toBeNull();
    expect(source?.content).toContain(
      "28-day window: success. Clicks rose 60% against a flat site.",
    );
    expect(source?.content).not.toContain("too_early");
    expect(source?.metadata).toEqual({ concludedReadings: 1, changes: 1 });
  });

  it("groups windows under one heading per change, ordered by page then change then window", () => {
    const source = composeOutcomeMemorySource([
      graded({ changeId: "chg-b", targetUrl: "https://b.example", title: "B", windowDays: 56 }),
      graded({ changeId: "chg-b", targetUrl: "https://b.example", title: "B", windowDays: 14 }),
      graded({
        changeId: "chg-a",
        targetUrl: "https://a.example",
        title: "A",
        verdict: "failure",
        reason: "Fell against a rising site.",
      }),
    ]);
    const content = source?.content ?? "";
    expect(content.indexOf("## A — https://a.example")).toBeGreaterThan(-1);
    expect(content.indexOf("## A")).toBeLessThan(content.indexOf("## B"));
    expect(content.indexOf("14-day window")).toBeLessThan(content.indexOf("56-day window"));
    expect((content.match(/^## /gm) ?? []).length).toBe(2);
  });

  it("is deterministic and content-addressed: same readings in any order, same version label", () => {
    const a = graded({ changeId: "chg-a", targetUrl: "https://a.example" });
    const b = graded({
      changeId: "chg-b",
      targetUrl: "https://b.example",
      verdict: "neutral",
      reason: "Held flat with the site.",
    });
    const one = composeOutcomeMemorySource([a, b]);
    const two = composeOutcomeMemorySource([b, a]);
    expect(one?.content).toBe(two?.content);
    expect(one?.versionLabel).toBe(two?.versionLabel);
    expect(one?.versionLabel).toMatch(/^outcomes-2-[0-9a-f]{8}$/);
    expect(one?.stableKey).toBe(OUTCOME_MEMORY_STABLE_KEY);
    expect(one?.sourceType).toBe("research");
  });

  it("states the guidance-not-evidence boundary in the document itself", () => {
    const source = composeOutcomeMemorySource([graded({})]);
    expect(source?.content).toContain("never this summary");
  });
});
