import { describe, expect, it } from "vitest";

import { ALL_SEARCH_RULES, describeFinding } from "./finding-copy";

const ON = "2026-08-19";

describe("the honesty invariant", () => {
  it("never claims a 28-day window, because a rule only ever sees one day", () => {
    // Every rule runs over a single finalized Pacific date, except two that
    // compare it with the date a week earlier. The 28-day numbers on this page
    // come from the period comparison, never from a finding.
    for (const rule of ALL_SEARCH_RULES) {
      const copy = describeFinding(rule, richEvidence(), ON);
      expect(copy.evidence ?? "").not.toMatch(/28 day/i);
    }
  });

  it("gives every rule a claim written in plain words", () => {
    for (const rule of ALL_SEARCH_RULES) {
      const copy = describeFinding(rule, richEvidence(), ON);
      expect(copy.claim.length).toBeGreaterThan(10);
      expect(copy.claim).not.toContain("—");
      // The rule id is machine vocabulary and must never reach the operator.
      expect(copy.claim).not.toContain("_");
    }
  });

  it("drops the evidence line rather than inventing one when evidence is missing", () => {
    for (const rule of ALL_SEARCH_RULES) {
      expect(describeFinding(rule, {}, ON).evidence).toBeNull();
    }
  });

  it("drops the evidence line when the stored numbers are the wrong type", () => {
    for (const rule of ALL_SEARCH_RULES) {
      const copy = describeFinding(
        rule,
        { position: "twelve", impressions: null, clicks: {}, query: 7, page: [] },
        ON,
      );
      expect(copy.evidence).toBeNull();
    }
  });

  it("names the date the rule actually looked at", () => {
    const copy = describeFinding("striking_distance_query", richEvidence(), ON);
    expect(copy.evidence).toContain(ON);
  });
});

function richEvidence(): Record<string, unknown> {
  return {
    query: "corporate movers tulsa",
    page: "https://trumoveinc.com/corporate-relocation",
    clicks: 2,
    impressions: 118,
    ctr: 0.017,
    position: 14.2,
    pageTitle: "Corporate Relocation Services | TruMove",
    pageH1: "Corporate Relocation",
    before: { clicks: 9, impressions: 140, ctr: 0.064, position: 8.1 },
    after: { clicks: 2, impressions: 118, ctr: 0.017, position: 14.2 },
    pages: [
      { page: "https://trumoveinc.com/a", impressions: 90, position: 12 },
      { page: "https://trumoveinc.com/b", impressions: 60, position: 15 },
    ],
    verdict: "PASS",
    coverageState: "Submitted and indexed",
    indexingState: "INDEXING_ALLOWED",
    googleCanonical: "https://trumoveinc.com/a",
    userCanonical: "https://trumoveinc.com/a",
    lastCrawlTime: "2026-07-01T00:00:00.000Z",
  };
}

describe("striking_distance_query", () => {
  it("says where it ranks and what that is costing", () => {
    const copy = describeFinding("striking_distance_query", richEvidence(), ON);
    expect(copy.claim).toBe('"corporate movers tulsa" is close to page one');
    expect(copy.evidence).toBe(
      'Ranked #14.2 for "corporate movers tulsa" on 2026-08-19 · shown 118 times, 2 clicks',
    );
  });
});

describe("position_loss", () => {
  it("says how far it slipped, from what to what", () => {
    const copy = describeFinding("position_loss", richEvidence(), ON);
    expect(copy.claim).toBe('You slipped down the results for "corporate movers tulsa"');
    expect(copy.evidence).toBe(
      "Was #8.1 a week ago, now #14.2 on 2026-08-19 · shown 118 times, 2 clicks",
    );
  });

  it("needs both sides of the comparison before it will show one", () => {
    const copy = describeFinding("position_loss", { after: { position: 14 } }, ON);
    expect(copy.evidence).toBeNull();
  });
});

describe("weak_ctr_page", () => {
  it("says people saw it and did not click", () => {
    const copy = describeFinding("weak_ctr_page", richEvidence(), ON);
    expect(copy.claim).toBe("People see this page in Google but do not click it");
    // The stored ctr is a fraction and is rendered as a percent exactly once.
    expect(copy.evidence).toBe("Shown 118 times on 2026-08-19, clicked 2 times (1.7%)");
  });
});

describe("visibility_gain", () => {
  it("is written as an opportunity, not a problem", () => {
    const copy = describeFinding("visibility_gain", richEvidence(), ON);
    expect(copy.claim).toBe("This page is being shown more than it was");
    expect(copy.evidence).toBe("Shown 140 times a week ago, 118 on 2026-08-19");
  });
});

describe("possible_query_overlap", () => {
  it("counts the pages competing with each other", () => {
    const copy = describeFinding("possible_query_overlap", richEvidence(), ON);
    expect(copy.claim).toBe('Two of your pages compete for "corporate movers tulsa"');
    expect(copy.evidence).toContain("2 pages");
  });

  it("says nothing when the page list is empty", () => {
    const copy = describeFinding("possible_query_overlap", { query: "x", pages: [] }, ON);
    expect(copy.evidence).toBeNull();
  });
});

describe("zero_impression_page", () => {
  it("carries a claim but no numbers, because none are stored", () => {
    const copy = describeFinding("zero_impression_page", { page: "https://trumoveinc.com/a" }, ON);
    expect(copy.claim).toBe("This page never showed up in Google");
    expect(copy.evidence).toBe("Not shown once on 2026-08-19");
  });
});

describe("query_coverage_gap", () => {
  it("names the search the page does not answer", () => {
    const copy = describeFinding("query_coverage_gap", richEvidence(), ON);
    expect(copy.claim).toBe('This page ranks for "corporate movers tulsa" but never says it');
    expect(copy.evidence).toContain("#14.2");
  });

  it("offers the stored page title as the current wording", () => {
    const copy = describeFinding("query_coverage_gap", richEvidence(), ON);
    expect(copy.currentWording).toBe("Corporate Relocation Services | TruMove");
  });

  it("offers no current wording when none was stored", () => {
    const copy = describeFinding("query_coverage_gap", { query: "x", page: "y" }, ON);
    expect(copy.currentWording).toBeNull();
  });
});

describe("index_coverage_drift", () => {
  it("separates the three cases the one rule id hides", () => {
    const notIndexed = describeFinding(
      "index_coverage_drift",
      { inspectedUrl: "https://a", verdict: "FAIL", coverageState: "Crawled, not indexed" },
      ON,
    );
    expect(notIndexed.claim).toBe("Google has not added this page to its index");

    const canonical = describeFinding(
      "index_coverage_drift",
      {
        inspectedUrl: "https://a",
        verdict: "PASS",
        googleCanonical: "https://a?x=1",
        userCanonical: "https://a",
      },
      ON,
    );
    expect(canonical.claim).toBe("Google picked a different address for this page than you did");

    const stale = describeFinding(
      "index_coverage_drift",
      { inspectedUrl: "https://a", verdict: "PASS", crawlAgeDays: 92 },
      ON,
    );
    expect(stale.claim).toBe("Google has not looked at this page in a long time");
    expect(stale.evidence).toBe("Last crawled 92 days ago");
  });
});
