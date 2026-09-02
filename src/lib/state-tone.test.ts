import { describe, expect, it } from "vitest";

import { toneForState } from "./state-tone";

describe("toneForState", () => {
  it("colours a stored state by what it means", () => {
    expect(toneForState("verified")).toBe("positive");
    expect(toneForState("awaiting_approval")).toBe("warning");
    expect(toneForState("rolled_back")).toBe("danger");
    expect(toneForState("running")).toBe("primary");
    expect(toneForState(null)).toBe("neutral");
  });
});
