import { describe, expect, it } from "vitest";

import { evaluate } from "./search-console-rules.server";
import { QUERY_DIMENSION_CAVEAT } from "./search-console-rule-checks";
import { RULE_WINDOW_KIND } from "./search-console.server";

const row = (keys: string[], impressions: number, position: number, clicks = 0) => ({
  keys,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position,
});

function snapshot(
  dimension: string,
  rows: ReturnType<typeof row>[],
  totals: { clicks: number; impressions: number } | null = null,
) {
  return {
    id: `${dimension}-snapshot`,
    dimensions: [dimension],
    kind: RULE_WINDOW_KIND,
    period_end_pt: "2026-08-19",
    payload: { rows },
    totals: totals ?? {
      clicks: rows.reduce((sum, r) => sum + r.clicks, 0),
      impressions: rows.reduce((sum, r) => sum + r.impressions, 0),
      ctr: null,
      position: null,
    },
  };
}

describe("evaluate: query-dimension rules disclose the censorship caveat", () => {
  it("striking_distance_query carries the caveat", () => {
    const current = [snapshot("query", [row(["moving quotes"], 60, 12)])];
    const observations = evaluate(current, []);
    const finding = observations.find((o) => o.rule === "striking_distance_query");
    expect(finding?.description).toContain(QUERY_DIMENSION_CAVEAT);
  });

  it("position_loss carries the caveat", () => {
    const current = [snapshot("query", [row(["moving quotes"], 150, 15)])];
    const prior = [snapshot("query", [row(["moving quotes"], 150, 10)])];
    const observations = evaluate(current, prior);
    const finding = observations.find((o) => o.rule === "position_loss");
    expect(finding?.description).toContain(QUERY_DIMENSION_CAVEAT);
  });
});

describe("evaluate: derived confidence replaces bare literals", () => {
  it("striking_distance_query confidence tracks the impression count, not a fixed literal", () => {
    const low = evaluate([snapshot("query", [row(["moving quotes"], 51, 12)])], []);
    const high = evaluate([snapshot("query", [row(["moving quotes"], 5000, 12)])], []);
    const lowConfidence = low.find((o) => o.rule === "striking_distance_query")?.confidence ?? 0;
    const highConfidence = high.find((o) => o.rule === "striking_distance_query")?.confidence ?? 0;
    expect(highConfidence).toBeGreaterThan(lowConfidence);
  });

  it("visibility_gain confidence is derived from the count change", () => {
    const current = [snapshot("page", [row(["https://site.com/a"], 300, 8, 5)])];
    const prior = [snapshot("page", [row(["https://site.com/a"], 200, 9, 4)])];
    const observations = evaluate(current, prior);
    const finding = observations.find((o) => o.rule === "visibility_gain");
    expect(finding).toBeDefined();
    expect(finding?.confidence).not.toBe(0.6);
  });
});

describe("evaluate: pooled site-level rules", () => {
  it("fires site_visibility_shift with medium+ confidence on a real move", () => {
    const current = [snapshot("page", [], { clicks: 0, impressions: 155 })];
    const prior = [snapshot("page", [], { clicks: 0, impressions: 120 })];
    const observations = evaluate(current, prior);
    const finding = observations.find((o) => o.rule === "site_visibility_shift");
    expect(finding).toBeDefined();
    expect(finding?.confidence).toBeGreaterThanOrEqual(0.4);
    expect(finding?.title.toLowerCase()).toContain("more");
  });

  it("does not fire site_visibility_shift on a move inside the noise floor", () => {
    const current = [snapshot("page", [], { clicks: 0, impressions: 130 })];
    const prior = [snapshot("page", [], { clicks: 0, impressions: 120 })];
    const observations = evaluate(current, prior);
    expect(observations.find((o) => o.rule === "site_visibility_shift")).toBeUndefined();
  });

  it("emits nothing when the prior window is missing (absence, not zero)", () => {
    const current = [snapshot("page", [], { clicks: 200, impressions: 500 })];
    const observations = evaluate(current, []);
    expect(observations.find((o) => o.rule === "site_visibility_shift")).toBeUndefined();
    expect(observations.find((o) => o.rule === "site_clicks_shift")).toBeUndefined();
  });

  it("fires site_clicks_shift on a real click move", () => {
    const current = [snapshot("page", [], { clicks: 155, impressions: 1000 })];
    const prior = [snapshot("page", [], { clicks: 120, impressions: 1000 })];
    const observations = evaluate(current, prior);
    const finding = observations.find((o) => o.rule === "site_clicks_shift");
    expect(finding).toBeDefined();
    expect(finding?.confidence).toBeGreaterThanOrEqual(0.4);
  });
});
