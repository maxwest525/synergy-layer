import { describe, expect, it } from "vitest";

import {
  checkIdenticalTechnologyStack,
  checkOverlapRowLimit,
  checkRivalPageMentions,
  checkSameRegistrationDetails,
  checkUnlinkedBrandMentions,
  domainsMissingWhoisRecord,
  domainsWithNoTechnologyRecorded,
} from "./discovery-rule-checks";

describe("overlap_list_reached_the_row_limit", () => {
  it("fires when the snapshot is flagged truncated at a real stored limit", () => {
    const draft = checkOverlapRowLimit({
      target: "trumove.com",
      possiblyTruncated: true,
      returnedRowCount: 25,
      requestedLimit: 25,
    });
    expect(draft?.title).toContain("trumove.com");
    expect(draft?.description).toContain("25 sites");
    expect(draft?.description).toContain("Your own site is not listed");
    expect(draft?.evidence["requestedLimit"]).toBe(25);
  });

  it("stays silent when the snapshot was not truncated", () => {
    expect(
      checkOverlapRowLimit({
        target: "trumove.com",
        possiblyTruncated: false,
        returnedRowCount: 8,
        requestedLimit: 25,
      }),
    ).toBeNull();
  });

  it("never invents a limit from a malformed or absent stored value", () => {
    expect(
      checkOverlapRowLimit({
        target: "trumove.com",
        possiblyTruncated: true,
        returnedRowCount: 25,
        requestedLimit: "25", // wrong type -- a string, not the stored number
      }),
    ).toBeNull();
    expect(
      checkOverlapRowLimit({
        target: "trumove.com",
        possiblyTruncated: true,
        returnedRowCount: 0,
        requestedLimit: 0,
      }),
    ).toBeNull();
    expect(
      checkOverlapRowLimit({
        target: "trumove.com",
        possiblyTruncated: true,
        returnedRowCount: 25,
        requestedLimit: null,
      }),
    ).toBeNull();
  });
});

describe("rival_page_mentions_your_brand", () => {
  const known = new Set(["rival.test"]);

  it("fires on a mention whose domain is already known as a competitor", () => {
    const drafts = checkRivalPageMentions({
      mentions: [
        {
          url: "https://rival.test/who-to-hire",
          domain: "rival.test",
          title: "Who to hire",
          datePublished: "2026-08-01",
        },
      ],
      knownCompetitorDomains: known,
      unparsedCount: 0,
      possiblyTruncated: false,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.target).toBe("https://rival.test/who-to-hire");
    expect(drafts[0]?.description).toContain("Who to hire");
    expect(drafts[0]?.description).toContain("August");
  });

  it("stays silent when no mention domain is a known competitor", () => {
    const drafts = checkRivalPageMentions({
      mentions: [
        {
          url: "https://neutral.test/post",
          domain: "neutral.test",
          title: "x",
          datePublished: null,
        },
      ],
      knownCompetitorDomains: known,
      unparsedCount: 0,
      possiblyTruncated: false,
    });
    expect(drafts).toEqual([]);
  });

  it("drops a missing title or date rather than filling it with a guess, and never crashes on a null domain", () => {
    const drafts = checkRivalPageMentions({
      mentions: [
        { url: "https://rival.test/a", domain: "rival.test", title: null, datePublished: null },
        { url: "https://rival.test/b", domain: null, title: "unreachable", datePublished: null },
      ],
      knownCompetitorDomains: known,
      unparsedCount: 3,
      possiblyTruncated: true,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.description).not.toContain("published ");
    expect(drafts[0]?.description).not.toContain(': ""');
    expect(drafts[0]?.evidence["unparsedItemCount"]).toBe(3);
  });
});

describe("same_registration_details_across_two_known_domains", () => {
  it("files one candidate per pair, carrying every field that matched", () => {
    const candidates = checkSameRegistrationDetails([
      {
        domain: "a.test",
        registrar: "GoDaddy.com, LLC",
        createdDatetime: "2020-01-01 00:00:00 +00:00",
        expirationDatetime: null,
      },
      {
        domain: "b.test",
        registrar: "GoDaddy.com, LLC",
        createdDatetime: "2020-01-01 00:00:00 +00:00",
        expirationDatetime: null,
      },
      {
        domain: "c.test",
        registrar: "Other Registrar",
        createdDatetime: null,
        expirationDatetime: null,
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.domainA).toBe("a.test");
    expect(candidates[0]?.domainB).toBe("b.test");
    const fields = candidates[0]?.matchedFields.map((m) => m.field).sort();
    expect(fields).toEqual(["createdDatetime", "registrar"]);
  });

  it("never matches two domains that are both missing the same field", () => {
    const candidates = checkSameRegistrationDetails([
      { domain: "a.test", registrar: null, createdDatetime: null, expirationDatetime: null },
      { domain: "b.test", registrar: null, createdDatetime: null, expirationDatetime: null },
    ]);
    expect(candidates).toEqual([]);
  });

  it("treats an empty string the same as absent, and normalises domain casing and www", () => {
    const candidates = checkSameRegistrationDetails([
      {
        domain: "WWW.A.test",
        registrar: "",
        createdDatetime: "2020-01-01",
        expirationDatetime: null,
      },
      { domain: "a.test", registrar: "", createdDatetime: "2021-01-01", expirationDatetime: null },
    ]);
    // Same normalised domain collapses to one row, so there is nothing to pair.
    expect(candidates).toEqual([]);
  });

  it("names a known domain with no stored whois row as a missing record, not a non-match", () => {
    const missing = domainsMissingWhoisRecord(
      ["a.test", "b.test"],
      [{ domain: "a.test", registrar: "x", createdDatetime: null, expirationDatetime: null }],
    );
    expect(missing).toEqual(["b.test"]);
  });
});

describe("identical_technology_stack_across_two_known_domains", () => {
  it("files one candidate for two domains whose stack is exactly equal, regardless of key order", () => {
    const candidates = checkIdenticalTechnologyStack([
      {
        domain: "a.test",
        technologies: { content: { cms: ["WordPress"] } },
        lastVisited: "2026-08-20",
      },
      {
        domain: "b.test",
        technologies: { content: { cms: ["WordPress"] } },
        lastVisited: "2026-08-20",
      },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.sharedTechnologyCount).toBe(1);
    expect(candidates[0]?.freshness).toBe("same_day");
  });

  it("never matches two domains whose provider read came back with no technologies at all", () => {
    const candidates = checkIdenticalTechnologyStack([
      { domain: "a.test", technologies: {}, lastVisited: "2026-08-20" },
      { domain: "b.test", technologies: {}, lastVisited: "2026-08-20" },
    ]);
    expect(candidates).toEqual([]);
  });

  it("excludes a missing technologies field without throwing", () => {
    const rows = [
      { domain: "a.test", technologies: null, lastVisited: null },
      {
        domain: "b.test",
        technologies: { content: { cms: ["WordPress"] } },
        lastVisited: "2026-08-20",
      },
    ];
    expect(() => checkIdenticalTechnologyStack(rows)).not.toThrow();
    expect(checkIdenticalTechnologyStack(rows)).toEqual([]);
    expect(domainsWithNoTechnologyRecorded(rows)).toHaveLength(1);
  });
});

describe("brand_mentioned_without_a_link", () => {
  const base = {
    ownedHosts: new Set(["trumoveinc.com"]),
    knownCompetitorDomains: new Set(["rival.example"]),
    referringDomains: new Set(["linker.example"]),
    referringDomainsReturned: 3,
    referringDomainsLimit: 200,
    referringDomainsReportingDate: "2026-08-30",
    referringDomainsPossiblyTruncated: false,
    unparsedCount: 0,
    mentionsPossiblyTruncated: false,
  };
  const mention = (url: string, domain: string | null) => ({
    url,
    domain,
    title: null,
    datePublished: null,
  });

  it("files one finding per mentioning domain that is not in the referring-domain list", () => {
    const drafts = checkUnlinkedBrandMentions({
      ...base,
      mentions: [
        mention("https://blog.example/a", "blog.example"),
        mention("https://blog.example/b", "www.blog.example"),
        mention("https://linker.example/post", "linker.example"),
        mention("https://trumoveinc.com/about", "trumoveinc.com"),
        mention("https://rival.example/compare", "rival.example"),
      ],
    });
    expect(drafts.map((draft) => draft.target)).toEqual(["blog.example"]);
    expect(drafts[0]!.rule).toBe("brand_mentioned_without_a_link");
    expect(drafts[0]!.description).toContain("blog.example mentions your name on 2 pages");
    expect(drafts[0]!.description).toContain(
      "is not among the 3 domains the stored read found linking to you",
    );
    expect(drafts[0]!.description).toContain("referring domains read 2026-08-30");
    expect(drafts[0]!.evidence["urls"]).toEqual([
      "https://blog.example/a",
      "https://blog.example/b",
    ]);
    expect(drafts[0]!.confidence).toBe(1);
  });

  it("says where the referring-domain read stopped when it filled its limit", () => {
    const drafts = checkUnlinkedBrandMentions({
      ...base,
      referringDomainsReturned: 200,
      referringDomainsPossiblyTruncated: true,
      mentions: [mention("https://blog.example/a", "blog.example")],
    });
    expect(drafts[0]!.description).toContain(
      "is not among the first 200 domains linking to you by rank, which is where the stored read stopped",
    );
    expect(drafts[0]!.evidence["referringDomainsPossiblyTruncated"]).toBe(true);
  });

  it("names a cut-off mention reading and counts domainless rows instead of dropping them silently", () => {
    const drafts = checkUnlinkedBrandMentions({
      ...base,
      mentionsPossiblyTruncated: true,
      unparsedCount: 2,
      mentions: [mention("https://blog.example/a", "blog.example"), mention("https://x/y", null)],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.description).toContain("The mention reading stopped at the first page");
    expect(drafts[0]!.evidence["unparsedItemCount"]).toBe(2);
    expect(drafts[0]!.evidence["domainlessMentionCount"]).toBe(1);
  });

  it("files nothing when every mentioning domain already links, is owned, or is a known competitor", () => {
    const drafts = checkUnlinkedBrandMentions({
      ...base,
      mentions: [
        mention("https://linker.example/post", "linker.example"),
        mention("https://www.trumoveinc.com/", "www.trumoveinc.com"),
        mention("https://rival.example/", "rival.example"),
      ],
    });
    expect(drafts).toEqual([]);
  });
});
