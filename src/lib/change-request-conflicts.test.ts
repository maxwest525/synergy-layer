import { describe, expect, it } from "vitest";

import { findInFlightSiblings, type SiblingChange } from "./change-request-conflicts";

const page = "https://trumoveinc.com/services/corporate-relocation";

function sibling(overrides: Partial<SiblingChange> & { id: string }): SiblingChange {
  return {
    title: `Change ${overrides.id}`,
    state: "proposed",
    target_url: page,
    approved_at: null,
    applied_at: null,
    ...overrides,
  };
}

describe("a second change to a page is named while the first is still in flight", () => {
  it("names an approved sibling that has not gone live yet", () => {
    const result = findInFlightSiblings({
      candidateId: "new",
      targetUrl: page,
      siblings: [
        sibling({ id: "earlier", state: "approved", approved_at: "2026-08-25T10:00:00Z" }),
      ],
      windows: [],
      todayPt: "2026-09-02",
    });
    expect(result).toEqual([
      {
        id: "earlier",
        title: "Change earlier",
        state: "approved",
        since: "2026-08-25T10:00:00Z",
        measurementReadableAfter: null,
        reason: "approved and waiting to go live",
      },
    ]);
  });

  it("names a live sibling whose measurement window has not finished", () => {
    const result = findInFlightSiblings({
      candidateId: "new",
      targetUrl: page,
      siblings: [sibling({ id: "live", state: "applied", applied_at: "2026-08-14T09:00:00Z" })],
      windows: [
        { change_request_id: "live", available_after_pt: "2026-08-29" },
        { change_request_id: "live", available_after_pt: "2026-09-12" },
      ],
      todayPt: "2026-09-02",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.measurementReadableAfter).toBe("2026-09-12");
    expect(result[0]?.reason).toBe("live and still inside its measurement window until 2026-09-12");
  });

  it("does not name a live sibling once every window is readable", () => {
    const result = findInFlightSiblings({
      candidateId: "new",
      targetUrl: page,
      siblings: [sibling({ id: "done", state: "applied", applied_at: "2026-06-01T09:00:00Z" })],
      windows: [{ change_request_id: "done", available_after_pt: "2026-09-01" }],
      todayPt: "2026-09-02",
    });
    expect(result).toEqual([]);
  });

  it("does not name a live sibling that has no measurement window at all", () => {
    // A crawl-directives change is graded on indexation and carries no windows;
    // nothing about it makes a wording change to the same page unattributable.
    const result = findInFlightSiblings({
      candidateId: "new",
      targetUrl: page,
      siblings: [sibling({ id: "robots", state: "applied", applied_at: "2026-08-20T09:00:00Z" })],
      windows: [],
      todayPt: "2026-09-02",
    });
    expect(result).toEqual([]);
  });

  it("ignores proposed, verified, rejected and rolled back siblings, the candidate itself, and other pages", () => {
    const result = findInFlightSiblings({
      candidateId: "new",
      targetUrl: page,
      siblings: [
        sibling({ id: "new", state: "approved", approved_at: "2026-09-01T00:00:00Z" }),
        sibling({ id: "queued", state: "proposed" }),
        sibling({ id: "measured", state: "verified", applied_at: "2026-07-01T00:00:00Z" }),
        sibling({ id: "gone", state: "rejected" }),
        sibling({ id: "undone", state: "rolled_back", applied_at: "2026-08-11T00:00:00Z" }),
        sibling({
          id: "other-page",
          state: "approved",
          approved_at: "2026-08-30T00:00:00Z",
          target_url: "https://trumoveinc.com/research",
        }),
      ],
      windows: [{ change_request_id: "undone", available_after_pt: "2026-12-01" }],
      todayPt: "2026-09-02",
    });
    expect(result).toEqual([]);
  });

  it("lists the most recent sibling first", () => {
    const result = findInFlightSiblings({
      candidateId: "new",
      targetUrl: page,
      siblings: [
        sibling({ id: "older", state: "approved", approved_at: "2026-08-20T00:00:00Z" }),
        sibling({ id: "newer", state: "approved", approved_at: "2026-08-29T00:00:00Z" }),
      ],
      windows: [],
      todayPt: "2026-09-02",
    });
    expect(result.map((s) => s.id)).toEqual(["newer", "older"]);
  });
});
