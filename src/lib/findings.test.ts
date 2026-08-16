import { describe, expect, it } from "vitest";

import {
  findingPersistence,
  isApprovalEligibleRecommendation,
  withoutIneligibleRecommendationApprovals,
} from "./findings";

describe("finding approval invariants", () => {
  it("keeps an observation-only finding out of approval state", () => {
    expect(findingPersistence({ observationOnly: true })).toEqual({
      state: "observed",
      requiresApproval: false,
    });
  });

  it("rejects an observation-only row even when legacy columns claim it is proposed", () => {
    expect(
      isApprovalEligibleRecommendation({
        state: "proposed",
        requires_approval: true,
        metadata: { observationOnly: true },
      }),
    ).toBe(false);
  });

  it("accepts only a non-observation proposal that actually requires approval", () => {
    expect(
      isApprovalEligibleRecommendation({
        state: "proposed",
        requires_approval: true,
        metadata: {},
      }),
    ).toBe(true);
    expect(
      isApprovalEligibleRecommendation({
        state: "observed",
        requires_approval: false,
        metadata: {},
      }),
    ).toBe(false);
  });

  it("refuses to use the finding persistence path for an actionable proposal", () => {
    expect(() => findingPersistence({ observationOnly: false })).toThrow(
      "Only observation-only findings use this persistence path.",
    );
  });

  it("removes legacy observation findings from the pending approval lane", () => {
    const inbox = [
      { id: "bad", lane: "pending_approval", subject_kind: "recommendation", subject_id: "r1" },
      { id: "good", lane: "pending_approval", subject_kind: "recommendation", subject_id: "r2" },
      { id: "other", lane: "needs_attention", subject_kind: "recommendation", subject_id: "r1" },
    ];

    expect(
      withoutIneligibleRecommendationApprovals(inbox, [
        {
          id: "r1",
          state: "proposed",
          requires_approval: true,
          metadata: { observationOnly: true },
        },
        { id: "r2", state: "proposed", requires_approval: true, metadata: {} },
      ]).map((item) => item.id),
    ).toEqual(["good", "other"]);
  });
});
