import { describe, expect, it } from "vitest";

import { mergeEnrichment } from "./keyword-enrichment.server";

describe("merging the two Labs reads onto one keyword", () => {
  it("keys difficulty and intent by the keyword they came back for", () => {
    const merged = mergeEnrichment(
      [{ keyword: "piano movers austin", keyword_difficulty: 24 }],
      [{ keyword: "piano movers austin", keyword_intent: { label: "commercial" } }],
    );
    expect(merged.get("piano movers austin")).toEqual({
      keywordDifficulty: 24,
      searchIntent: "commercial",
    });
  });

  it("keeps a keyword that came back from only one of the two reads", () => {
    const merged = mergeEnrichment([{ keyword: "movers austin", keyword_difficulty: 40 }], []);
    expect(merged.get("movers austin")).toEqual({ keywordDifficulty: 40, searchIntent: null });
  });

  it("stores null rather than zero when the provider returned no difficulty", () => {
    const merged = mergeEnrichment([{ keyword: "movers austin", keyword_difficulty: null }], []);
    expect(merged.get("movers austin")?.keywordDifficulty).toBeNull();
  });

  it("lowercases keys so they match the candidate rows", () => {
    const merged = mergeEnrichment([{ keyword: "Movers Austin", keyword_difficulty: 40 }], []);
    expect(merged.has("movers austin")).toBe(true);
  });
});
