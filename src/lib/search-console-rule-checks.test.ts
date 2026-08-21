import { describe, expect, it } from "vitest";

import {
  detectInspectionDrift,
  detectQueryCoverageGaps,
  detectQueryOverlap,
  detectZeroImpressionPages,
  QUERY_DIMENSION_CAVEAT,
} from "./search-console-rule-checks";

const row = (keys: string[], impressions: number, position: number, clicks = 0) => ({
  keys,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position,
});

describe("detectQueryOverlap", () => {
  it("flags a query split across two pages when neither ranks well", () => {
    const drafts = detectQueryOverlap([
      row(["https://site.com/a", "movers miami"], 60, 9.2),
      row(["https://site.com/b", "movers miami"], 40, 12.5),
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("possible_query_overlap");
    expect(drafts[0]?.target).toBe("movers miami");
    expect(drafts[0]?.evidence["pages"]).toHaveLength(2);
  });

  it("stays quiet when one page already holds a top position", () => {
    const drafts = detectQueryOverlap([
      row(["https://site.com/a", "movers miami"], 60, 3.1),
      row(["https://site.com/b", "movers miami"], 40, 14.0),
    ]);
    expect(drafts).toHaveLength(0);
  });

  it("ignores pages below the impression floor", () => {
    const drafts = detectQueryOverlap([
      row(["https://site.com/a", "movers miami"], 60, 9.2),
      row(["https://site.com/b", "movers miami"], 5, 12.5),
    ]);
    expect(drafts).toHaveLength(0);
  });
});

describe("detectZeroImpressionPages", () => {
  it("flags audited pages absent from the page snapshot", () => {
    const drafts = detectZeroImpressionPages(
      ["https://site.com/a", "https://site.com/ghost"],
      [row(["https://site.com/a"], 100, 4)],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.target).toBe("https://site.com/ghost");
    expect(drafts[0]?.rule).toBe("zero_impression_page");
  });

  it("caps findings per run", () => {
    const ghosts = Array.from({ length: 40 }, (_, i) => `https://site.com/ghost-${i}`);
    const drafts = detectZeroImpressionPages(ghosts, []);
    expect(drafts).toHaveLength(20);
  });
});

describe("detectQueryCoverageGaps", () => {
  const meta = new Map([
    [
      "https://site.com/moving",
      { url: "https://site.com/moving", title: "Local Moving Services", h1: "Moving made easy" },
    ],
  ]);

  it("flags a ranking query whose words are absent from title and h1", () => {
    const drafts = detectQueryCoverageGaps(
      [row(["https://site.com/moving", "piano transport cost"], 50, 11)],
      meta,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("query_coverage_gap");
    expect(drafts[0]?.target).toBe("https://site.com/moving :: piano transport cost");
  });

  it("discloses that the query dimension is a censored sample", () => {
    const drafts = detectQueryCoverageGaps(
      [row(["https://site.com/moving", "piano transport cost"], 50, 11)],
      meta,
    );
    expect(drafts[0]?.description).toContain(QUERY_DIMENSION_CAVEAT);
  });

  it("stays quiet when any query word is covered", () => {
    const drafts = detectQueryCoverageGaps(
      [row(["https://site.com/moving", "moving cost"], 50, 11)],
      meta,
    );
    expect(drafts).toHaveLength(0);
  });

  it("ignores queries outside the striking range or impression floor", () => {
    const drafts = detectQueryCoverageGaps(
      [
        row(["https://site.com/moving", "piano transport cost"], 50, 2),
        row(["https://site.com/moving", "piano transport cost"], 3, 11),
      ],
      meta,
    );
    expect(drafts).toHaveLength(0);
  });

  it("skips pages with no stored metadata", () => {
    const drafts = detectQueryCoverageGaps(
      [row(["https://site.com/unknown", "piano transport cost"], 50, 11)],
      meta,
    );
    expect(drafts).toHaveLength(0);
  });
});

describe("detectInspectionDrift", () => {
  const now = new Date("2026-08-19T00:00:00Z");
  const base = {
    coverageState: null,
    indexingState: null,
    googleCanonical: null,
    userCanonical: null,
    lastCrawlTime: null,
  };

  it("flags a non-PASS verdict as not indexed", () => {
    const drafts = detectInspectionDrift(
      [{ ...base, inspectedUrl: "https://site.com/a", verdict: "NEUTRAL" }],
      now,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.businessImpact).toBe("high");
    expect(drafts[0]?.confidence).toBe(0.9);
  });

  it("flags a canonical mismatch", () => {
    const drafts = detectInspectionDrift(
      [
        {
          ...base,
          inspectedUrl: "https://site.com/a",
          verdict: "PASS",
          googleCanonical: "https://site.com/b",
          userCanonical: "https://site.com/a",
        },
      ],
      now,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toContain("different canonical");
  });

  it("flags a stale crawl and passes a fresh healthy page", () => {
    const drafts = detectInspectionDrift(
      [
        {
          ...base,
          inspectedUrl: "https://site.com/stale",
          verdict: "PASS",
          lastCrawlTime: "2026-06-01T00:00:00Z",
        },
        {
          ...base,
          inspectedUrl: "https://site.com/fresh",
          verdict: "PASS",
          lastCrawlTime: "2026-08-15T00:00:00Z",
        },
      ],
      now,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.target).toBe("https://site.com/stale");
  });
});
