import { describe, expect, it } from "vitest";

import { RULE_ASSIGNMENTS, type RuleBucket } from "./search-console-rule-checks";

/**
 * Every rule this task assigned a bucket to, by rule id. Pulled from the
 * handoff's 13-rule table plus zero_impression_page, index_coverage_drift,
 * and the three GA4 rule families (trafficShift produces two ids).
 *
 * Competitor rules (`competitor_outranks_owned`, `owned_absent_from_approved_serps`)
 * are deliberately excluded: they already carry their own evidence-based
 * confidence (SERP profiles, not Search Console counts) and were never part
 * of the handoff's volume table.
 */
const EXPECTED_RULE_IDS = [
  // family A: seo-validation.server.ts
  "declining_clicks",
  "declining_impressions",
  "declining_position",
  "high_impression_low_ctr",
  "zero_click_page",
  "possible_query_overlap",
  "significant_period_change",
  "research_page_traction",
  // family B: search-console-rules.server.ts
  "striking_distance_query",
  "weak_ctr_page",
  "position_loss",
  "visibility_gain",
  // family C: search-console-rule-checks.ts
  "zero_impression_page",
  "query_coverage_gap",
  "index_coverage_drift",
  // GA4
  "page_traffic_loss",
  "page_traffic_gain",
  "event_disappeared",
  "zero_engagement_page",
];

describe("RULE_ASSIGNMENTS", () => {
  it("assigns every rule exactly once", () => {
    for (const rule of EXPECTED_RULE_IDS) {
      const matches = RULE_ASSIGNMENTS.filter((assignment) => assignment.rule === rule);
      expect(matches, `expected exactly one assignment for "${rule}"`).toHaveLength(1);
    }
  });

  it("has no assignments outside the expected set", () => {
    const extra = RULE_ASSIGNMENTS.map((a) => a.rule).filter(
      (rule) => !EXPECTED_RULE_IDS.includes(rule),
    );
    expect(extra).toEqual([]);
  });

  it("gives every assignment a non-empty reasoning string", () => {
    for (const assignment of RULE_ASSIGNMENTS) {
      expect(assignment.why.length).toBeGreaterThan(0);
    }
  });

  it("carries the existing threshold as needsPerTarget for beyond_current_volume rules", () => {
    const byRule = new Map(RULE_ASSIGNMENTS.map((a) => [a.rule, a]));
    const strikingDistance = byRule.get("striking_distance_query");
    expect(strikingDistance?.bucket).toBe("beyond_current_volume" satisfies RuleBucket);
    expect(strikingDistance?.needsPerTarget).toBe(50);
  });

  it("needs no threshold for fact rules", () => {
    const byRule = new Map(RULE_ASSIGNMENTS.map((a) => [a.rule, a]));
    expect(byRule.get("zero_impression_page")?.needsPerTarget).toBeNull();
    expect(byRule.get("index_coverage_drift")?.needsPerTarget).toBeNull();
    expect(byRule.get("event_disappeared")?.needsPerTarget).toBeNull();
  });
});
