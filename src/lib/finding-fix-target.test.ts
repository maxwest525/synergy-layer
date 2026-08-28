import { describe, expect, it } from "vitest";

import {
  deriveFixTarget,
  hasGovernedFixPath,
  proposalKindForRule,
  whyNoFixLane,
} from "./finding-fix-target";

const row = (page: string, query: string, impressions: number) => ({
  keys: [page, query],
  impressions,
});

describe("deriveFixTarget", () => {
  it("uses the target directly for page rules", () => {
    const result = deriveFixTarget("weak_ctr_page", "https://site.com/movers", []);
    expect(result).toEqual({ ok: true, url: "https://site.com/movers", query: null });
  });

  it("splits coverage-gap targets into page and query", () => {
    const result = deriveFixTarget(
      "query_coverage_gap",
      "https://site.com/movers :: piano transport",
      [],
    );
    expect(result).toEqual({ ok: true, url: "https://site.com/movers", query: "piano transport" });
  });

  it("resolves query rules to the page with most impressions for that query", () => {
    const result = deriveFixTarget("striking_distance_query", "movers miami", [
      row("https://site.com/a", "movers miami", 40),
      row("https://site.com/b", "movers miami", 90),
      row("https://site.com/c", "other query", 500),
    ]);
    expect(result).toEqual({ ok: true, url: "https://site.com/b", query: "movers miami" });
  });

  it("fails plainly when no page ranks for the query", () => {
    const result = deriveFixTarget("position_loss", "unknown query", []);
    expect(result.ok).toBe(false);
  });

  it("rejects non-URL targets and unknown rules", () => {
    expect(deriveFixTarget("weak_ctr_page", "not-a-url", []).ok).toBe(false);
    expect(deriveFixTarget("mystery_rule", "https://site.com/a", []).ok).toBe(false);
  });
});

describe("proposalKindForRule", () => {
  it("routes the weak click-through finding to the metadata lane", () => {
    expect(proposalKindForRule("weak_ctr_page")).toBe("page_metadata");
  });

  it("sends a rule to the wording lane only where wording is the lever", () => {
    for (const rule of [
      "striking_distance_query",
      "query_coverage_gap",
      "possible_query_overlap",
    ]) {
      expect(proposalKindForRule(rule)).toBe("page_wording");
    }
  });

  it("refuses to draft anything for a finding wording cannot fix", () => {
    // These four used to draft a rewrite of the page's words, which could not
    // have fixed what any of them found. A page that has never been shown does
    // not need better wording, and a page that improved needs nothing at all.
    for (const rule of [
      "zero_impression_page",
      "index_coverage_drift",
      "visibility_gain",
      "position_loss",
    ]) {
      expect(proposalKindForRule(rule)).toBeNull();
      expect(hasGovernedFixPath(rule)).toBe(false);
    }
  });

  it("returns nothing at all for a rule it has never heard of", () => {
    // The old default answered "rewrite the words" for any unknown rule.
    expect(proposalKindForRule("mystery_rule")).toBeNull();
  });

  it("says why there is no draft, in words an operator can act on", () => {
    expect(whyNoFixLane("zero_impression_page")).toMatch(/never been shown/i);
    expect(whyNoFixLane("zero_impression_page")).toMatch(/sitemap/i);
    expect(whyNoFixLane("visibility_gain")).toMatch(/nothing to correct/i);
    expect(whyNoFixLane("position_loss")).toMatch(/would be a guess/i);
    // A rule with a lane has no such sentence, because it has a button.
    expect(whyNoFixLane("weak_ctr_page")).toBeNull();
  });
});

describe("which rules the governed fix path accepts", () => {
  it("accepts exactly the rules a lane can genuinely answer", () => {
    for (const rule of [
      "weak_ctr_page",
      "striking_distance_query",
      "possible_query_overlap",
      "query_coverage_gap",
    ]) {
      expect(hasGovernedFixPath(rule)).toBe(true);
    }
  });

  it("refuses a rule deriveFixTarget has no path for", () => {
    expect(hasGovernedFixPath("some_rule_nobody_wired")).toBe(false);
    expect(deriveFixTarget("some_rule_nobody_wired", "https://x.test/", []).ok).toBe(false);
  });
});
