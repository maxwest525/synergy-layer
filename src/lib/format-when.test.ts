import { describe, expect, it } from "vitest";

import { formatWhen } from "./format-when";

describe("formatWhen", () => {
  it("prints a stored instant in UTC words and an absence as Never", () => {
    expect(formatWhen("2026-09-01T16:05:00.000Z")).toBe("Sep 1, 04:05 PM");
    expect(formatWhen("2026-01-15T00:30:00.000Z")).toBe("Jan 15, 12:30 AM");
    expect(formatWhen(null)).toBe("Never");
    expect(formatWhen("not a date")).toBe("Never");
  });
});
