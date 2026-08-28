import { describe, expect, it } from "vitest";

import {
  gradeCrawlDirectiveChange,
  isBlocked,
  isIndexed,
  type InspectionReading,
} from "./crawl-directive-outcome";

function reading(overrides: Partial<InspectionReading> = {}): InspectionReading {
  return {
    url: "https://trumoveinc.com/services/corporate-relocation",
    pageFetchState: "SUCCESSFUL",
    coverageState: "Submitted and indexed",
    inspectedAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("a robots change is graded on being let in, not on clicks", () => {
  it("says the pages can be read and are in the index", () => {
    const outcome = gradeCrawlDirectiveChange({
      affectedUrls: ["https://trumoveinc.com/a"],
      after: [reading({ url: "https://trumoveinc.com/a" })],
    });
    expect(outcome.verdict).toBe("unblocked_and_indexed");
    expect(outcome.pagesIndexed).toBe(1);
  });

  it("separates being allowed in from being kept, which Google decides separately", () => {
    // Google's own wording: crawl directives control what it may read, not
    // what it chooses to index. A crawled-and-not-indexed page is not a
    // failure of the robots edit and is not reported as one.
    const outcome = gradeCrawlDirectiveChange({
      affectedUrls: ["https://trumoveinc.com/a"],
      after: [
        reading({
          url: "https://trumoveinc.com/a",
          coverageState: "Crawled - currently not indexed",
        }),
      ],
    });
    expect(outcome.verdict).toBe("unblocked_not_yet_indexed");
    expect(outcome.reason).toMatch(/choice Google makes separately/i);
    expect(outcome.reason).not.toMatch(/fail/i);
  });

  it("reports a page that is still blocked after the edit went live", () => {
    const outcome = gradeCrawlDirectiveChange({
      affectedUrls: ["https://trumoveinc.com/a", "https://trumoveinc.com/b"],
      after: [
        reading({ url: "https://trumoveinc.com/a", pageFetchState: "BLOCKED_ROBOTS_TXT" }),
        reading({ url: "https://trumoveinc.com/b" }),
      ],
    });
    expect(outcome.verdict).toBe("still_blocked");
    expect(outcome.pagesStillBlocked).toBe(1);
    expect(outcome.reason).toMatch(/something else is stopping Google/i);
  });
});

describe("absence is never read as success", () => {
  it("says nothing has been read yet rather than calling it unblocked", () => {
    const outcome = gradeCrawlDirectiveChange({
      affectedUrls: ["https://trumoveinc.com/a"],
      after: [],
    });
    expect(outcome.verdict).toBe("not_yet_inspected");
    expect(outcome.pagesNotInspected).toBe(1);
  });

  it("refuses to grade a change that never recorded which pages it was for", () => {
    const outcome = gradeCrawlDirectiveChange({ affectedUrls: [], after: [reading()] });
    expect(outcome.verdict).toBe("unmeasurable");
    expect(outcome.reason).toMatch(/did not record which pages/i);
  });
});

describe("reading Search Console's own states", () => {
  it("treats the robots block as blocked however it is reported", () => {
    expect(isBlocked(reading({ pageFetchState: "BLOCKED_ROBOTS_TXT" }))).toBe(true);
    expect(
      isBlocked(reading({ pageFetchState: null, coverageState: "Blocked by robots.txt" })),
    ).toBe(true);
    expect(isBlocked(reading())).toBe(false);
  });

  it("counts both ways a page can be in the index", () => {
    expect(isIndexed(reading({ coverageState: "Submitted and indexed" }))).toBe(true);
    expect(isIndexed(reading({ coverageState: "Indexed, not submitted in sitemap" }))).toBe(true);
    expect(isIndexed(reading({ coverageState: "Crawled - currently not indexed" }))).toBe(false);
  });
});

describe("only the newest reading of a page counts", () => {
  it("uses the latest inspection when a page was checked twice", () => {
    const outcome = gradeCrawlDirectiveChange({
      affectedUrls: ["https://trumoveinc.com/a"],
      after: [
        reading({
          url: "https://trumoveinc.com/a",
          pageFetchState: "BLOCKED_ROBOTS_TXT",
          inspectedAt: "2026-08-19T10:00:00.000Z",
        }),
        reading({ url: "https://trumoveinc.com/a", inspectedAt: "2026-08-21T10:00:00.000Z" }),
      ],
    });
    expect(outcome.verdict).toBe("unblocked_and_indexed");
  });
});
