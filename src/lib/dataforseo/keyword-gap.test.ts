import { describe, expect, it } from "vitest";

import { countUnparsedGapItems, selectGapKeywords } from "./keyword-gap.server";

// Stated assumption: response shape from DataForSEO docs, not yet verified
// against a live snapshot — diff the first real snapshot against this fixture
// and update both together before trusting the numbers.
const item = (
  keyword: string,
  volume: number | null,
  ownRank: number | null,
  theirRank: number,
) => ({
  keyword_data: { keyword, keyword_info: { search_volume: volume, cpc: 1.2, competition: 0.4 } },
  first_domain_serp_element: ownRank === null ? null : { rank_group: ownRank },
  second_domain_serp_element: { rank_group: theirRank },
});

describe("what counts as a gap the operator should see", () => {
  it("keeps a keyword the competitor ranks for and the owned domain does not", () => {
    const found = selectGapKeywords(
      [item("piano movers austin", 90, null, 3)],
      "rival.test",
      "x.test",
    );
    expect(found).toEqual([
      {
        keyword: "piano movers austin",
        competitor: "rival.test",
        searchVolume: 90,
        cpc: 1.2,
        competition: 0.4,
        competitorPosition: 3,
      },
    ]);
  });

  it("drops a keyword the owned domain already ranks for, because that is not a gap", () => {
    expect(selectGapKeywords([item("movers austin", 400, 6, 2)], "rival.test", "x.test")).toEqual(
      [],
    );
  });

  it("drops a keyword with no stored volume rather than filing an unjudgeable candidate", () => {
    expect(selectGapKeywords([item("nothing", null, null, 4)], "rival.test", "x.test")).toEqual([]);
  });

  it("lowercases the keyword so it matches the approval table's key", () => {
    const found = selectGapKeywords(
      [item("Piano Movers Austin", 90, null, 3)],
      "rival.test",
      "x.test",
    );
    expect(found[0]?.keyword).toBe("piano movers austin");
  });
});

describe("defensive parsing when the assumed response shape doesn't match", () => {
  it("counts a well-formed item as parsed, not unparsed", () => {
    expect(countUnparsedGapItems([item("piano movers austin", 90, null, 3)])).toBe(0);
  });

  it("counts an item missing the keyword_data key as unparsed rather than crashing", () => {
    const malformed = { second_domain_serp_element: { rank_group: 3 } };
    expect(countUnparsedGapItems([malformed])).toBe(1);
    expect(selectGapKeywords([malformed], "rival.test", "x.test")).toEqual([]);
  });

  it("counts an item missing the second_domain_serp_element key as unparsed", () => {
    const malformed = { keyword_data: { keyword: "x", keyword_info: { search_volume: 10 } } };
    expect(countUnparsedGapItems([malformed])).toBe(1);
  });

  it("counts an item whose keyword_data has no keyword field as unparsed", () => {
    const malformed = {
      keyword_data: { keyword_info: { search_volume: 10 } },
      second_domain_serp_element: { rank_group: 1 },
    };
    expect(countUnparsedGapItems([malformed])).toBe(1);
  });

  it("does not count a legitimate null-volume item as unparsed", () => {
    expect(countUnparsedGapItems([item("nothing", null, null, 4)])).toBe(0);
  });
});
