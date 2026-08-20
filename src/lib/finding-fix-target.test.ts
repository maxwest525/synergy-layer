import { describe, expect, it } from "vitest";

import { deriveFixTarget } from "./finding-fix-target";

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
