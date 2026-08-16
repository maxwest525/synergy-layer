import { describe, expect, it } from "vitest";

import type { TitleH1Draft, TitleH1EvidenceBundle } from "./types";
import { validateTitleH1Draft } from "./validation";

function evidence(): TitleH1EvidenceBundle {
  return {
    finding: {
      id: "finding-1",
      rule: "high_impression_low_ctr",
      targetKind: "page",
      targetUrl: "https://trumoveinc.com/long-distance-moving",
      thresholdSatisfied: true,
      observedAt: "2026-08-10T12:00:00.000Z",
      sourceChecksum: "finding-checksum",
    },
    live: {
      requestedUrl: "https://trumoveinc.com/long-distance-moving",
      finalUrl: "https://trumoveinc.com/long-distance-moving",
      allowlisted: true,
      title: "Long-Distance Moving Services | TruMove",
      h1s: ["Long-Distance Moving Services"],
      mainText:
        "TruMove coordinates long-distance moving services across the United States for household moves.",
      observedAt: "2026-08-10T12:05:00.000Z",
      contentChecksum: "live-checksum",
    },
    gsc: {
      pageUrl: "https://trumoveinc.com/long-distance-moving",
      currentPeriod: { start: "2026-08-03", end: "2026-08-09" },
      comparisonPeriod: null,
      rows: [
        {
          query: "long distance movers",
          clicks: 3,
          impressions: 250,
          ctr: 0.012,
          position: 7.2,
        },
      ],
      observedAt: "2026-08-10T12:10:00.000Z",
      sourceChecksum: "gsc-checksum",
    },
    competitors: [
      {
        query: "long distance movers",
        domain: "competitor.example",
        title: "Long Distance Movers",
        h1: "Long Distance Moving",
        observedAt: "2026-08-09T12:00:00.000Z",
        sourceChecksum: "competitor-checksum",
        provider: "dataforseo",
      },
    ],
    ga4: null,
    previousChanges: [],
  };
}

function draft(overrides: Partial<TitleH1Draft> = {}): TitleH1Draft {
  return {
    proposedTitle: "Long Distance Movers & Moving Services | TruMove",
    proposedH1: "Long-Distance Movers for Household Moves",
    rationale: "Uses the observed query while retaining supported service wording.",
    expectedMetric: "ctr",
    confidenceRationale: "Live, GSC, and competitor sources agree.",
    verification: "Compare finalized page-level Search Console CTR windows.",
    reversal: "Restore the captured title and H1.",
    claims: ["long-distance moving services", "household moves"],
    ...overrides,
  };
}

describe("deterministic title/H1 validation", () => {
  it("accepts a supported proposal and derives confidence from evidence", () => {
    const result = validateTitleH1Draft(evidence(), draft());
    expect(result).toMatchObject({
      valid: true,
      confidence: expect.any(Number),
      confidenceInputs: { sourceCoverage: 1, claimCoverage: 1 },
    });
    expect(result).not.toHaveProperty("modelConfidence");
  });

  it("rejects unchanged, empty, and invalid metrics", () => {
    const unchanged = validateTitleH1Draft(
      evidence(),
      draft({
        proposedTitle: "Long-Distance Moving Services | TruMove",
        proposedH1: "Long-Distance Moving Services",
      }),
    );
    expect(unchanged).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "unchanged_title" }),
        expect.objectContaining({ code: "unchanged_h1" }),
      ]),
    });

    const malformed = validateTitleH1Draft(
      evidence(),
      draft({ proposedTitle: "", expectedMetric: "engagement" as TitleH1Draft["expectedMetric"] }),
    );
    expect(malformed).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "missing_title" }),
        expect.objectContaining({ code: "invalid_expected_metric" }),
      ]),
    });
  });

  it("rejects unsupported guarantees, locations, and service claims", () => {
    const result = validateTitleH1Draft(
      evidence(),
      draft({
        proposedTitle: "Guaranteed Dallas Long Distance Movers | TruMove",
        proposedH1: "The Best Dallas Office Movers",
        claims: ["Dallas", "office moves", "guaranteed"],
      }),
    );
    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "prohibited_wording" }),
        expect.objectContaining({ code: "unsupported_claim" }),
      ]),
    });
  });

  it("rejects competitor names and duplicate owned title/H1 pairs", () => {
    const result = validateTitleH1Draft(
      evidence(),
      draft({ proposedTitle: "Competitor Long Distance Movers | TruMove" }),
      {
        currentLive: {
          title: "Long-Distance Moving Services | TruMove",
          h1: "Long-Distance Moving Services",
        },
        ownedPairs: [
          {
            title: "Competitor Long Distance Movers | TruMove",
            h1: "Long-Distance Movers for Household Moves",
          },
        ],
      },
    );
    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: "competitor_name" }),
        expect.objectContaining({ code: "duplicate_owned_pair" }),
      ]),
    });
  });

  it("rejects live-before drift", () => {
    const result = validateTitleH1Draft(evidence(), draft(), {
      currentLive: { title: "A newer title", h1: "Long-Distance Moving Services" },
      ownedPairs: [],
    });
    expect(result).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ code: "live_before_mismatch" })],
    });
  });
});
