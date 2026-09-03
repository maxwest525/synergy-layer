import { describe, expect, it } from "vitest";

import { metricsWorthKeeping } from "./keywords.server";

describe("what approval is willing to call a metrics reading", () => {
  it("keeps a snapshot that carries something", () => {
    expect(metricsWorthKeeping({ search_volume: 1300 })).toBe(true);
    expect(metricsWorthKeeping({ keyword_difficulty: 0, search_intent: "commercial" })).toBe(true);
  });

  it("refuses the empty object, which is the column default and not a reading", () => {
    // keyword_candidates.metrics defaults to '{}'. Dating that as a snapshot
    // would claim a reading nobody paid for.
    expect(metricsWorthKeeping({})).toBe(false);
  });

  it("refuses absence, and never mistakes a shape it did not expect for data", () => {
    expect(metricsWorthKeeping(null)).toBe(false);
    expect(metricsWorthKeeping(undefined)).toBe(false);
    expect(metricsWorthKeeping([])).toBe(false);
    expect(metricsWorthKeeping([{ search_volume: 10 }])).toBe(false);
    expect(metricsWorthKeeping("search_volume=10")).toBe(false);
    expect(metricsWorthKeeping(0)).toBe(false);
  });
});
