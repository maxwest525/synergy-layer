import { describe, expect, it } from "vitest";

import {
  buildMentionSearchTask,
  CONTENT_ANALYSIS_CONFIG,
  countUnparsedMentionItems,
  MENTION_DEFAULT_LOOKBACK_DAYS,
  mentionRecencyOptions,
  selectMentions,
} from "./content-analysis.server";

// Fixture shape is doc-derived, not assumed, and has NOT been diffed against a live
// call — no DataForSEO request has ever been made from this repo. Source:
// https://docs.dataforseo.com/v3/content_analysis/search/live/ — url and domain are
// item-level; title, snippet, date_published and sentiment_connotations sit inside
// content_info; sentiment_connotations carries exactly the six emotion keys below and
// no `positive`. Diff the first real snapshot against this fixture before trusting
// anything the parser reads out of it.
const CONNOTATIONS = {
  anger: 0.02,
  happiness: 0.71,
  love: 0.11,
  sadness: 0.04,
  share: 0.08,
  fun: 0.04,
};

const item = (url: string | null) => ({
  ...(url === null ? {} : { url }),
  domain: "example.test",
  content_info: {
    title: "Who to hire",
    snippet: "The crew from Acme showed up on time.",
    date_published: "2026-08-01 09:12:00 +00:00",
    sentiment_connotations: { ...CONNOTATIONS },
  },
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

  it("omits filters and order_by entirely when the caller asks for neither", () => {
    expect(Object.keys(buildMentionSearchTask("acme")).sort()).toEqual(["keyword", "limit"]);
  });

  it("puts the caller's filters and ordering into the request body, where they are billed as one call", () => {
    const task = buildMentionSearchTask("acme", 100, {
      filters: [["content_info.sentiment_connotations.anger", ">", 0.5]],
      orderBy: ["content_info.date_published,desc"],
    });
    expect(task["filters"]).toEqual([["content_info.sentiment_connotations.anger", ">", 0.5]]);
    expect(task["order_by"]).toEqual(["content_info.date_published,desc"]);
  });

  it("throws past eight filter conditions rather than truncating to a wider result set", () => {
    const condition = ["content_info.date_published", ">", "2026-01-01 00:00:00 +00:00"];
    const nine = Array.from({ length: 9 }, () => condition).flatMap((clause, index) =>
      index === 0 ? [clause] : ["and", clause],
    );
    expect(() => buildMentionSearchTask("acme", 100, { filters: nine })).toThrow(/at most 8/);
  });

  it("does not count the and/or joiners against the eight-condition cap", () => {
    const condition = ["content_info.date_published", ">", "2026-01-01 00:00:00 +00:00"];
    const eight = Array.from({ length: 8 }, () => condition).flatMap((clause, index) =>
      index === 0 ? [clause] : ["and", clause],
    );
    expect(eight.length).toBeGreaterThan(CONTENT_ANALYSIS_CONFIG.maxFilterConditions);
    expect(buildMentionSearchTask("acme", 100, { filters: eight })["filters"]).toEqual(eight);
  });

  it("throws past three order_by rules", () => {
    expect(() =>
      buildMentionSearchTask("acme", 100, { orderBy: ["a,desc", "b,desc", "c,desc", "d,desc"] }),
    ).toThrow(/at most 3/);
  });
});

describe("parsing the mention rows out of the response envelope", () => {
  it("flattens a well-formed row into a citation the operator can open", () => {
    expect(selectMentions([item("https://example.test/movers")])).toEqual([
      {
        url: "https://example.test/movers",
        domain: "example.test",
        title: "Who to hire",
        snippet: "The crew from Acme showed up on time.",
        datePublished: "2026-08-01 09:12:00 +00:00",
        connotations: CONNOTATIONS,
      },
    ]);
  });

  it("carries every documented connotation key through, not one collapsed score", () => {
    const [mention] = selectMentions([item("https://example.test/movers")]);
    expect(Object.keys(mention?.connotations ?? {}).sort()).toEqual([
      "anger",
      "fun",
      "happiness",
      "love",
      "sadness",
      "share",
    ]);
  });

  it("reports an empty connotations object as null rather than a neutral zero", () => {
    const [mention] = selectMentions([
      { url: "https://example.test/a", content_info: { sentiment_connotations: {} } },
    ]);
    expect(mention?.connotations).toBeNull();
  });

  it("drops a non-numeric connotation instead of carrying it through as a score", () => {
    const [mention] = selectMentions([
      {
        url: "https://example.test/a",
        content_info: { sentiment_connotations: { anger: "high", fun: 0.4 } },
      },
    ]);
    expect(mention?.connotations).toEqual({ fun: 0.4 });
  });

  // The parser deliberately does not whitelist the six documented keys: a seventh
  // would be data the account already paid for, and dropping it would be a fresh
  // guess at the surface this module is in the middle of unguessing.
  it("keeps a connotation key the docs do not list, because the provider sent it", () => {
    const [mention] = selectMentions([
      {
        url: "https://example.test/a",
        content_info: { sentiment_connotations: { fun: 0.4, curiosity: 0.3 } },
      },
    ]);
    expect(mention?.connotations).toEqual({ fun: 0.4, curiosity: 0.3 });
  });

  it("reports a row with no content_info as null connotations rather than crashing", () => {
    expect(selectMentions([{ url: "https://example.test/a" }])[0]?.connotations).toBeNull();
  });

  it("ignores a top-level sentiment_connotations, which the vendor never sends there", () => {
    const [mention] = selectMentions([
      { url: "https://example.test/a", sentiment_connotations: { ...CONNOTATIONS } },
    ]);
    expect(mention?.connotations).toBeNull();
  });

  it("reports an empty title as absent rather than an empty string", () => {
    expect(
      selectMentions([{ url: "https://example.test/a", content_info: { title: "   " } }])[0]?.title,
    ).toBeNull();
  });

  it("ignores a top-level title, which the vendor never sends there", () => {
    const [mention] = selectMentions([{ url: "https://example.test/a", title: "Who to hire" }]);
    expect(mention?.title).toBeNull();
  });

  it("returns nothing for an empty items array", () => {
    expect(selectMentions([])).toEqual([]);
  });
});

describe("counting rows the documented shape does not fit", () => {
  it("counts a well-formed row as parsed, not unparsed", () => {
    expect(countUnparsedMentionItems([item("https://example.test/movers")])).toBe(0);
  });

  it("counts a row with no url as unparsed, because it cannot be shown as a citation", () => {
    const malformed = item(null);
    expect(countUnparsedMentionItems([malformed])).toBe(1);
    expect(selectMentions([malformed])).toEqual([]);
  });

  it("counts a row whose url is not a string as unparsed", () => {
    expect(countUnparsedMentionItems([{ url: 42 }])).toBe(1);
  });

  it("counts each malformed row separately so the absence is quantified", () => {
    expect(countUnparsedMentionItems([{ url: 42 }, {}, item("https://example.test/a")])).toBe(2);
  });
});

describe("the recency floor that keeps a scheduled run from re-buying old mentions", () => {
  // Minimal stand-in for the one query mentionRecencyOptions makes; every builder
  // method returns the chain and maybeSingle resolves whatever the case under test set.
  function clientReturning(outcome: {
    data?: { collected_at: string } | null;
    error?: { message: string } | null;
    throws?: boolean;
  }) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) {
      chain[method] = () => chain;
    }
    chain["maybeSingle"] = async () => {
      if (outcome.throws) throw new Error("connection reset");
      return { data: outcome.data ?? null, error: outcome.error ?? null };
    };
    return {
      from: () => chain,
    } as unknown as Parameters<typeof mentionRecencyOptions>[0];
  }

  function cutoffOf(options: { filters?: unknown[] }): string {
    const [condition] = (options.filters ?? []) as string[][];
    expect(condition?.[0]).toBe("content_info.date_published");
    expect(condition?.[1]).toBe(">");
    return condition?.[2] as string;
  }

  it("floors the read at the last successful run when one exists", async () => {
    const options = await mentionRecencyOptions(
      clientReturning({ data: { collected_at: "2026-08-01T09:30:00.000Z" } }),
      "tenant-1",
    );
    expect(cutoffOf(options)).toBe("2026-08-01 00:00:00 +00:00");
  });

  it("uses the stated default window on a tenant's first run", async () => {
    const options = await mentionRecencyOptions(clientReturning({ data: null }), "tenant-1");
    const expected = new Date(Date.now() - MENTION_DEFAULT_LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(cutoffOf(options)).toBe(`${expected} 00:00:00 +00:00`);
  });

  it("still bounds the read when the lookup errors — a failed lookup must not widen spend", async () => {
    const options = await mentionRecencyOptions(
      clientReturning({ error: { message: "permission denied" } }),
      "tenant-1",
    );
    expect(cutoffOf(options)).toBeTruthy();
  });

  it("still bounds the read when the lookup throws", async () => {
    const options = await mentionRecencyOptions(clientReturning({ throws: true }), "tenant-1");
    expect(cutoffOf(options)).toBeTruthy();
  });

  it("never hands back an empty filter set, which would be an unbounded read", async () => {
    for (const outcome of [{ data: null }, { throws: true }, { error: { message: "x" } }]) {
      const options = await mentionRecencyOptions(clientReturning(outcome), "tenant-1");
      expect(options.filters?.length).toBe(1);
    }
  });

  it("survives buildMentionSearchTask so the floor reaches the request body", async () => {
    const options = await mentionRecencyOptions(
      clientReturning({ data: { collected_at: "2026-08-01T09:30:00.000Z" } }),
      "tenant-1",
    );
    expect(buildMentionSearchTask("acme", 100, options)["filters"]).toEqual([
      ["content_info.date_published", ">", "2026-08-01 00:00:00 +00:00"],
    ]);
  });
});
