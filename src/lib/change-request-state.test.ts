import { describe, expect, it } from "vitest";

import {
  canTransition,
  decideTransition,
  describeOutcome,
  recommendationStateFor,
} from "./change-request-state";
import { describeSuggestedAction, isObservationOnly } from "./recommendation-action";

describe("change request transitions", () => {
  it("allows the intended forward path", () => {
    expect(canTransition("proposed", "approve")).toBe(true);
    expect(canTransition("applied", "verify")).toBe(true);
    expect(canTransition("applied", "roll_back")).toBe(true);
    expect(canTransition("verified", "roll_back")).toBe(true);
  });

  it("refuses invalid moves", () => {
    expect(decideTransition("proposed", "roll_back").kind).toBe("invalid");
    expect(decideTransition("proposed", "verify").kind).toBe("invalid");
    expect(decideTransition("approved", "verify").kind).toBe("invalid");
    expect(decideTransition("rejected", "approve").kind).toBe("invalid");
    expect(decideTransition("rolled_back", "verify").kind).toBe("invalid");
  });

  it("treats a replayed click as a no-op instead of a second write", () => {
    expect(decideTransition("approved", "approve")).toEqual({ kind: "noop", to: "approved" });
    expect(decideTransition("verified", "verify")).toEqual({ kind: "noop", to: "verified" });
  });

  it("gives an operator no way to label an approved change as applied", () => {
    // Applied is reached only through the rendered proof, in the database.
    expect(canTransition("approved", "verify")).toBe(false);
    expect(canTransition("approved", "roll_back")).toBe(false);
    expect(decideTransition("approved", "reject").kind).toBe("invalid");
    expect(decideTransition("approved", "approve")).toEqual({ kind: "noop", to: "approved" });
  });

  it("never lets approval imply applied, or applied imply verified", () => {
    expect(canTransition("approved", "verify")).toBe(false);
    expect(recommendationStateFor("approved")).toBe("approved");
    expect(recommendationStateFor("applied")).toBe("applied");
    expect(recommendationStateFor("verified")).toBe("verified");
    expect(recommendationStateFor("proposed")).toBeNull();
  });
});

describe("facts are not approvable", () => {
  it("marks observation rows as observation only", () => {
    expect(isObservationOnly({ observationOnly: true })).toBe(true);
    expect(isObservationOnly({})).toBe(false);
  });

  it("keeps SERP observations non executable", () => {
    expect(describeSuggestedAction({ kind: "review_competitor_evidence" }).executable).toBe(false);
  });
});

describe("outcome reporting", () => {
  it("waits before anything is applied", () => {
    expect(
      describeOutcome({ state: "approved", appliedAt: null, postChangeRows: [] }).waiting,
    ).toBe(true);
  });

  it("waits for finalized data after application", () => {
    const outcome = describeOutcome({
      state: "applied",
      appliedAt: "2026-08-11T00:00:00Z",
      postChangeRows: [],
    });
    expect(outcome.waiting).toBe(true);
    expect(outcome.message).toContain("Waiting for finalized post-change Search Console data");
  });

  it("stops waiting only when rows exist", () => {
    const outcome = describeOutcome({
      state: "applied",
      appliedAt: "2026-08-11T00:00:00Z",
      postChangeRows: [{ query: "employee relocation movers" }],
    });
    expect(outcome.waiting).toBe(false);
  });
});
