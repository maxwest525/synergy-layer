import { describe, expect, it } from "vitest";

import { actionCenterFieldChanges, actionCenterLane, actionCenterStage } from "./action-center";

const change = {
  state: "approved",
  changes: [],
  source_commit_sha: null,
  published_proof_at: null,
};

describe("Action Center change request lifecycle", () => {
  it("keeps a legacy completed approval visible until execution is finished", () => {
    expect(actionCenterLane("completed", change)).toBe("in_progress");
    expect(actionCenterStage(change)).toBe("Approved — ready to execute");
  });

  it("keeps applied work visible for outcome tracking", () => {
    expect(actionCenterLane("needs_attention", { ...change, state: "applied" })).toBe(
      "in_progress",
    );
  });

  it("distinguishes a committed approval from one that still needs execution", () => {
    expect(actionCenterStage({ ...change, source_commit_sha: "abc123" })).toBe(
      "Source committed — publish and check next",
    );
  });

  it("closes only terminal change request states", () => {
    for (const state of ["rejected", "verified", "rolled_back"]) {
      expect(actionCenterLane("needs_attention", { ...change, state })).toBe("completed");
    }
  });

  it("keeps exact before and after values for the action card", () => {
    expect(
      actionCenterFieldChanges([
        {
          field: "page_heading",
          label: "Page heading (H1)",
          before: "Corporate Relocation",
          after: "Employee Relocation Moving Services",
        },
      ]),
    ).toEqual([
      {
        field: "page_heading",
        label: "Page heading (H1)",
        before: "Corporate Relocation",
        after: "Employee Relocation Moving Services",
      },
    ]);
  });
});
