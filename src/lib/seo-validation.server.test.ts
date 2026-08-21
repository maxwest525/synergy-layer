import { describe, expect, it } from "vitest";

import { evaluateSeoRules } from "./seo-validation.server";
import { QUERY_DIMENSION_CAVEAT } from "./search-console-rule-checks";
import { RULE_WINDOW_KIND } from "./search-console.server";

const row = (keys: string[], impressions: number, position: number, clicks = 0) => ({
  keys,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position,
});

function windowSnapshot(dimension: string, rows: ReturnType<typeof row>[]) {
  return {
    id: `${dimension}-window`,
    dimensions: [dimension],
    kind: RULE_WINDOW_KIND,
    period_end_pt: "2026-08-19",
    period_start_pt: "2026-07-23",
    payload: { rows },
    totals: null,
  };
}

function legacyDailySnapshot(dimension: string, rows: ReturnType<typeof row>[]) {
  return {
    id: `${dimension}-daily`,
    dimensions: [dimension],
    kind: "dimensional_rows",
    period_end_pt: "2026-08-19",
    period_start_pt: "2026-08-19",
    payload: { rows },
    totals: null,
  };
}

describe("evaluateSeoRules: pick() prefers the rule window over a legacy daily snapshot", () => {
  it("reads a window snapshot when both kinds exist for the same dimension", () => {
    // Window shows a real 28-day decline (120 -> 50); the legacy daily row for
    // the same page carries an unrelated number (999) that must not surface.
    const current = [
      windowSnapshot("page", [row(["https://site.com/a"], 50, 3, 0)]),
      legacyDailySnapshot("page", [row(["https://site.com/a"], 999, 3, 0)]),
    ];
    const prior = [windowSnapshot("page", [row(["https://site.com/a"], 120, 3, 0)])];
    const findings = evaluateSeoRules(current, prior, []);
    const finding = findings.find((f) => f.rule === "declining_impressions");
    expect(finding).toBeDefined();
    expect(finding?.current?.impressions).toBe(50);
    expect(finding?.windowDays).toBe(28);
  });

  it("falls back to the legacy daily snapshot when no window snapshot exists, and says so", () => {
    const current = [legacyDailySnapshot("page", [row(["https://site.com/a"], 200, 3, 0)])];
    const prior = [legacyDailySnapshot("page", [row(["https://site.com/a"], 500, 3, 5)])];
    const findings = evaluateSeoRules(current, prior, []);
    const declining = findings.find((f) => f.rule === "declining_impressions");
    expect(declining).toBeDefined();
    expect(declining?.windowDays).toBe(1);
  });
});

describe("evaluateSeoRules: query-dimension rules disclose the censorship caveat", () => {
  it("declining_position carries the caveat", () => {
    const current = [windowSnapshot("query", [row(["movers miami"], 60, 15)])];
    const prior = [windowSnapshot("query", [row(["movers miami"], 60, 8)])];
    const findings = evaluateSeoRules(current, prior, []);
    const finding = findings.find((f) => f.rule === "declining_position");
    expect(finding?.description).toContain(QUERY_DIMENSION_CAVEAT);
  });

  it("possible_query_overlap carries the caveat", () => {
    const pageQueryRows = (impressions: number) => [
      { keys: ["https://site.com/a", "movers miami"], clicks: 0, impressions, ctr: 0, position: 9 },
      {
        keys: ["https://site.com/b", "movers miami"],
        clicks: 0,
        impressions,
        ctr: 0,
        position: 11,
      },
    ];
    const overlapSnapshot = (id: string, rows: ReturnType<typeof pageQueryRows>) => ({
      id,
      dimensions: ["page", "query"],
      kind: "page_query",
      period_end_pt: "2026-08-19",
      period_start_pt: "2026-08-19",
      payload: { rows },
      totals: null,
    });
    const current = [overlapSnapshot("current-overlap", pageQueryRows(30))];
    const prior = [overlapSnapshot("prior-overlap", pageQueryRows(30))];
    const findings = evaluateSeoRules(current, prior, []);
    const finding = findings.find((f) => f.rule === "possible_query_overlap");
    expect(finding?.description).toContain(QUERY_DIMENSION_CAVEAT);
  });
});

describe("evaluateSeoRules: confidence is derived, not a bare literal", () => {
  it("declining_clicks confidence tracks the size of the drop", () => {
    const bigDrop = evaluateSeoRules(
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 20)])],
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 400)])],
      [],
    );
    const smallDrop = evaluateSeoRules(
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 15)])],
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 20)])],
      [],
    );
    const bigConfidence = bigDrop.find((f) => f.rule === "declining_clicks")?.confidence.value ?? 0;
    const smallConfidence =
      smallDrop.find((f) => f.rule === "declining_clicks")?.confidence.value ?? 0;
    expect(bigConfidence).toBeGreaterThan(smallConfidence);
  });
});
