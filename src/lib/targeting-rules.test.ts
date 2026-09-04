import { describe, expect, it } from "vitest";

import {
  detectKeywordCannibalization,
  detectMissingRouteQueries,
  isRouteQuery,
  detectKeywordsWithoutPage,
  detectReferringDomainMovement,
  detectUnobservedKeywords,
  type ApprovedKeyword,
  type ObservedSerp,
  type PageText,
} from "./targeting-rules";

const approved = (...keywords: string[]): ApprovedKeyword[] =>
  keywords.map((keyword) => ({ keyword }));

describe("route searches the approved set does not name", () => {
  const approved = [{ keyword: "best long distance movers" }, { keyword: "top moving company" }];
  const queries = [
    { query: "movers boston to miami", impressions: 40, clicks: 2 },
    { query: "moving from texas to florida", impressions: 25, clicks: 1 },
    { query: "long distance movers near me", impressions: 300, clicks: 12 },
  ];

  it("names the route queries Search Console recorded when no approved keyword is one", () => {
    const [finding, ...rest] = detectMissingRouteQueries(approved, queries);
    expect(rest).toEqual([]);
    expect(finding?.rule).toBe("tracked_set_has_no_route_query");
    expect(finding?.description).toContain("2 approved keyword(s)");
    expect(finding?.description).toContain("2 route queries");
    expect(finding?.description).toContain("65 impression(s) and 3 click(s)");
    expect(finding?.description).toContain('"movers boston to miami"');
    expect(finding?.evidence["examples"]).toEqual([
      { query: "movers boston to miami", impressions: 40, clicks: 2 },
      { query: "moving from texas to florida", impressions: 25, clicks: 1 },
    ]);
    expect(finding?.confidence).toBe(1);
  });

  it("stays silent once one approved keyword names a journey", () => {
    expect(
      detectMissingRouteQueries([...approved, { keyword: "movers boston to miami" }], queries),
    ).toEqual([]);
  });

  it("stays silent with no approved keyword, and with no route query to name", () => {
    expect(detectMissingRouteQueries([], queries)).toEqual([]);
    expect(
      detectMissingRouteQueries(approved, [
        { query: "long distance movers near me", impressions: 300, clicks: 12 },
      ]),
    ).toEqual([]);
  });

  it("does not read a brand or phrase containing the letters as a journey", () => {
    expect(isRouteQuery("tomato movers")).toBe(false);
    expect(isRouteQuery("customer service movers")).toBe(false);
    expect(isRouteQuery("moving from texas")).toBe(true);
  });
});

describe("an approved keyword nothing has looked up yet", () => {
  it("raises one finding per approved keyword with no stored SERP", () => {
    const observed: ObservedSerp[] = [{ keyword: "movers austin", reportingDate: "2026-08-14" }];
    const found = detectUnobservedKeywords(
      approved("movers austin", "piano movers austin"),
      observed,
    );
    expect(found.map((observation) => observation.target)).toEqual(["piano movers austin"]);
    expect(found[0]?.rule).toBe("approved_keyword_unobserved");
  });

  it("matches the stored SERP target case-insensitively, so a casing difference is not a finding", () => {
    const observed: ObservedSerp[] = [{ keyword: "Movers Austin", reportingDate: "2026-08-14" }];
    expect(detectUnobservedKeywords(approved("movers austin"), observed)).toEqual([]);
  });

  it("carries the approved keyword verbatim in the evidence", () => {
    const found = detectUnobservedKeywords(approved("piano movers austin"), []);
    expect(found[0]?.evidence["keyword"]).toBe("piano movers austin");
  });

  it("says nothing when no keyword has been approved", () => {
    expect(detectUnobservedKeywords([], [])).toEqual([]);
  });
});

describe("an approved keyword no page is about", () => {
  const pages: PageText[] = [
    { url: "https://x.test/movers", title: "Movers in Austin, TX", h1: "Austin movers" },
    { url: "https://x.test/about", title: "About us", h1: "Who we are" },
  ];

  it("raises the keyword when no stored title or heading carries the phrase", () => {
    const found = detectKeywordsWithoutPage(approved("piano movers austin"), pages);
    expect(found).toHaveLength(1);
    expect(found[0]?.rule).toBe("approved_keyword_no_page");
    expect(found[0]?.target).toBe("piano movers austin");
  });

  it("names the nearest page and the words it is short of, rather than only an absence", () => {
    const [found] = detectKeywordsWithoutPage(approved("piano movers austin"), pages);
    // The movers page shares "mover" and "austin" and lacks "piano", so the
    // operator is told which page to reword instead of being told to write one.
    expect(found?.description).toContain("https://x.test/movers");
    expect(found?.description).toContain('"mover"');
    expect(found?.description).toContain('"piano"');
    expect(found?.evidence["nearestPage"]).toBe("https://x.test/movers");
    expect(found?.evidence["nearestPageMissing"]).toEqual(["piano"]);
  });

  it("says there is nothing to reword when no read page shares a single word", () => {
    const [found] = detectKeywordsWithoutPage(approved("kayak storage"), pages);
    expect(found?.description).toContain("shares a single word");
    expect(found?.evidence["nearestPage"]).toBeUndefined();
  });

  it("stays silent when a title carries the phrase", () => {
    expect(detectKeywordsWithoutPage(approved("movers in austin"), pages)).toEqual([]);
  });

  it("stays silent when an H1 carries the phrase", () => {
    expect(detectKeywordsWithoutPage(approved("austin movers"), pages)).toEqual([]);
  });

  it("records how many pages were read, so the claim names its own denominator", () => {
    const found = detectKeywordsWithoutPage(approved("piano movers austin"), pages);
    expect(found[0]?.evidence["pagesRead"]).toBe(2);
  });

  it("says nothing at all when the audit has read no pages, rather than accusing every keyword", () => {
    expect(detectKeywordsWithoutPage(approved("piano movers austin"), [])).toEqual([]);
  });
});

describe("an approved keyword more than one page is about", () => {
  const pages: PageText[] = [
    { url: "https://x.test/movers", title: "Movers in Austin, TX", h1: "Austin movers" },
    { url: "https://x.test/long-distance", title: "Austin movers | long distance", h1: null },
    { url: "https://x.test/about", title: "About us", h1: "Who we are" },
  ];

  it("raises the keyword when two pages both carry the phrase", () => {
    const found = detectKeywordCannibalization(approved("austin movers"), pages);
    expect(found).toHaveLength(1);
    expect(found[0]?.rule).toBe("approved_keyword_multiple_pages");
    expect(found[0]?.target).toBe("austin movers");
  });

  it("names both competing pages in the evidence", () => {
    const found = detectKeywordCannibalization(approved("austin movers"), pages);
    expect(found[0]?.evidence["pages"]).toEqual([
      "https://x.test/movers",
      "https://x.test/long-distance",
    ]);
  });

  it("stays silent when only one page carries the phrase", () => {
    expect(detectKeywordCannibalization(approved("who we are"), pages)).toEqual([]);
  });

  it("stays silent when no page carries the phrase", () => {
    expect(detectKeywordCannibalization(approved("piano movers austin"), pages)).toEqual([]);
  });

  it("says nothing at all when the audit has read no pages", () => {
    expect(detectKeywordCannibalization(approved("austin movers"), [])).toEqual([]);
  });
});

describe("movement in the sites linking to this one", () => {
  const prior = { reportingDate: "2026-07-14", domains: ["a.test", "b.test", "c.test"] };

  it("says nothing when only one snapshot exists, because nothing can have moved", () => {
    expect(detectReferringDomainMovement(null, prior)).toEqual([]);
  });

  it("says nothing when the two snapshots hold the same domains", () => {
    expect(
      detectReferringDomainMovement(prior, {
        reportingDate: "2026-08-14",
        domains: [...prior.domains],
      }),
    ).toEqual([]);
  });

  it("names what appeared and what disappeared between the two", () => {
    const found = detectReferringDomainMovement(prior, {
      reportingDate: "2026-08-14",
      domains: ["a.test", "b.test", "d.test"],
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.rule).toBe("referring_domain_movement");
    expect(found[0]?.evidence["gained"]).toEqual(["d.test"]);
    expect(found[0]?.evidence["lost"]).toEqual(["c.test"]);
  });

  it("takes its confidence from the counts, not from a literal", () => {
    const found = detectReferringDomainMovement(prior, {
      reportingDate: "2026-08-14",
      domains: ["a.test"],
    });
    // Three to one is far below confidence.ts's MIN_BASELINE of ten, so the
    // finding is recorded and reported as weak rather than suppressed.
    expect(found[0]?.confidence).toBeLessThan(0.4);
  });
});
