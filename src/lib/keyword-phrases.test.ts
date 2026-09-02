import { describe, expect, it } from "vitest";

import {
  closestPageFor,
  contentWords,
  groupByPhrase,
  pageCoversPhrase,
  phraseKey,
} from "./keyword-phrases";

/**
 * The 40 spellings below are the operator's real approved list, read from
 * `tracked_keywords` on 2026-09-02. They are the reason this module exists, so
 * they are the fixture rather than an invented one.
 */
const REAL_LONG_DISTANCE_SPELLINGS = [
  "best moving company long distance",
  "best moving company for long-distance",
  "best long distance moving company",
  "best long-distance moving company",
  "best rated long distance moving company",
  "best moving company for long distance",
  "top long distance moving company",
  "best movers for long distance",
  "highest rated long distance movers",
  "best movers long distance",
  "good long distance movers",
  "best long-distance movers",
  "best long distance movers",
  "recommended long-distance movers",
  "top long distance movers",
  "top rated long distance movers",
  "top long-distance movers",
  "best rated long distance movers",
  "long distance movers best",
  "recommended long distance movers",
  "best movers for long-distance",
  "long distance movers",
  "long-distance movers",
  "movers for long distance",
  "movers long-distance",
  "movers long distance",
];

describe("what a phrase is actually asking for", () => {
  it("drops the qualifier, keeps the target", () => {
    expect(contentWords("best long distance movers")).toEqual(["long", "distance", "mover"]);
    expect(contentWords("long distance movers")).toEqual(["long", "distance", "mover"]);
  });

  it("treats a hyphen as a space, because the searcher did", () => {
    expect(phraseKey("long-distance movers")).toBe(phraseKey("long distance movers"));
  });

  it("treats word order as spelling, not as a different search", () => {
    expect(phraseKey("movers long distance")).toBe(phraseKey("long distance movers"));
  });

  it("keeps words that describe a different offer rather than the same one", () => {
    // "cheap" is deliberately not a qualifier: it is a different promise.
    expect(phraseKey("cheap long distance movers")).not.toBe(phraseKey("long distance movers"));
  });

  it("keeps place names, which are the whole target in a route query", () => {
    expect(phraseKey("california to texas movers")).not.toBe(phraseKey("movers"));
    expect(phraseKey("california to texas movers")).not.toBe(phraseKey("florida to texas movers"));
  });
});

describe("collapsing the operator's real list", () => {
  it("reads 26 spellings of one search as one target", () => {
    const groups = groupByPhrase(REAL_LONG_DISTANCE_SPELLINGS, (k) => k);
    expect(groups).toHaveLength(2);
    const movers = groups.find((g) => g.canonical === "long distance movers");
    expect(movers?.variants.length).toBe(19);
  });

  it("names the target by its shortest spelling, not its longest", () => {
    const groups = groupByPhrase(
      ["best rated long distance moving company", "long distance moving company"],
      (k) => k,
    );
    expect(groups[0]!.canonical).toBe("long distance moving company");
  });

  it("keeps every spelling, so the operator can see what was approved", () => {
    const groups = groupByPhrase(["best long distance movers", "long-distance movers"], (k) => k);
    expect(groups[0]!.variants).toEqual(["long-distance movers", "best long distance movers"]);
  });
});

describe("whether a page answers a target", () => {
  const page = "Long Distance Movers | TruMove Long Distance Moving Made Simple";

  it("covers the phrase the page is about, whatever the qualifier", () => {
    expect(pageCoversPhrase(page, "long distance movers")).toBe(true);
    expect(pageCoversPhrase(page, "best long distance movers")).toBe(true);
    expect(pageCoversPhrase(page, "top rated long-distance movers")).toBe(true);
  });

  it("does not cover a target the page says nothing about", () => {
    expect(pageCoversPhrase(page, "california to texas movers")).toBe(false);
    expect(pageCoversPhrase(page, "interstate moving company")).toBe(false);
  });

  it("needs every content word, not merely some of them", () => {
    // The old substring test got this right and the word-set test keeps it:
    // a page about movers is not thereby a page about long distance movers.
    expect(pageCoversPhrase("Movers | TruMove", "long distance movers")).toBe(false);
  });

  it("says no rather than yes when the phrase has no content words at all", () => {
    expect(pageCoversPhrase(page, "the best")).toBe(false);
  });
});

describe("which page is nearest, and what it is short of", () => {
  const pages = [
    { url: "https://trumoveinc.com/", text: "Moving Made Simple TruMove" },
    { url: "https://trumoveinc.com/services", text: "Long Distance Moving Services" },
    { url: "https://trumoveinc.com/why", text: "Why TruMove" },
  ];

  it("names the page sharing the most of the target, and the words it lacks", () => {
    const closest = closestPageFor("long distance movers", pages);
    expect(closest?.url).toBe("https://trumoveinc.com/services");
    expect(closest?.shared).toEqual(["long", "distance"]);
    expect(closest?.missing).toEqual(["mover"]);
  });

  it("answers nothing rather than guessing when no page shares a word", () => {
    expect(closestPageFor("california to texas movers", [pages[2]!])).toBeNull();
  });

  it("reports a page that already covers the target as missing nothing", () => {
    const closest = closestPageFor("long distance moving", pages);
    expect(closest?.missing).toEqual([]);
  });
});
