import { describe, expect, it } from "vitest";

import { deriveStatus, emptyStateCopy } from "./os-status";

describe("deriveStatus", () => {
  it("calls a provider working only when real evidence is stored", () => {
    expect(deriveStatus({ configured: true, storedEvidence: 103 }).key).toBe("working");
  });

  it("calls configured credentials with no reads unproven", () => {
    expect(deriveStatus({ configured: true, storedEvidence: 0 }).key).toBe("unproven");
  });

  it("calls a recorded failure broken even when evidence exists", () => {
    expect(
      deriveStatus({ configured: true, storedEvidence: 4, lastFailure: "quota exceeded" }).key,
    ).toBe("broken");
  });

  it("calls a missing capability unmeasurable", () => {
    expect(
      deriveStatus({ configured: false, storedEvidence: 0, capabilityMissing: true }).key,
    ).toBe("unmeasurable");
  });

  it("never reports zero rows as a real result", () => {
    expect(deriveStatus({ configured: false, storedEvidence: 0 }).key).toBe("unmeasurable");
  });
});

describe("emptyStateCopy", () => {
  it("names the run that would prove an unproven provider", () => {
    const copy = emptyStateCopy(deriveStatus({ configured: true, storedEvidence: 0 }), "GA4 daily read");
    expect(copy).toContain("GA4 daily read");
  });
});
