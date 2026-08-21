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

describe("a proposal to write a page AOOS cannot write", () => {
  it("says why there is nothing to approve rather than leaving a blank space", () => {
    const view = describeSuggestedAction({ kind: "write_new_page", target: "piano movers austin" });
    expect(view.executable).toBe(false);
    expect(view.unavailableReason).toMatch(/writing the page is yours/i);
  });

  it("points a keyword nobody has looked up at the keyword workspace", () => {
    const view = describeSuggestedAction({
      kind: "observe_keyword",
      target: "piano movers austin",
    });
    expect(view.link?.to).toBe("/keywords");
    expect(view.executable).toBe(false);
  });
});
