import { describe, expect, it } from "vitest";

import { isSeoRunEligibleForPreparation } from "./eligibility";

describe("SEO run preparation eligibility", () => {
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
