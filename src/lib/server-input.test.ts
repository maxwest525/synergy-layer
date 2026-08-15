import { describe, expect, it } from "vitest";

import { parseChangeTransitionInput, parseUuidInput } from "./server-input";

describe("server input parsing", () => {
  it("accepts UUID input without loading a runtime schema module", () => {
    expect(parseUuidInput({ id: "123e4567-e89b-42d3-a456-426614174000" })).toEqual({
      id: "123e4567-e89b-42d3-a456-426614174000",
    });
  });

  it("rejects invalid UUIDs and oversized transition text", () => {
    expect(() => parseUuidInput({ id: "not-a-uuid" })).toThrow("valid UUID");
    expect(() =>
      parseChangeTransitionInput({
        id: "123e4567-e89b-42d3-a456-426614174000",
        notes: "x".repeat(2_001),
      }),
    ).toThrow("2,000 characters");
  });
});
