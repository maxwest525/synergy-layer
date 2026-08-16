import { describe, expect, it, vi } from "vitest";

import { collectTitleH1Evidence } from "./evidence.server";
import type { TitleH1Finding } from "./types";

const finding: TitleH1Finding = {
  id: "finding-1",
  rule: "high_impression_low_ctr",
  targetKind: "page",
  targetUrl: "https://trumoveinc.com/long-distance-moving",
  thresholdSatisfied: true,
  observedAt: "2026-08-10T12:00:00.000Z",
  sourceChecksum: "finding-checksum",
};

describe("title/H1 evidence collection", () => {
  it("normalizes live, GSC, and previously stored DataForSEO evidence", async () => {
    const paidCollection = vi.fn();
    const sources = {
      renderPage: vi.fn(async () => ({
        finalUrl: "https://trumoveinc.com/long-distance-moving",
        allowlisted: true,
        title: "  Long-Distance   Moving Services | TruMove ",
        h1s: [" Long-Distance   Moving Services "],
        mainText: " TruMove coordinates   long-distance moving services. ",
        observedAt: "2026-08-10T12:05:00.000Z",
      })),
      readGsc: vi.fn(async () => ({
        pageUrl: "https://trumoveinc.com/long-distance-moving",
        currentPeriod: { start: "2026-08-03", end: "2026-08-09" },
        comparisonPeriod: null,
        rows: [
          {
            query: " Long Distance Movers ",
            clicks: 3,
            impressions: 250,
            ctr: 0.012,
            position: 7.2,
          },
        ],
        observedAt: "2026-08-10T12:10:00.000Z",
      })),
      readStoredCompetitors: vi.fn(async () => [
        {
          query: " Long Distance Movers ",
          domain: "example-competitor.com",
          title: " Long Distance Movers ",
          h1: " Long Distance Moving ",
          observedAt: "2026-08-09T12:00:00.000Z",
          sourceChecksum: "stored-checksum",
          provider: "dataforseo" as const,
        },
      ]),
      readPreviousChanges: vi.fn(async () => []),
      paidCollection,
    };

    const bundle = await collectTitleH1Evidence(finding, sources);

    expect(bundle.live).toMatchObject({
      title: "Long-Distance Moving Services | TruMove",
      h1s: ["Long-Distance Moving Services"],
      mainText: "TruMove coordinates long-distance moving services.",
      contentChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(bundle.gsc).toMatchObject({
      rows: [expect.objectContaining({ query: "long distance movers" })],
      sourceChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(bundle.competitors[0]).toMatchObject({
      query: "long distance movers",
      title: "Long Distance Movers",
      h1: "Long Distance Moving",
      sourceChecksum: "stored-checksum",
    });
    expect(sources.readStoredCompetitors).toHaveBeenCalledWith({
      pageUrl: finding.targetUrl,
      queries: ["long distance movers"],
    });
    expect(paidCollection).not.toHaveBeenCalled();
  });

  it("returns an explicit source failure instead of a partial bundle", async () => {
    const sources = {
      renderPage: vi.fn(async () => {
        throw new Error("renderer unavailable");
      }),
      readGsc: vi.fn(async () => {
        throw new Error("should be collected independently");
      }),
      readStoredCompetitors: vi.fn(),
      readPreviousChanges: vi.fn(async () => []),
    };

    await expect(collectTitleH1Evidence(finding, sources)).rejects.toThrow(
      "Live webpage evidence failed: renderer unavailable",
    );
    expect(sources.readStoredCompetitors).not.toHaveBeenCalled();
  });
});
