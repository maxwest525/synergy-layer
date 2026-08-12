import { describe, expect, it } from "vitest";

import {
  buildPeriodComparison,
  materializeDailyTotals,
  normalizeInspection,
  normalizeOwnedUrl,
} from "./search-console";

describe("Search Console owned URL validation", () => {
  it("accepts pages covered by a domain property and removes fragments", () => {
    expect(
      normalizeOwnedUrl(
        "sc-domain:trumoveinc.com",
        "https://www.trumoveinc.com/services/corporate-relocation#quote",
      ),
    ).toBe("https://www.trumoveinc.com/services/corporate-relocation");
  });

  it("rejects lookalike domains and pages outside a URL-prefix property", () => {
    expect(() =>
      normalizeOwnedUrl("sc-domain:trumoveinc.com", "https://eviltrumoveinc.com/sitemap.xml"),
    ).toThrow(/selected Search Console property/i);
    expect(() =>
      normalizeOwnedUrl("https://trumoveinc.com/services/", "https://trumoveinc.com/blog/post"),
    ).toThrow(/selected Search Console property/i);
  });
});

describe("URL Inspection normalization", () => {
  it("keeps the index verdict, canonical URLs, crawl facts, and result link", () => {
    expect(
      normalizeInspection({
        inspectionResult: {
          inspectionResultLink: "https://search.google.com/search-console/inspect/example",
          indexStatusResult: {
            verdict: "PASS",
            coverageState: "Submitted and indexed",
            robotsTxtState: "ALLOWED",
            indexingState: "INDEXING_ALLOWED",
            pageFetchState: "SUCCESSFUL",
            lastCrawlTime: "2026-08-10T12:00:00Z",
            googleCanonical: "https://trumoveinc.com/services/corporate-relocation",
            userCanonical: "https://trumoveinc.com/services/corporate-relocation",
            crawledAs: "MOBILE",
            sitemap: ["https://trumoveinc.com/sitemap.xml"],
            referringUrls: ["https://trumoveinc.com/services"],
          },
          mobileUsabilityResult: { verdict: "PASS" },
          richResultsResult: { verdict: "NEUTRAL" },
        },
      }),
    ).toEqual({
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      robotsTxtState: "ALLOWED",
      indexingState: "INDEXING_ALLOWED",
      pageFetchState: "SUCCESSFUL",
      lastCrawlTime: "2026-08-10T12:00:00Z",
      googleCanonical: "https://trumoveinc.com/services/corporate-relocation",
      userCanonical: "https://trumoveinc.com/services/corporate-relocation",
      crawledAs: "MOBILE",
      sitemaps: ["https://trumoveinc.com/sitemap.xml"],
      referringUrls: ["https://trumoveinc.com/services"],
      inspectionResultLink: "https://search.google.com/search-console/inspect/example",
      mobileUsabilityVerdict: "PASS",
      richResultsVerdict: "NEUTRAL",
    });
  });

  it("does not invent missing inspection fields", () => {
    expect(normalizeInspection({ inspectionResult: {} })).toMatchObject({
      verdict: "UNKNOWN",
      coverageState: null,
      googleCanonical: null,
      sitemaps: [],
      referringUrls: [],
    });
  });
});

describe("daily totals backfill", () => {
  it("materializes every calendar day and records omitted API days as zero-volume days", () => {
    expect(
      materializeDailyTotals(
        [
          {
            keys: ["2026-08-02"],
            clicks: 2,
            impressions: 20,
            ctr: 0.1,
            position: 8,
          },
        ],
        "2026-08-01",
        "2026-08-03",
      ),
    ).toEqual([
      { date: "2026-08-01", clicks: 0, impressions: 0, ctr: null, position: null },
      { date: "2026-08-02", clicks: 2, impressions: 20, ctr: 0.1, position: 8 },
      { date: "2026-08-03", clicks: 0, impressions: 0, ctr: null, position: null },
    ]);
  });
});

describe("28-day period comparison", () => {
  const day = (date: string, clicks: number, impressions: number, position: number) => ({
    date,
    clicks,
    impressions,
    ctr: impressions === 0 ? 0 : clicks / impressions,
    position,
    collectedAt: "2026-08-11T00:00:00Z",
  });

  it("compares two complete consecutive 28-day periods", () => {
    const rows = materializeDailyTotals([], "2026-06-15", "2026-08-09").map((row, index) =>
      index < 28 ? day(row.date, 1, 10, 20) : day(row.date, 2, 20, 10),
    );
    const result = buildPeriodComparison(rows);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.previous).toMatchObject({
      startDate: "2026-06-15",
      endDate: "2026-07-12",
      clicks: 28,
      impressions: 280,
      ctr: 0.1,
      position: 20,
    });
    expect(result.current).toMatchObject({
      startDate: "2026-07-13",
      endDate: "2026-08-09",
      clicks: 56,
      impressions: 560,
      ctr: 0.1,
      position: 10,
    });
    expect(result.change).toEqual({
      clicksPercent: 100,
      impressionsPercent: 100,
      ctrPoints: 0,
      position: -10,
    });
  });

  it("refuses to label a sparse set of dates as a trend", () => {
    expect(buildPeriodComparison([day("2026-08-09", 2, 20, 10)])).toEqual({
      status: "insufficient",
      availableDays: 1,
      requiredDays: 56,
      latestDate: "2026-08-09",
    });
  });
});
