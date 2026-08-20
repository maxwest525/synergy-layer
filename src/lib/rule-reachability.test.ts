import { describe, expect, it } from "vitest";

import { categoryForFinding } from "./finding-router";
import {
  assessReach,
  citedRuleCount,
  reachOf,
  RULE_REQUIREMENTS,
  type VolumeEvidence,
} from "./rule-reachability";

/**
 * Roughly what this property produces: eighteen impressions a day site wide,
 * spread thin enough that no single search or page-and-search pair reaches
 * double figures.
 */
const REAL: VolumeEvidence = {
  bestPage: { impressions: 40, clicks: 1 },
  bestQueryImpressions: 12,
  bestPageQueryImpressions: 9,
  pagesReported: 48,
  windowDays: 28,
};

const NOTHING: VolumeEvidence = {
  bestPage: null,
  bestQueryImpressions: null,
  bestPageQueryImpressions: null,
  pagesReported: 0,
  windowDays: 28,
};

function requirement(rule: string) {
  const found = RULE_REQUIREMENTS.find((entry) => entry.rule === rule);
  if (!found) throw new Error(`no requirement for ${rule}`);
  return found;
}

describe("the registry has to match the rules that actually exist", () => {
  it("covers every rule the router files under this category", () => {
    // The first version missed position_loss and visibility_gain, so the
    // headline under-reported how much was blocked. Nothing pinned the two
    // together, which is why it was invisible.
    const registered = new Set(RULE_REQUIREMENTS.map((entry) => entry.rule));
    const missing = ROUTED_TO_SEARCH.filter((rule) => !registered.has(rule));
    expect(missing).toEqual([]);
  });

  it("registers nothing the router does not route here", () => {
    for (const entry of RULE_REQUIREMENTS) {
      expect(categoryForFinding("search-console-rules", { rule: entry.rule })).toBe("search");
    }
  });
});

/**
 * Every rule the finding router files under the search category, which is the
 * set this page filters to. Kept as a literal so a rule added to the router
 * without a registry entry fails the test above rather than silently shrinking
 * the count on screen.
 */
const ROUTED_TO_SEARCH = [
  "declining_clicks",
  "declining_impressions",
  "declining_position",
  "high_impression_low_ctr",
  "zero_click_page",
  "possible_query_overlap",
  "significant_period_change",
  "research_page_traction",
  "striking_distance_query",
  "position_loss",
  "visibility_gain",
  "zero_impression_page",
  "query_coverage_gap",
  "index_coverage_drift",
] as const;

describe("the finding this module exists to state", () => {
  it("says most checks cannot run at this site's volume", () => {
    const summary = assessReach(REAL);
    expect(summary.blocked).toBeGreaterThan(summary.reachable);
    expect(summary.headline).toContain("40");
    expect(summary.headline).toContain("28");
  });

  it("says it is not the operator's fault and not a broken check", () => {
    expect(assessReach(REAL).headline).toMatch(/not a fault|not enough evidence/i);
  });

  it("rests on almost no citations, which is the point", () => {
    // Raising this is the work in the handoff, so it is pinned as a ceiling
    // rather than an exact number: adding the first citation must not turn the
    // suite red on whoever does it.
    expect(citedRuleCount()).toBeLessThan(RULE_REQUIREMENTS.length);
  });
});

describe("measuring against the rows the rule actually reads", () => {
  it("judges a search rule on the busiest search, not the busiest page", () => {
    // A page with forty impressions spread over twelve searches clears a page
    // floor of twenty-five and clears no search floor at all. Measuring both
    // against the page count reported four rules as reachable that cannot fire.
    const reach = reachOf(requirement("striking_distance_query"), REAL);
    expect(reach.reachable).toBe(false);
    expect(reach.reason).toContain("one search");
    expect(reach.reason).toContain("had 12 in");
  });

  it("judges a page-and-search rule on that pair", () => {
    const reach = reachOf(requirement("query_coverage_gap"), REAL);
    expect(reach.reachable).toBe(false);
    expect(reach.reason).toContain("page and search pair");
    expect(reach.reason).toContain("had 9 in");
  });

  it("judges a page rule on the busiest page", () => {
    const reach = reachOf(requirement("declining_impressions"), REAL);
    expect(reach.reason).toContain("one page");
    expect(reach.reason).toContain("had 40 in");
    expect(reach.reason).toContain("60 short");
  });

  it("reads clicks off the same page as the impressions", () => {
    // Independent maxima reported "your busiest page had 3 clicks" about a page
    // that had none, because the clicks belonged to a different, smaller page.
    const reach = reachOf(requirement("declining_clicks"), REAL);
    expect(reach.reason).toContain("10 clicks");
    expect(reach.reason).toContain("had 1 in");
  });
});

describe("naming what a rule waits on besides volume", () => {
  it("says when a rule needs a second collection to compare against", () => {
    // Six rules compare against a prior window and cannot fire at any volume
    // until a second collection has run. The registry used to record only the
    // impression floor.
    const reach = reachOf(requirement("significant_period_change"), REAL);
    expect(reach.reason).toMatch(/second collection/i);
  });

  it("does not claim a fact-shaped rule is ready when nothing has read the page", () => {
    const reach = reachOf(requirement("zero_impression_page"), REAL);
    expect(reach.reason).toMatch(/page audit to have read the page/i);
  });

  it("carries the extra condition even when the volume floor is cleared", () => {
    const reach = reachOf(requirement("research_page_traction"), REAL);
    expect(reach.reachable).toBe(true);
    expect(reach.reason).toMatch(/stored research address/i);
  });
});

describe("the three kinds of answer", () => {
  it("lets a fact about a page fire at any volume", () => {
    for (const rule of ["zero_impression_page", "index_coverage_drift"]) {
      const reach = reachOf(requirement(rule), {
        ...REAL,
        bestPage: { impressions: 0, clicks: 0 },
      });
      expect(reach.reachable).toBe(true);
      expect(reach.reason).toMatch(/fact about the page/i);
    }
  });

  it("says a click-through question cannot be answered per page however long you wait", () => {
    const reach = reachOf(requirement("high_impression_low_ctr"), REAL);
    expect(reach.answerability).toBe("pooled_only");
    expect(reach.reason).toMatch(/however long you wait/i);
  });

  it("does not say that about a rule where waiting is the fix", () => {
    // declining_clicks is a click *count* trend, not a rate estimate: it fires
    // as soon as one page accumulates ten clicks. Labelling it pooled-only told
    // the operator waiting would not help, which is false.
    const reach = reachOf(requirement("declining_clicks"), REAL);
    expect(reach.answerability).toBe("needs_volume");
    expect(reach.reason).not.toMatch(/however long you wait/i);
  });
});

describe("refusing to guess", () => {
  it("does not claim a rule is blocked when nothing has been collected", () => {
    const summary = assessReach(NOTHING);
    expect(summary.headline).toMatch(/nothing has been collected/i);
    const measured = summary.rules.find((rule) => rule.needs !== null);
    expect(measured?.reason).toMatch(/no way to tell/i);
  });

  it("keeps a measured zero as a real shortfall, not as unknown", () => {
    const reach = reachOf(requirement("declining_impressions"), {
      ...REAL,
      bestPage: { impressions: 0, clicks: 0 },
    });
    expect(reach.reason).not.toMatch(/no way to tell/i);
    // Asserted as "had 0 in" rather than "0 impressions", which matched
    // vacuously inside "100 impressions" and passed even with the zero dropped.
    expect(reach.reason).toContain("had 0 in");
  });

  it("says nothing at all when every rule can fire", () => {
    const summary = assessReach({
      bestPage: { impressions: 100_000, clicks: 5_000 },
      bestQueryImpressions: 40_000,
      bestPageQueryImpressions: 20_000,
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
