import { describe, expect, it } from "vitest";

import {
  checkDuplicateDescriptions,
  checkDuplicateTitles,
  checkNonIndexablePages,
  checkPagesErrorStatus,
  checkRedirectChainPresent,
  toResultSnapshot,
  type OnPageResultSnapshot,
} from "./onpage-rule-checks";

/** A readable, empty-by-default snapshot. Tests override only what they need. */
function snapshot(overrides: Partial<OnPageResultSnapshot> = {}): OnPageResultSnapshot {
  return {
    totalCount: null,
    crawlProgress: "finished",
    rows: [],
    returnedRowCount: 0,
    possiblyTruncated: false,
    reportingDate: "2026-08-30",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toResultSnapshot — the defensive boundary every rule reads through
// ---------------------------------------------------------------------------

describe("toResultSnapshot", () => {
  it("reads a well-formed row", () => {
    const result = toResultSnapshot({
      totals: { totalCount: 3, crawlProgress: "finished" },
      payload: { rows: [{ url: "https://example.com/a" }] },
      returnedRowCount: 1,
      possiblyTruncated: false,
      reportingDate: "2026-08-30",
    });
    expect(result.totalCount).toBe(3);
    expect(result.crawlProgress).toBe("finished");
    expect(result.rows).toHaveLength(1);
  });

  it("never invents a value for a malformed totals/payload shape", () => {
    const result = toResultSnapshot({
      totals: "not-an-object",
      payload: { rows: "not-an-array" },
      returnedRowCount: 0,
      possiblyTruncated: false,
      reportingDate: "2026-08-30",
    });
    expect(result.totalCount).toBeNull();
    expect(result.crawlProgress).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it("treats a non-numeric totalCount and non-string crawlProgress as absent, not coerced", () => {
    const result = toResultSnapshot({
      totals: { totalCount: "12", crawlProgress: 7 },
      payload: null,
      returnedRowCount: 0,
      possiblyTruncated: false,
      reportingDate: "2026-08-30",
    });
    expect(result.totalCount).toBeNull();
    expect(result.crawlProgress).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// non_indexable_pages_found
// ---------------------------------------------------------------------------

describe("checkNonIndexablePages", () => {
  it("fires, grouped by documented consequence, when the crawl found non-indexable pages", () => {
    const drafts = checkNonIndexablePages(
      snapshot({
        totalCount: 4,
        rows: [
          { url: "https://example.com/a", reason: "meta_tag" },
          { url: "https://example.com/b", reason: "http_header" },
          { url: "https://example.com/c", reason: "robots_txt" },
          { url: "https://example.com/d", reason: "too_many_redirects" },
        ],
      }),
    );
    expect(drafts).toHaveLength(1);
    const [draft] = drafts;
    expect(draft?.rule).toBe("non_indexable_pages_found");
    expect(draft?.description).toContain("2 carry a noindex tag");
    expect(draft?.description).toContain("1 is blocked in robots.txt");
    expect(draft?.description).toContain("does not keep the address out of search results");
    expect(draft?.description).toContain("Some of these are probably meant to be hidden");
    expect(draft?.evidence["count"]).toBe(4);
  });

  it("stays silent when no onpage_non_indexable snapshot has ever been collected", () => {
    expect(checkNonIndexablePages(undefined)).toEqual([]);
  });

  it("names the reading as unknown, never zero, when a malformed row leaves both the total and the rows unusable", () => {
    const drafts = checkNonIndexablePages(
      snapshot({
        totalCount: null,
        // Not an array of records the rule can read at all.
        rows: [],
      }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("did not report how many");
    expect(drafts[0]?.confidence).toBeLessThan(0.5);
  });

  it("does not invent a value for a row whose reason is an unrecognized type", () => {
    const drafts = checkNonIndexablePages(
      snapshot({
        totalCount: 2,
        rows: [
          { url: "https://example.com/a", reason: 42 },
          "not-a-row",
          { url: "https://example.com/b", reason: "meta_tag" },
        ],
      }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.evidence["noindexCount"]).toBe(1);
    expect(drafts[0]?.evidence["unclassifiedCount"]).toBe(1);
    expect(drafts[0]?.description).not.toContain("undefined");
    expect(drafts[0]?.description).not.toContain("NaN");
  });

  it("stays silent on a measured zero", () => {
    expect(checkNonIndexablePages(snapshot({ totalCount: 0 }))).toEqual([]);
  });

  it("reports the count as a floor when only returned_row_count is available", () => {
    const drafts = checkNonIndexablePages(
      snapshot({
        totalCount: null,
        returnedRowCount: 2,
        rows: [
          { url: "https://example.com/a", reason: "robots_txt" },
          { url: "https://example.com/b", reason: "robots_txt" },
        ],
      }),
    );
    expect(drafts[0]?.title).toContain("At least 2");
    expect(drafts[0]?.evidence["isFloor"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// crawl_pages_error_status
// ---------------------------------------------------------------------------

describe("checkPagesErrorStatus", () => {
  it("fires and splits removal-band 4xx from the 429/5xx slowdown band and the 401/410 decision band", () => {
    const drafts = checkPagesErrorStatus(
      snapshot({
        rows: [
          { url: "https://example.com/a", status_code: 404 },
          { url: "https://example.com/b", status_code: 429 },
          { url: "https://example.com/c", status_code: 503 },
          { url: "https://example.com/d", status_code: 410 },
          { url: "https://example.com/e", status_code: 200 },
        ],
      }),
    );
    expect(drafts).toHaveLength(1);
    const [draft] = drafts;
    expect(draft?.evidence["hard4xxCount"]).toBe(1);
    expect(draft?.evidence["slowdownCount"]).toBe(2);
    expect(draft?.evidence["decisionCount"]).toBe(1);
    expect(draft?.description).toContain("not Googlebot");
    expect(draft?.description).toContain("Confirm whether");
  });

  it("stays silent when no onpage_pages snapshot has ever been collected", () => {
    expect(checkPagesErrorStatus(undefined)).toEqual([]);
  });

  it("treats an unreadable status_code — including the provider's 0 for a fetch that never completed — as unreadable, never as healthy", () => {
    const drafts = checkPagesErrorStatus(
      snapshot({
        rows: [
          { url: "https://example.com/a", status_code: 0 },
          { url: "https://example.com/b", status_code: "500" },
          { url: "https://example.com/c" },
          { url: "https://example.com/d", status_code: 500 },
        ],
      }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.evidence["unreadableCount"]).toBe(3);
    expect(drafts[0]?.evidence["slowdownCount"]).toBe(1);
  });

  it("says the reading is bounded when the snapshot is truncated at the row cap", () => {
    const drafts = checkPagesErrorStatus(
      snapshot({
        possiblyTruncated: true,
        rows: [{ url: "https://example.com/a", status_code: 404 }],
      }),
    );
    expect(drafts[0]?.description).toContain("first 100 addresses");
  });
});

// ---------------------------------------------------------------------------
// redirect_chain_present
// ---------------------------------------------------------------------------

describe("checkRedirectChainPresent", () => {
  it("fires on a numeric total and names a chain longer than Google's documented 10-hop default", () => {
    const drafts = checkRedirectChainPresent(
      snapshot({
        totalCount: 2,
        rows: [
          { chain: new Array(11).fill({ link_from: "a", link_to: "b" }) },
          { chain: [{ link_from: "c", link_to: "d" }] },
        ],
      }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("2 addresses");
    expect(drafts[0]?.description).toContain("11 hops");
    expect(drafts[0]?.evidence["longestChainHops"]).toBe(11);
  });

  it("names the absence in words, never as a zero, when no redirect-chain snapshot has ever been collected", () => {
    const drafts = checkRedirectChainPresent(undefined);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("has not reported on redirects");
  });

  it("does not invent a chain length from a malformed row, and still fires on the known total", () => {
    const drafts = checkRedirectChainPresent(
      snapshot({
        totalCount: 1,
        rows: ["not-a-row", { chain: "not-an-array" }, { chain: null }],
      }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.evidence["longestChainHops"]).toBeNull();
    expect(drafts[0]?.description).not.toContain("undefined");
  });

  it("says nothing on a measured zero", () => {
    expect(checkRedirectChainPresent(snapshot({ totalCount: 0 }))).toEqual([]);
  });

  it("names the reading as unknown rather than zero when the total did not come back", () => {
    const drafts = checkRedirectChainPresent(snapshot({ totalCount: null }));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("did not report how many");
  });

  it("reports a partial reading, not the site's figure, while the crawl is still running", () => {
    const drafts = checkRedirectChainPresent(
      snapshot({ totalCount: 5, crawlProgress: "in_progress" }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("still running");
  });

  it("renders the count as a floor when the result is truncated", () => {
    const drafts = checkRedirectChainPresent(
      snapshot({ totalCount: 100, possiblyTruncated: true }),
    );
    expect(drafts[0]?.title).toContain("At least 100");
  });
});

// ---------------------------------------------------------------------------
// duplicate_titles_across_pages / duplicate_descriptions_across_pages
// ---------------------------------------------------------------------------

describe.each([
  ["duplicate_titles_across_pages", checkDuplicateTitles, "tab title"] as const,
  [
    "duplicate_descriptions_across_pages",
    checkDuplicateDescriptions,
    "search description",
  ] as const,
])("%s", (ruleId, check, noun) => {
  it("fires on returned_row_count, since total_items_count is always null for this endpoint", () => {
    const drafts = check(
      snapshot({ totalCount: null, returnedRowCount: 3, crawlProgress: "finished" }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe(ruleId);
    expect(drafts[0]?.title).toContain("3 sets");
    expect(drafts[0]?.description).toContain(noun);
  });

  it("names the absence in words, never as zero duplicates, when no snapshot has ever been collected", () => {
    const drafts = check(undefined);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title.toLowerCase()).toContain("has not checked");
  });

  it("names the reading as unreadable, not a clean zero, when neither crawlProgress nor a count came back", () => {
    const drafts = check(
      snapshot({ totalCount: null, crawlProgress: null, returnedRowCount: 0, rows: [] }),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.confidence).toBeLessThan(0.5);
  });

  it("treats a genuine zero-row reading from a finished crawl as a measured, healthy zero", () => {
    expect(
      check(snapshot({ totalCount: null, crawlProgress: "finished", returnedRowCount: 0 })),
    ).toEqual([]);
  });

  it("renders the count as a floor when the result is truncated", () => {
    const drafts = check(
      snapshot({
        totalCount: null,
        returnedRowCount: 2,
        possiblyTruncated: true,
        crawlProgress: "finished",
      }),
    );
    expect(drafts[0]?.title).toContain("At least 2");
  });
});
