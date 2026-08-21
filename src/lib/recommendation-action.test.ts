import { describe, expect, it } from "vitest";

import { describeSuggestedAction } from "./recommendation-action";

const KINDS = [
  "review_competitor_evidence",
  "review_coverage_gap",
  "review",
  "authorise_capability",
  "index_collection",
  "something_nobody_wired",
];

describe("a row that cannot be approved says so, in one sentence", () => {
  it.each(KINDS)("gives %s a reason the operator can read", (kind) => {
    const view = describeSuggestedAction({ kind });
    expect(view.executable).toBe(false);
    expect(view.unavailableReason).not.toBeNull();
    expect(view.unavailableReason?.length ?? 0).toBeGreaterThan(20);
  });

  it("never carries a reason without also refusing", () => {
    for (const kind of KINDS) {
      const view = describeSuggestedAction({ kind });
      expect(view.executable === false && view.unavailableReason !== null).toBe(true);
    }
  });

  it("keeps the competitor queue as the place the real decision is made", () => {
    const view = describeSuggestedAction({ kind: "review_competitor_evidence" });
    expect(view.link?.to).toBe("/competitors");
  });

  it("does not name a stored kind in the reason the operator reads", () => {
    for (const kind of KINDS) {
      expect(describeSuggestedAction({ kind }).unavailableReason).not.toContain(kind);
    }
  });
});
