import { describe, expect, it } from "vitest";

import {
  type ObservedSerp,
  groupByObservedIntent,
  intentOutliers,
  serpOverlap,
} from "./keyword-intent";

/**
 * The fixtures are the shape of this tenant's own stored SERPs, read from
 * dataforseo_snapshots on 2026-09-02: a plain service query returning moving
 * companies, and a superlative query returning review sites and listicles.
 * That difference is the finding, so it is what the tests are built on.
 */
const MOVERS = ["twomenandatruck.com", "uhaul.com", "movingcom.com", "safewaymoving.net"];
const REVIEWS = ["forbes.com", "reddit.com", "consumeraffairs.com", "movingcom.com"];

function serp(keyword: string, domains: string[]): ObservedSerp {
  return { keyword, domains };
}

describe("how far apart two result sets are", () => {
  it("counts shared domains against the smaller set, not against ten", () => {
    const overlap = serpOverlap(serp("a", MOVERS), serp("b", MOVERS.slice(0, 2)));
    expect(overlap.shared).toBe(2);
    expect(overlap.comparable).toBe(2);
  });

  it("ignores case, because a domain is not two domains", () => {
    expect(serpOverlap(serp("a", ["UHAUL.com"]), serp("b", ["uhaul.com"])).shared).toBe(1);
  });

  it("names the domains it counted, so a finding can quote them", () => {
    expect(serpOverlap(serp("a", MOVERS), serp("b", REVIEWS)).sharedDomains).toEqual([
      "movingcom.com",
    ]);
  });
});

describe("grouping on what Google actually returned", () => {
  const serps = [
    serp("long distance movers", MOVERS),
    serp("long-distance movers", MOVERS),
    serp("best long distance movers", REVIEWS),
    serp("top rated long distance movers", REVIEWS),
  ];

  it("keeps the superlatives out of the service group at a cutoff of three", () => {
    const grouped = groupByObservedIntent(serps, { minSharedDomains: 3 });
    expect(grouped.observed).toHaveLength(2);
    const service = grouped.observed.find((g) => g.members.includes("long distance movers"));
    expect(service?.members).toEqual(["long-distance movers", "long distance movers"].sort());
    const reviews = grouped.observed.find((g) => g.members.includes("best long distance movers"));
    expect(reviews?.members).toContain("top rated long distance movers");
  });

  it("collapses everything at a cutoff of one, which is the point of stating it", () => {
    // One shared domain is enough to merge review sites with movers. The cutoff
    // is the whole decision, which is why the caller has to name it.
    const grouped = groupByObservedIntent(serps, { minSharedDomains: 1 });
    expect(grouped.observed).toHaveLength(1);
  });

  it("says why a group is a group in words a finding can print", () => {
    const grouped = groupByObservedIntent(serps, { minSharedDomains: 3 });
    expect(grouped.observed[0]!.evidence).toMatch(/share at least \d+ of the top organic domains/);
  });

  it("leads with the best evidenced spelling rather than the first one given", () => {
    const grouped = groupByObservedIntent([serp("thin", ["a.com"]), serp("rich", MOVERS)], {
      minSharedDomains: 3,
    });
    expect(grouped.observed[0]!.canonical).toBe("rich");
  });

  it("does not group, or assert about, a phrase with no stored result set", () => {
    const grouped = groupByObservedIntent([serp("observed", MOVERS), serp("never bought", [])], {
      minSharedDomains: 3,
    });
    expect(grouped.unobserved).toEqual(["never bought"]);
    expect(grouped.observed.flatMap((g) => g.members)).not.toContain("never bought");
  });
});

describe("the spellings that look like variants and are not", () => {
  it("reports the superlative against the service query, with its count", () => {
    const outliers = intentOutliers(
      [
        serp("long distance movers", MOVERS),
        serp("best long distance movers", REVIEWS),
        serp("long-distance movers", MOVERS),
      ],
      "long distance movers",
      { minSharedDomains: 3 },
    );
    expect(outliers).toHaveLength(1);
    expect(outliers[0]!.keyword).toBe("best long distance movers");
    expect(outliers[0]!.overlap.shared).toBe(1);
  });

  it("returns nothing when the canonical was never observed", () => {
    expect(intentOutliers([serp("a", MOVERS)], "not stored", { minSharedDomains: 3 })).toEqual([]);
  });
});
