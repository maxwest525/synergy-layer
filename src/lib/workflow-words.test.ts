import { describe, expect, it } from "vitest";

import { findActiveRun, humanize, kindLabels } from "./workflow-words";

describe("workflow words", () => {
  it("reads a step key as words", () => {
    expect(humanize("collect_snapshots")).toBe("Collect snapshots");
    expect(humanize("dfs.labs")).toBe("Dfs labs");
    expect(kindLabels["approval"]).toBe("Approval gate");
  });

  it("finds the run still moving", () => {
    const runs = [
      { id: "a", state: "succeeded" },
      { id: "b", state: "awaiting_approval" },
    ];
    expect(findActiveRun(runs)?.id).toBe("b");
    expect(findActiveRun([{ id: "c", state: "failed" }])).toBeNull();
  });
});
