import { describe, expect, it } from "vitest";

import {
  isSeoRunEligibleForPreparation,
  isSeoRunEligibleForProposalEventRepair,
} from "./eligibility";

describe("SEO run preparation eligibility", () => {
  it("accepts the server row shape while keeping unknown states ineligible", () => {
    const failedRow: { state: string; change_request_id: string | null } = {
      state: "failed",
      change_request_id: null,
    };
    const unknownRow: { state: string; change_request_id: string | null } = {
      state: "unexpected_state",
      change_request_id: null,
    };

    expect(isSeoRunEligibleForPreparation(failedRow)).toBe(true);
    expect(isSeoRunEligibleForPreparation(unknownRow)).toBe(false);
  });

  it.each([
    ["failed run linked to a change request", "failed", "change-1", false],
    ["failed run without a change request", "failed", null, true],
    ["draft run", "draft", null, true],
    ["preflight-blocked run", "preflight_blocked", null, true],
    ["evidence-ready run", "evidence_ready", null, false],
    ["evaluated run", "evaluated", null, false],
    ["awaiting-approval run", "awaiting_approval", null, false],
    ["approved run", "approved", null, false],
    ["executing run", "executing", null, false],
    ["executed run", "executed", null, false],
    ["verified run", "verified", null, false],
    ["rejected run", "rejected", null, false],
    ["rolled-back run", "rolled_back", null, false],
  ] as const)("marks %s as preparable: %s", (_name, state, change_request_id, expected) => {
    expect(isSeoRunEligibleForPreparation({ state, change_request_id })).toBe(expected);
  });
});

describe("SEO run proposal-event repair eligibility", () => {
  it.each([
    ["failed linked run", "failed", "change-1", true],
    ["failed unlinked run", "failed", null, false],
    ["awaiting approval linked run", "awaiting_approval", "change-1", false],
    ["unknown linked run", "unexpected_state", "change-1", false],
  ] as const)("marks %s as repairable: %s", (_name, state, change_request_id, expected) => {
    expect(isSeoRunEligibleForProposalEventRepair({ state, change_request_id })).toBe(expected);
  });
});
