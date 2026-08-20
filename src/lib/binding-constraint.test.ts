import { describe, expect, it } from "vitest";

import {
  bindingConstraint,
  constraintForRule,
  partitionByConstraint,
  type ConstraintFacts,
} from "./binding-constraint";

const facts: ConstraintFacts = {
  pagesKnown: 39,
  pagesWithImpressions: 0,
  impressions: 0,
  clicks: 0,
  sessions: null,
  conversions: null,
};

function withFacts(overrides: Partial<ConstraintFacts>): ConstraintFacts {
  return { ...facts, ...overrides };
}

describe("the diagnosis this site actually needs", () => {
  it("names reachability when the pages are not being found at all", () => {
    // 39 pages declared, none of them ever shown. Nothing about titles or
    // click-through matters until that changes.
    const diagnosis = bindingConstraint(facts);
    expect(diagnosis.constraint).toBe("reachability");
    expect(diagnosis.reason).toContain("39");
  });

  it("stays on reachability while most pages are invisible", () => {
    const diagnosis = bindingConstraint(
      withFacts({ pagesWithImpressions: 4, impressions: 300, clicks: 12 }),
    );
    expect(diagnosis.constraint).toBe("reachability");
  });

  it("moves to the click decision once the pages are being seen", () => {
    const diagnosis = bindingConstraint(
      withFacts({ pagesWithImpressions: 34, impressions: 4000, clicks: 8 }),
    );
    expect(diagnosis.constraint).toBe("click");
    expect(diagnosis.reason).toMatch(/click/i);
  });

  it("moves to conversion once people are arriving but nothing happens", () => {
    const diagnosis = bindingConstraint(
      withFacts({
        pagesWithImpressions: 34,
        impressions: 4000,
        clicks: 260,
        sessions: 300,
        conversions: 0,
      }),
    );
    expect(diagnosis.constraint).toBe("conversion");
  });

  it("reaches economics only when the funnel above it is working", () => {
    const diagnosis = bindingConstraint(
      withFacts({
        pagesWithImpressions: 34,
        impressions: 4000,
        clicks: 260,
        sessions: 300,
        conversions: 24,
      }),
    );
    expect(diagnosis.constraint).toBe("economics");
  });
});

describe("refusing to diagnose what it cannot see", () => {
  it("says so rather than guessing when nothing is stored", () => {
    const diagnosis = bindingConstraint({
      pagesKnown: 0,
      pagesWithImpressions: 0,
      impressions: 0,
      clicks: 0,
      sessions: null,
      conversions: null,
    });
    expect(diagnosis.constraint).toBeNull();
    expect(diagnosis.reason).toMatch(/nothing stored|no pages/i);
  });

  it("does not claim a conversion problem when conversions are simply unmeasured", () => {
    // Analytics never connected is not the same as nobody converting. Stopping
    // at the click decision is the honest answer.
    const diagnosis = bindingConstraint(
      withFacts({
        pagesWithImpressions: 34,
        impressions: 4000,
        clicks: 260,
        sessions: null,
        conversions: null,
      }),
    );
    expect(diagnosis.constraint).toBe("click");
    expect(diagnosis.reason).toMatch(/not connected|unmeasured|cannot/i);
  });

  it("never returns a constraint without a reason the operator can read", () => {
    const samples = [
      facts,
      withFacts({ pagesWithImpressions: 34, impressions: 4000, clicks: 8 }),
      withFacts({
        pagesWithImpressions: 34,
        impressions: 4000,
        clicks: 260,
        sessions: 300,
        conversions: 0,
      }),
    ];
    for (const sample of samples) {
      const diagnosis = bindingConstraint(sample);
      expect(diagnosis.reason.length).toBeGreaterThan(20);
      expect(diagnosis.reason).not.toContain("—");
    }
  });
});

describe("which constraint each rule addresses", () => {
  it("maps the reachability rules", () => {
    for (const rule of ["zero_impression_page", "query_coverage_gap", "index_coverage_drift"]) {
      expect(constraintForRule(rule)).toBe("reachability");
    }
  });

  it("maps the click-decision rules", () => {
    for (const rule of ["weak_ctr_page", "striking_distance_query"]) {
      expect(constraintForRule(rule)).toBe("click");
    }
  });

  it("returns null for a rule that addresses no single constraint", () => {
    // A position slip is a movement signal, not a diagnosis. Forcing it into a
    // bucket would make the partition lie.
    expect(constraintForRule("position_loss")).toBeNull();
    expect(constraintForRule("something_new")).toBeNull();
  });
});

describe("partitioning the queue", () => {
  const items = [
    { id: "a", rule: "zero_impression_page" },
    { id: "b", rule: "index_coverage_drift" },
    { id: "c", rule: "weak_ctr_page" },
    { id: "d", rule: "striking_distance_query" },
    { id: "e", rule: "position_loss" },
  ];

  it("puts what addresses the binding constraint first", () => {
    const split = partitionByConstraint(items, "reachability", (item) => item.rule);
    expect(split.addressing.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("parks what does not, rather than hiding it", () => {
    const split = partitionByConstraint(items, "reachability", (item) => item.rule);
    expect(split.parked.map((item) => item.id)).toEqual(["c", "d", "e"]);
    expect(split.addressing.length + split.parked.length).toBe(items.length);
  });

  it("addresses nothing and parks nothing when no constraint could be diagnosed", () => {
    // Without a diagnosis there is no basis for saying one card matters more,
    // so the queue keeps its own order instead of inventing one.
    const split = partitionByConstraint(items, null, (item) => item.rule);
    expect(split.addressing).toHaveLength(0);
    expect(split.parked).toHaveLength(0);
    expect(split.undiagnosed.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
