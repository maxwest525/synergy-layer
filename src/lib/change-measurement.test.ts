import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  approvalBaselineWindow,
  buildGscWindowObservation,
  findMeasurementContradictions,
  outcomeWindow,
  ptDate,
  SOURCE_ROLES,
} from "./change-measurement";

describe("measurement windows", () => {
  it("uses Pacific calendar dates across DST and excludes approval/live days", () => {
    expect(ptDate("2026-03-08T07:30:00Z")).toBe("2026-03-07");
    expect(approvalBaselineWindow("2026-03-08T07:30:00Z")).toEqual({
      windowDays: 0,
      periodStartPt: "2026-02-07",
      periodEndPt: "2026-03-06",
    });
    expect(outcomeWindow("2026-11-01T08:30:00Z", 7)).toEqual({
      windowDays: 7,
      periodStartPt: "2026-11-02",
      periodEndPt: "2026-11-08",
    });
  });
});

describe("GSC window materialization", () => {
  const row = (date: string, overrides = {}) => ({
    id: date,
    property: "sc-domain:example.com",
    kind: "page_query",
    period_start_pt: date,
    period_end_pt: date,
    data_state: "final",
    possibly_truncated: false,
    checksum: date,
    collected_at: `${date}T20:00:00Z`,
    payload: {
      rows: [
        {
          keys: ["https://example.com/a", "movers"],
          clicks: 2,
          impressions: 10,
          position: 4,
        },
      ],
    },
    ...overrides,
  });
  it("requires exact property/page, final daily coverage and dedupes retries", () => {
    const result = buildGscWindowObservation({
      property: "sc-domain:example.com",
      targetUrl: "https://example.com/a",
      window: {
        windowDays: 7,
        periodStartPt: "2026-08-01",
        periodEndPt: "2026-08-02",
      },
      snapshots: [
        row("2026-08-01"),
        row("2026-08-01", {
          id: "retry",
          checksum: "z",
          collected_at: "2026-08-01T21:00:00Z",
        }),
        row("2026-08-02", { property: "sc-domain:other.com" }),
      ],
    });
    expect(result.status).toBe("partial");
    expect(result.rows).toHaveLength(1);
    expect(result.coverage.missingDates).toEqual(["2026-08-02"]);
    expect(result.sourceRefs).toEqual(["retry"]);
  });
  it("distinguishes complete zero from missing and marks truncation partial", () => {
    const empty = buildGscWindowObservation({
      property: "sc-domain:example.com",
      targetUrl: "https://example.com/a",
      window: {
        windowDays: 7,
        periodStartPt: "2026-08-01",
        periodEndPt: "2026-08-01",
      },
      snapshots: [row("2026-08-01", { payload: { rows: [] } })],
    });
    expect(empty.status).toBe("empty");
    const partial = buildGscWindowObservation({
      property: "sc-domain:example.com",
      targetUrl: "https://example.com/a",
      window: {
        windowDays: 7,
        periodStartPt: "2026-08-01",
        periodEndPt: "2026-08-01",
      },
      snapshots: [row("2026-08-01", { possibly_truncated: true })],
    });
    expect(partial.status).toBe("partial");
  });
});

it("keeps source roles distinct and returns questions without a verdict", () => {
  expect(SOURCE_ROLES.dataforseo_organic).toBe("enrichment");
  expect(SOURCE_ROLES.serpapi_paid_serp).toBe("corroboration");
  expect(SOURCE_ROLES.knowledge).toBe("devils_advocate");
  const flags = findMeasurementContradictions({
    gscClicksDelta: 2,
    ga4SessionsDelta: -1,
    paidPressureChanged: true,
  });
  expect(flags.map((flag) => flag.code)).toEqual([
    "search_behavior_disagree",
    "paid_pressure_changed",
  ]);
  expect(flags.some((flag) => "success" in flag || "verdict" in flag)).toBe(
    false,
  );
});

it("reconciles each due window with an exact-page GA4 read that cannot block GSC", () => {
  const source = readFileSync(
    new URL("./change-measurements.server.ts", import.meta.url),
    "utf8",
  );
  expect(source).toContain("runGa4PageWindow");
  expect(source).toContain("exactHostAndPagePathMatch: true");
  expect(source).toContain("totalSessions: observation.totalSessions");
  expect(source).toContain("doesNotBlockGsc: true");
  expect(source).toContain("await captureGsc(admin, cycle, window)");
  expect(source).toContain("await captureGa4(admin, cycle, window)");
});
