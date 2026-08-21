import { describe, expect, it } from "vitest";

import {
  countUnparsedEnrichmentItems,
  ENRICHMENT_BATCH_CAP,
  mergeEnrichment,
  selectEnrichmentBatch,
} from "./keyword-enrichment.server";

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

describe("capping the batch sent to the two bulk Labs calls", () => {
  it("sends every pending candidate when the queue is at or under the cap", () => {
    const pending = Array.from({ length: 3 }, (_, i) => `keyword ${i}`);
    expect(selectEnrichmentBatch(pending)).toEqual(pending);
  });

  it("sends exactly the cap when the queue lands right on it", () => {
    const pending = Array.from({ length: ENRICHMENT_BATCH_CAP }, (_, i) => `keyword ${i}`);
    expect(selectEnrichmentBatch(pending)).toEqual(pending);
  });

  it("caps the batch at ENRICHMENT_BATCH_CAP rather than sending the whole queue", () => {
    const pending = Array.from({ length: ENRICHMENT_BATCH_CAP + 50 }, (_, i) => `keyword ${i}`);
    const batch = selectEnrichmentBatch(pending);
    expect(batch.length).toBe(ENRICHMENT_BATCH_CAP);
    expect(batch).toEqual(pending.slice(0, ENRICHMENT_BATCH_CAP));
  });
});

describe("counting rows the Labs response has no keyword for", () => {
  it("counts a well-formed row as parsed, not unparsed", () => {
    expect(
      countUnparsedEnrichmentItems([{ keyword: "movers austin", keyword_difficulty: 24 }]),
    ).toBe(0);
  });

  it("counts a row missing the keyword field as unparsed rather than crashing", () => {
    expect(countUnparsedEnrichmentItems([{ keyword_difficulty: 24 }])).toBe(1);
  });

  it("counts a row with an empty keyword string as unparsed", () => {
    expect(countUnparsedEnrichmentItems([{ keyword: "" }])).toBe(1);
  });

  it("counts only the unparsed rows in a mixed batch", () => {
    expect(
      countUnparsedEnrichmentItems([
        { keyword: "movers austin" },
        { keyword_difficulty: 24 },
        { keyword: "piano movers austin" },
      ]),
    ).toBe(1);
  });
});
