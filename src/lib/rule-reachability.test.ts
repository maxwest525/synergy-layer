import { describe, expect, it } from "vitest";

import {
  assessReach,
  citedRuleCount,
  reachOf,
  RULE_REQUIREMENTS,
  type VolumeEvidence,
} from "./rule-reachability";

/** Roughly what this property actually produces: 18 impressions a day site wide. */
const REAL: VolumeEvidence = {
  bestPageImpressions: 40,
  bestPageClicks: 1,
  pagesReported: 48,
  windowDays: 28,
};

function requirement(rule: string) {
  const found = RULE_REQUIREMENTS.find((entry) => entry.rule === rule);
  if (!found) throw new Error(`no requirement for ${rule}`);
  return found;
}

describe("the finding this module exists to state", () => {
  it("says most checks cannot run at this site's volume", () => {
    const summary = assessReach(REAL);
    expect(summary.blocked).toBeGreaterThan(summary.reachable);
    expect(summary.headline).toContain("40");
    expect(summary.headline).toContain("28");
  });

  it("says it is not the operator's fault and not a broken check", () => {
    // An empty screen currently reads as either "all good" or "this is broken".
    // Neither is true, and the third answer has to be sayable.
    expect(assessReach(REAL).headline).toMatch(/not a fault|not enough evidence/i);
  });

  it("rests on no citations at all, which is the point", () => {
    // Thirteen rules decide what the operator is told. Not one of them was
    // derived from anything. Raising this number is the work in the handoff.
    expect(citedRuleCount()).toBe(0);
  });
});

describe("what a rule needs, against what the site has", () => {
  it("names both numbers and the shortfall", () => {
    const reach = reachOf(requirement("declining_impressions"), REAL);
    expect(reach.reachable).toBe(false);
    expect(reach.reason).toContain("100");
    expect(reach.reason).toContain("40");
    expect(reach.reason).toContain("60");
  });

  it("measures against the busiest page, not the site total", () => {
    // A rule needing 200 impressions on one page is not helped by 200 spread
    // across forty pages.
    const reach = reachOf(requirement("weak_ctr_page"), { ...REAL, pagesReported: 5000 });
    expect(reach.reachable).toBe(false);
  });

  it("clears a rule the site can actually reach", () => {
    const reach = reachOf(requirement("research_page_traction"), REAL);
    expect(reach.reachable).toBe(true);
    expect(reach.reason).toContain("clears");
  });

  it("counts clicks against clicks, not against impressions", () => {
    const reach = reachOf(requirement("declining_clicks"), REAL);
    expect(reach.reason).toContain("10 clicks");
    // 1 click against the 10 it needs, not the page's 40 impressions.
    expect(reach.reason).toContain("had 1 in");
    expect(reach.reason).not.toContain("40");
  });
});

describe("the three kinds of answer", () => {
  it("lets a fact about a page fire at any volume", () => {
    // "Google has never shown this page" is a fact, not a measurement, so no
    // threshold applies to it.
    for (const rule of ["zero_impression_page", "index_coverage_drift"]) {
      const reach = reachOf(requirement(rule), { ...REAL, bestPageImpressions: 0 });
      expect(reach.reachable).toBe(true);
      expect(reach.reason).toMatch(/fact about the page/i);
    }
  });

  it("says a click question cannot be answered per page however long you wait", () => {
    // This is the distinction that matters: waiting fixes a volume problem and
    // does not fix this one. Only changing the unit of analysis does.
    const reach = reachOf(requirement("high_impression_low_ctr"), REAL);
    expect(reach.answerability).toBe("pooled_only");
    expect(reach.reason).toMatch(/however long you wait/i);
    expect(reach.reason).toMatch(/group of pages/i);
  });

  it("says a volume question is only short, not impossible", () => {
    const reach = reachOf(requirement("striking_distance_query"), REAL);
    expect(reach.answerability).toBe("needs_volume");
    expect(reach.reason).toMatch(/short/i);
    expect(reach.reason).not.toMatch(/however long you wait/i);
  });
});

describe("refusing to guess", () => {
  it("does not claim a rule is blocked when nothing has been collected", () => {
    const summary = assessReach({
      bestPageImpressions: null,
      bestPageClicks: null,
      pagesReported: 0,
      windowDays: 28,
    });
    expect(summary.headline).toMatch(/nothing has been collected/i);
    const measured = summary.rules.find((rule) => rule.needs !== null);
    expect(measured?.reason).toMatch(/no way to tell/i);
  });

  it("keeps a measured zero as a real shortfall, not as unknown", () => {
    // Zero impressions is a fact. It is not the same as never having looked.
    const reach = reachOf(requirement("declining_impressions"), {
      ...REAL,
      bestPageImpressions: 0,
    });
    expect(reach.reason).not.toMatch(/no way to tell/i);
    expect(reach.reason).toContain("0 impressions");
  });

  it("says nothing at all when every rule can fire", () => {
    const summary = assessReach({
      bestPageImpressions: 100_000,
      bestPageClicks: 5_000,
      pagesReported: 400,
      windowDays: 28,
    });
    expect(summary.blocked).toBe(0);
    expect(summary.headline).toBeNull();
  });
});

describe("the ordering", () => {
  it("puts what cannot run first, because that is the question being asked", () => {
    const summary = assessReach(REAL);
    expect(summary.rules[0]?.reachable).toBe(false);
    expect(summary.rules.at(-1)?.reachable).toBe(true);
  });
});
