import { describe, expect, it } from "vitest";

import { describeImpact, isEstimated, NOT_ESTIMATED } from "./impact-words";

describe("traffic and revenue impact are rendered as what they are", () => {
  it("treats the untouched default as no estimate", () => {
    expect(isEstimated("none")).toBe(false);
    expect(isEstimated(null)).toBe(false);
    expect(isEstimated(undefined)).toBe(false);
    expect(isEstimated("")).toBe(false);
    expect(describeImpact("none")).toBe(NOT_ESTIMATED);
  });

  it("shows a stored estimate when one exists", () => {
    expect(isEstimated("low")).toBe(true);
    expect(describeImpact("high")).toBe("high");
  });
});
