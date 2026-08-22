import { describe, expect, it } from "vitest";

import {
  buildAuditInstruction,
  findDuplicateWording,
  normalizeHeadline,
  rateLimitDelayMs,
  selectLatestObservations,
  type PageMetadataObservation,
} from "./page-audit";

function observation(
  url: string,
  title: string | null,
  h1: string | null,
  observedAt = "2026-08-19T00:00:00Z",
): PageMetadataObservation {
  return { url, finalUrl: url, title, h1, renderedBy: "Firecrawl", error: null, observedAt };
}

describe("page wording audit", () => {
  it("treats case and spacing differences as the same wording", () => {
    expect(normalizeHeadline("  Moving   Services ")).toBe(normalizeHeadline("moving services"));
    expect(normalizeHeadline("   ")).toBeNull();
  });

  it("reports every page that reuses a headline", () => {
    const duplicates = findDuplicateWording([
      observation("https://a.test/one", "One", "Trusted movers"),
      observation("https://a.test/two", "Two", "trusted  movers"),
      observation("https://a.test/three", "Three", "Corporate relocation"),
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      field: "h1",
      urls: ["https://a.test/one", "https://a.test/two"],
    });
  });

  it("ignores missing wording instead of grouping it", () => {
    expect(
      findDuplicateWording([
        observation("https://a.test/one", null, null),
        observation("https://a.test/two", null, null),
      ]),
    ).toEqual([]);
  });

  it("keeps only the newest read per page", () => {
    const latest = selectLatestObservations([
      observation("https://a.test/one", "Old", "Old", "2026-08-01T00:00:00Z"),
      observation("https://a.test/one", "New", "New", "2026-08-19T00:00:00Z"),
    ]);
    expect(latest).toHaveLength(1);
    expect(latest[0]!.title).toBe("New");
  });

  it("instructs the operator with the worst duplicate first", () => {
    const duplicates = findDuplicateWording([
      observation("https://a.test/one", "Same tab", "Same headline"),
      observation("https://a.test/two", "Same tab", "Same headline"),
      observation("https://a.test/three", "Other", "Same headline"),
    ]);
    expect(buildAuditInstruction({ observedPages: 3, failedPages: 0, duplicates })).toContain(
      "Same headline",
    );
    expect(buildAuditInstruction({ observedPages: 0, failedPages: 0, duplicates: [] })).toContain(
      "Run the page wording audit",
    );
  });
});

describe("waiting out a rate limited renderer", () => {
  it("waits exactly as long as the server asked", () => {
    expect(rateLimitDelayMs("5", 0)).toBe(5000);
  });

  it("backs off further each time when the server says nothing", () => {
    expect(rateLimitDelayMs(null, 0)).toBe(1000);
    expect(rateLimitDelayMs(null, 1)).toBe(2000);
    expect(rateLimitDelayMs(null, 2)).toBe(4000);
  });

  it("caps the wait, so one bad header cannot stall the whole run", () => {
    expect(rateLimitDelayMs("86400", 0)).toBe(30_000);
    expect(rateLimitDelayMs(null, 20)).toBe(30_000);
  });

  it("falls back to backing off when the header is a date or nonsense", () => {
    // Retry-After may carry an HTTP date. Rather than parse one, treat anything
    // that is not a plain number of seconds as absent and back off instead.
    expect(rateLimitDelayMs("Wed, 21 Oct 2026 07:28:00 GMT", 1)).toBe(2000);
    expect(rateLimitDelayMs("-3", 1)).toBe(2000);
  });
});
