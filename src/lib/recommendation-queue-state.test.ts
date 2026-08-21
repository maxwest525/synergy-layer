import { describe, expect, it } from "vitest";

import { nextRecommendationState } from "./recommendation-queue-state";

describe("setting a suggestion aside, and taking it back", () => {
  it("ignores an open suggestion without asking whether anything is runnable", () => {
    expect(nextRecommendationState("ignore", "proposed", false)).toEqual({
      ok: true,
      nextState: "rejected",
    });
  });

  it("restores an ignored suggestion to the open list", () => {
    expect(nextRecommendationState("restore", "rejected", false)).toEqual({
      ok: true,
      nextState: "proposed",
    });
  });

  it("refuses to set aside observed evidence, and says why in plain words", () => {
    const result = nextRecommendationState("ignore", "observed", true);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/what we saw/i);
  });

  it("refuses to ignore something already ignored", () => {
    const result = nextRecommendationState("ignore", "rejected", false);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/already set aside/i);
  });

  it("refuses to restore something that is not set aside", () => {
    const result = nextRecommendationState("restore", "proposed", false);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/not set aside/i);
  });

  it("refuses to reopen an approved suggestion, because that decision was acted on", () => {
    const result = nextRecommendationState("restore", "approved", false);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/already approved/i);
  });
});
