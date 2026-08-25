import { describe, expect, it } from "vitest";

import {
  buildMentionSearchTask,
  CONTENT_ANALYSIS_CONFIG,
  countUnparsedMentionItems,
  selectMentions,
} from "./content-analysis.server";

// Stated assumption: the DIGEST describes Content Analysis in one line and names
// no endpoint, parameter or response shape. The envelope below is the assumed
// shape only — diff the first real snapshot against this fixture and update both
// together before trusting anything parsed out of it.
const item = (url: string | null, positive: number | null) => ({
  ...(url === null ? {} : { url }),
  domain: "example.test",
  title: "Who to hire",
  snippet: "The crew from Acme showed up on time.",
  date_published: "2026-08-01 09:12:00 +00:00",
  content_info: { sentiment_connotations: { positive } },
});

describe("the task body posted for a mention search", () => {
  it("sends the keyword lowercased and trimmed so one brand is one fingerprint", () => {
    expect(buildMentionSearchTask("  Acme Moving  ")).toEqual({
      keyword: "acme moving",
      limit: CONTENT_ANALYSIS_CONFIG.mentionLimit,
    });
  });

  it("caps a caller-supplied limit at the configured ceiling", () => {
    expect(buildMentionSearchTask("acme", 5000)["limit"]).toBe(
      CONTENT_ANALYSIS_CONFIG.mentionLimit,
    );
  });

  it("keeps a smaller limit the caller asked for", () => {
    expect(buildMentionSearchTask("acme", 25)["limit"]).toBe(25);
  });

  it("floors a limit below one back to a single row rather than sending zero", () => {
    expect(buildMentionSearchTask("acme", 0)["limit"]).toBe(1);
  });

  it("sends no filter or ordering clause, which the digest does not ground for this family", () => {
    expect(Object.keys(buildMentionSearchTask("acme")).sort()).toEqual(["keyword", "limit"]);
  });
});

describe("parsing the mention rows out of the response envelope", () => {
  it("flattens a well-formed row into a citation the operator can open", () => {
    expect(selectMentions([item("https://example.test/movers", 0.82)])).toEqual([
      {
        url: "https://example.test/movers",
        domain: "example.test",
        title: "Who to hire",
        snippet: "The crew from Acme showed up on time.",
        datePublished: "2026-08-01 09:12:00 +00:00",
        sentiment: 0.82,
      },
    ]);
  });

  it("reports a missing sentiment score as null rather than a neutral zero", () => {
    const [mention] = selectMentions([
      { url: "https://example.test/a", content_info: { sentiment_connotations: {} } },
    ]);
    expect(mention?.sentiment).toBeNull();
  });

  it("reports a row with no content_info as null sentiment rather than crashing", () => {
    expect(selectMentions([{ url: "https://example.test/a" }])[0]?.sentiment).toBeNull();
  });

  it("reports an empty title as absent rather than an empty string", () => {
    expect(selectMentions([{ url: "https://example.test/a", title: "   " }])[0]?.title).toBeNull();
  });

  it("returns nothing for an empty items array", () => {
    expect(selectMentions([])).toEqual([]);
  });
});

describe("counting rows the assumed shape does not fit", () => {
  it("counts a well-formed row as parsed, not unparsed", () => {
    expect(countUnparsedMentionItems([item("https://example.test/movers", 0.5)])).toBe(0);
  });

  it("counts a row with no url as unparsed, because it cannot be shown as a citation", () => {
    const malformed = item(null, 0.5);
    expect(countUnparsedMentionItems([malformed])).toBe(1);
    expect(selectMentions([malformed])).toEqual([]);
  });

  it("counts a row whose url is not a string as unparsed", () => {
    expect(countUnparsedMentionItems([{ url: 42 }])).toBe(1);
  });

  it("counts each malformed row separately so the absence is quantified", () => {
    expect(countUnparsedMentionItems([{ url: 42 }, {}, item("https://example.test/a", 0.1)])).toBe(
      2,
    );
  });
});
