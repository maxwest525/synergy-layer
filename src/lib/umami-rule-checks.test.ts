import { describe, expect, it } from "vitest";

import {
  detectReferrerSourceStopped,
  detectSiteTrafficShift,
  detectZeroRecorded,
  pairNonOverlappingWindows,
  parseReferrerRows,
  parseStatsTotals,
  UMAMI_RULE_THRESHOLDS,
  type UmamiReferrerWindowReading,
  type UmamiStatsSnapshot,
  type UmamiStatsWindowReading,
} from "./umami-rule-checks";

const WEBSITE = "site-1";

function window(endIso: string, days = 28) {
  const periodEnd = new Date(endIso).toISOString();
  const periodStart = new Date(
    new Date(endIso).getTime() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  return { periodStart, periodEnd };
}

function statsSnapshot(overrides: Partial<UmamiStatsSnapshot> = {}): UmamiStatsSnapshot {
  return {
    websiteId: WEBSITE,
    websiteName: "TruMove",
    runId: "run-1",
    runStatus: "succeeded",
    returnedRowCount: 3,
    totals: {
      pageviews: { value: 0, prev: 0 },
      visitors: { value: 0, prev: 0 },
      visits: { value: 0, prev: 0 },
    },
    ...window("2026-08-18"),
    ownedMatch: true,
    ...overrides,
  };
}

describe("parseStatsTotals", () => {
  it("drops an entry whose value does not parse, rather than treating it as zero", () => {
    const parsed = parseStatsTotals({
      visitors: { value: 5, prev: 0 },
      visits: { value: "not-a-number", prev: 0 },
    });
    expect(parsed).toEqual({ visitors: 5 });
  });

  it("returns null for a row that is not an object at all", () => {
    expect(parseStatsTotals("garbage")).toBeNull();
    expect(parseStatsTotals(null)).toBeNull();
    expect(parseStatsTotals([1, 2, 3])).toBeNull();
  });

  it("returns an empty object for a genuinely empty reading", () => {
    expect(parseStatsTotals({})).toEqual({});
  });
});

describe("parseReferrerRows", () => {
  it("drops a row with a missing count, rather than treating it as zero", () => {
    const parsed = parseReferrerRows({
      rows: [
        { label: "example.com", count: 12 },
        { label: "bad.com", count: "nope" },
      ],
    });
    expect(parsed).toEqual([{ label: "example.com", count: 12 }]);
  });

  it("returns null when the payload has no readable rows array", () => {
    expect(parseReferrerRows({})).toBeNull();
    expect(parseReferrerRows("garbage")).toBeNull();
  });
});

describe("pairNonOverlappingWindows", () => {
  it("returns null with a single reading", () => {
    expect(pairNonOverlappingWindows([{ websiteId: WEBSITE, ...window("2026-08-18") }])).toBeNull();
  });

  it("returns null when the two stored windows overlap", () => {
    // A weekly refresh 7 days apart still shares 21 of 28 days.
    const current = { websiteId: WEBSITE, ...window("2026-08-18") };
    const prior = { websiteId: WEBSITE, ...window("2026-08-11") };
    expect(pairNonOverlappingWindows([current, prior])).toBeNull();
  });

  it("returns null when a same-length candidate is not the newest but does not overlap either, if a closer overlapping one exists first", () => {
    // Sanity: three readings, newest overlaps, older is a clean non-overlap.
    const current = { websiteId: WEBSITE, ...window("2026-08-18") };
    const overlapping = { websiteId: WEBSITE, ...window("2026-08-11") };
    const clean = { websiteId: WEBSITE, ...window("2026-07-21") };
    const paired = pairNonOverlappingWindows([current, overlapping, clean]);
    expect(paired?.prior).toBe(clean);
  });

  it("pairs two genuinely non-overlapping, same-length windows", () => {
    const current = { websiteId: WEBSITE, ...window("2026-08-18") };
    const prior = { websiteId: WEBSITE, ...window("2026-07-21") }; // 28 days earlier, ends exactly at current's start
    const paired = pairNonOverlappingWindows([current, prior]);
    expect(paired).toEqual({ current, prior });
  });

  it("rejects a prior window of a materially different length", () => {
    const current = { websiteId: WEBSITE, ...window("2026-08-18", 28) };
    const prior = { websiteId: WEBSITE, ...window("2026-07-21", 7) };
    expect(pairNonOverlappingWindows([current, prior])).toBeNull();
  });
});

describe("detectZeroRecorded", () => {
  it("fires when a succeeded run returned counters that all read zero", () => {
    const drafts = detectZeroRecorded([statsSnapshot()]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("umami_zero_recorded");
    expect(drafts[0]?.target).toBe(WEBSITE);
    expect(drafts[0]?.title).toContain("Your Umami instance");
    expect(drafts[0]?.description).toContain("no pageviews, no visitors, no visits");
    expect(drafts[0]?.confidence).toBe(UMAMI_RULE_THRESHOLDS.zeroRecorded.confidence);
  });

  it("says 'The Umami instance' rather than 'Your' when the website did not match an owned asset", () => {
    const drafts = detectZeroRecorded([statsSnapshot({ ownedMatch: false })]);
    expect(drafts[0]?.title).toContain("The Umami instance");
    expect(drafts[0]?.title).not.toContain("Your");
  });

  it("only names the counters that actually came back", () => {
    const drafts = detectZeroRecorded([
      statsSnapshot({ totals: { visitors: { value: 0, prev: 0 } } }),
    ]);
    expect(drafts[0]?.description).toContain("no visitors");
    expect(drafts[0]?.description).not.toContain("pageviews");
    expect(drafts[0]?.evidence["recordedCounters"]).toEqual(["visitors"]);
  });

  it("stays silent when any counter is non-zero", () => {
    const drafts = detectZeroRecorded([
      statsSnapshot({ totals: { visitors: { value: 4, prev: 0 } } }),
    ]);
    expect(drafts).toHaveLength(0);
  });

  it("stays silent when the run has not succeeded", () => {
    const drafts = detectZeroRecorded([statsSnapshot({ runStatus: "failed" })]);
    expect(drafts).toHaveLength(0);
  });

  it("stays silent when run_id is null, even if the row otherwise looks like a clean zero", () => {
    const drafts = detectZeroRecorded([statsSnapshot({ runId: null, runStatus: "succeeded" })]);
    expect(drafts).toHaveLength(0);
  });

  it("stays silent on a malformed totals column rather than inventing a reading", () => {
    const drafts = detectZeroRecorded([statsSnapshot({ totals: "not-an-object" })]);
    expect(drafts).toHaveLength(0);
  });

  it("stays silent when totals came back with no keys at all", () => {
    const drafts = detectZeroRecorded([statsSnapshot({ totals: {} })]);
    expect(drafts).toHaveLength(0);
  });

  it("only reads the newest row when several are stored for the same website", () => {
    const older = statsSnapshot({
      ...window("2026-07-21"),
      totals: { visitors: { value: 40, prev: 0 } },
    });
    const newer = statsSnapshot({ ...window("2026-08-18") });
    const drafts = detectZeroRecorded([older, newer]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.evidence["periodEnd"]).toBe(newer.periodEnd);
  });
});

function trafficReading(overrides: Partial<UmamiStatsWindowReading> = {}): UmamiStatsWindowReading {
  return {
    websiteId: WEBSITE,
    websiteName: "TruMove",
    ...window("2026-08-18"),
    visitors: 412,
    pageviews: 900,
    ...overrides,
  };
}

describe("detectSiteTrafficShift", () => {
  it("fires on a real fall between two non-overlapping windows", () => {
    const current = trafficReading({ visitors: 50, ...window("2026-08-18") });
    const prior = trafficReading({ visitors: 100, ...window("2026-07-21") });
    const drafts = detectSiteTrafficShift([current, prior]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("umami_site_traffic_shift");
    expect(drafts[0]?.businessImpact).toBe("high");
    expect(drafts[0]?.description).toContain("fell from 100 to 50");
  });

  it("fires on a real rise and grades it medium impact", () => {
    const current = trafficReading({ visitors: 200, ...window("2026-08-18") });
    const prior = trafficReading({ visitors: 100, ...window("2026-07-21") });
    const drafts = detectSiteTrafficShift([current, prior]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.businessImpact).toBe("medium");
  });

  it("stays silent with only one stored window", () => {
    const drafts = detectSiteTrafficShift([trafficReading()]);
    expect(drafts).toHaveLength(0);
  });

  it("stays silent when the two stored windows overlap", () => {
    const current = trafficReading({ visitors: 50, ...window("2026-08-18") });
    const prior = trafficReading({ visitors: 100, ...window("2026-08-11") });
    expect(detectSiteTrafficShift([current, prior])).toHaveLength(0);
  });

  it("stays silent below MIN_BASELINE, however dramatic the move looks", () => {
    const current = trafficReading({ visitors: 1, ...window("2026-08-18") });
    const prior = trafficReading({ visitors: 8, ...window("2026-07-21") });
    expect(detectSiteTrafficShift([current, prior])).toHaveLength(0);
  });

  it("stays silent when the move is inside ordinary noise at this volume", () => {
    const current = trafficReading({ visitors: 18, ...window("2026-08-18") });
    const prior = trafficReading({ visitors: 20, ...window("2026-07-21") });
    expect(detectSiteTrafficShift([current, prior])).toHaveLength(0);
  });

  it("stays silent when visitors could not be parsed from the stored row", () => {
    const current = trafficReading({ visitors: null, ...window("2026-08-18") });
    const prior = trafficReading({ visitors: 100, ...window("2026-07-21") });
    expect(detectSiteTrafficShift([current, prior])).toHaveLength(0);
  });

  it("names both possibilities when the current window reads zero or near zero", () => {
    const current = trafficReading({ visitors: 0, ...window("2026-08-18") });
    const prior = trafficReading({ visitors: 400, ...window("2026-07-21") });
    const drafts = detectSiteTrafficShift([current, prior]);
    expect(drafts[0]?.description).toContain("script no longer being on the site");
  });

  it("notes a lapse in collection when the gap between windows exceeds a window length", () => {
    const current = trafficReading({ visitors: 50, ...window("2026-09-30") });
    const prior = trafficReading({ visitors: 100, ...window("2026-07-21") });
    const drafts = detectSiteTrafficShift([current, prior]);
    expect(drafts[0]?.evidence["collectionLapsed"]).toBe(true);
    expect(drafts[0]?.description).toContain("Collection lapsed");
  });
});

function referrerReading(
  overrides: Partial<UmamiReferrerWindowReading> = {},
): UmamiReferrerWindowReading {
  return {
    websiteId: WEBSITE,
    websiteName: "TruMove",
    ...window("2026-08-18"),
    returnedRowCount: 2,
    rows: [{ label: "example.com", count: 5 }],
    ...overrides,
  };
}

describe("detectReferrerSourceStopped", () => {
  it("fires when a referrer with real volume vanishes from a complete current list", () => {
    const prior = referrerReading({
      ...window("2026-07-21"),
      rows: [{ label: "example.com", count: 46 }],
      returnedRowCount: 1,
    });
    const current = referrerReading({
      ...window("2026-08-18"),
      rows: [{ label: "other.com", count: 3 }],
      returnedRowCount: 1,
    });
    const drafts = detectReferrerSourceStopped([current, prior]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("umami_referrer_source_stopped");
    expect(drafts[0]?.target).toBe(`${WEBSITE} :: example.com`);
    expect(drafts[0]?.description).toContain("46");
  });

  it("stays silent below MIN_BASELINE", () => {
    const prior = referrerReading({
      ...window("2026-07-21"),
      rows: [{ label: "example.com", count: 4 }],
    });
    const current = referrerReading({ ...window("2026-08-18"), rows: [] });
    // An empty current list is also the site-wide collapse guard; use a
    // non-empty, unrelated current list to isolate the baseline guard.
    const currentWithOther = referrerReading({
      ...window("2026-08-18"),
      rows: [{ label: "other.com", count: 3 }],
    });
    expect(detectReferrerSourceStopped([current, prior])).toHaveLength(0);
    expect(detectReferrerSourceStopped([currentWithOther, prior])).toHaveLength(0);
  });

  it("excludes the empty and '(none)' referrer buckets", () => {
    const prior = referrerReading({
      ...window("2026-07-21"),
      rows: [
        { label: "(none)", count: 50 },
        { label: "", count: 50 },
      ],
    });
    const current = referrerReading({
      ...window("2026-08-18"),
      rows: [{ label: "other.com", count: 1 }],
    });
    expect(detectReferrerSourceStopped([current, prior])).toHaveLength(0);
  });

  it("stays silent when the current list is truncated at the fetch limit", () => {
    const prior = referrerReading({
      ...window("2026-07-21"),
      rows: [{ label: "example.com", count: 46 }],
    });
    const current = referrerReading({
      ...window("2026-08-18"),
      rows: Array.from({ length: UMAMI_RULE_THRESHOLDS.referrer.appSliceLimit }, (_, i) => ({
        label: `site-${i}.com`,
        count: 1,
      })),
      returnedRowCount: UMAMI_RULE_THRESHOLDS.referrer.appSliceLimit,
    });
    expect(detectReferrerSourceStopped([current, prior])).toHaveLength(0);
  });

  it("suppresses every referrer finding on a site-wide collapse to an empty current list", () => {
    const prior = referrerReading({
      ...window("2026-07-21"),
      rows: [
        { label: "example.com", count: 46 },
        { label: "other.com", count: 30 },
      ],
    });
    const current = referrerReading({ ...window("2026-08-18"), rows: [], returnedRowCount: 0 });
    expect(detectReferrerSourceStopped([current, prior])).toHaveLength(0);
  });

  it("caps findings per run", () => {
    const prior = referrerReading({
      ...window("2026-07-21"),
      rows: Array.from({ length: 30 }, (_, i) => ({ label: `gone-${i}.com`, count: 20 })),
    });
    const current = referrerReading({
      ...window("2026-08-18"),
      rows: [{ label: "still-here.com", count: 5 }],
    });
    const drafts = detectReferrerSourceStopped([current, prior]);
    expect(drafts).toHaveLength(UMAMI_RULE_THRESHOLDS.referrer.maxFindingsPerRun);
  });

  it("stays silent on a malformed payload rather than inventing a reading", () => {
    const prior = referrerReading({ ...window("2026-07-21"), rows: null });
    const current = referrerReading({ ...window("2026-08-18") });
    expect(detectReferrerSourceStopped([current, prior])).toHaveLength(0);
  });
});
