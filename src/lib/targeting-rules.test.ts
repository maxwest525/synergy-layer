import { describe, expect, it } from "vitest";

import {
  detectKeywordsWithoutPage,
  detectUnobservedKeywords,
  type ApprovedKeyword,
  type ObservedSerp,
  type PageText,
} from "./targeting-rules";

const approved = (...keywords: string[]): ApprovedKeyword[] =>
  keywords.map((keyword) => ({ keyword }));

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
