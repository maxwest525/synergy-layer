import { describe, expect, it } from "vitest";

import { compareNights, watchFactsFromHtml, type NightlyPageRead } from "./site-watch-rule-checks";

function read(overrides: Partial<NightlyPageRead> = {}): NightlyPageRead {
  return {
    url: "https://example.com/services",
    observedOn: "2026-09-03",
    status: 200,
    finalUrl: "https://example.com/services",
    noindex: false,
    canonical: "https://example.com/services",
    error: null,
    ...overrides,
  };
}

const before = (overrides: Partial<NightlyPageRead> = {}) =>
  new Map([[read().url, read({ observedOn: "2026-09-02", ...overrides })]]);

describe("watchFactsFromHtml", () => {
  it("reads the robots directive, the canonical and the title", () => {
    const facts = watchFactsFromHtml(
      `<html><head><title> Moving  quotes </title><meta name="robots" content="noindex, follow"><link rel="canonical" href="https://example.com/a"></head></html>`,
      null,
    );
    expect(facts).toEqual({
      noindex: true,
      robots: "noindex, follow",
      canonical: "https://example.com/a",
      title: "Moving quotes",
    });
  });

  it("takes noindex from the X-Robots-Tag header when the HTML says nothing", () => {
    expect(watchFactsFromHtml("<html></html>", "noindex").noindex).toBe(true);
    expect(watchFactsFromHtml("<html></html>", null)).toEqual({
      noindex: false,
      robots: null,
      canonical: null,
      title: null,
    });
  });

  it("reads a googlebot-addressed tag and a canonical among other rel values", () => {
    const facts = watchFactsFromHtml(
      `<meta name="googlebot" content="NOINDEX"><link rel="alternate canonical" href="/b">`,
      null,
    );
    expect(facts.noindex).toBe(true);
    expect(facts.canonical).toBe("/b");
  });
});

describe("compareNights", () => {
  it("says nothing when both nights read the same", () => {
    expect(compareNights(before(), [read()])).toEqual([]);
  });

  it("says nothing about an address with no earlier read", () => {
    expect(compareNights(new Map(), [read()])).toEqual([]);
  });

  it("never compares a read the server did not answer", () => {
    expect(compareNights(before(), [read({ status: null, error: "timed out" })])).toEqual([]);
  });

  it("grades a 4xx as removal and a 5xx as a slowdown, quoting the status doc for the first", () => {
    const gone = compareNights(before(), [read({ status: 404 })]);
    expect(gone.map((d) => d.rule)).toEqual(["page_stopped_answering"]);
    expect(gone[0]!.title).toBe(
      "/services answered HTTP 404 on 2026-09-03 after HTTP 200 on 2026-09-02",
    );
    expect(gone[0]!.description).toContain("All 4xx errors, except 429");
    expect(gone[0]!.businessImpact).toBe("high");

    const down = compareNights(before(), [read({ status: 503 })]);
    expect(down[0]!.businessImpact).toBe("medium");
    expect(down[0]!.evidence).toMatchObject({ statusBefore: 200, statusNow: 503 });
  });

  it("does not report a page that answered an error on both nights as newly gone", () => {
    expect(compareNights(before({ status: 404 }), [read({ status: 404 })])).toEqual([]);
  });

  it("reports a page that went noindex overnight, quoting the robots doc", () => {
    const drafts = compareNights(before(), [read({ noindex: true })]);
    expect(drafts.map((d) => d.rule)).toEqual(["page_went_noindex"]);
    expect(drafts[0]!.description).toContain("Do not show this page");
  });

  it("reports a canonical that changed, and only when both nights had one", () => {
    const changed = compareNights(before(), [read({ canonical: "https://example.com/other" })]);
    expect(changed.map((d) => d.rule)).toEqual(["page_canonical_changed"]);
    expect(changed[0]!.title).toContain("now names https://example.com/other");

    expect(compareNights(before({ canonical: null }), [read()])).toEqual([]);
  });
});
