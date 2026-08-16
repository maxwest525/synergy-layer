import { describe, expect, it } from "vitest";

import type { TitleH1EvidenceBundle } from "./types";
import { assessTitleH1Evidence } from "./sufficiency";

function completeBundle(overrides: Partial<TitleH1EvidenceBundle> = {}): TitleH1EvidenceBundle {
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
      mainText: "TruMove coordinates long-distance moving services across the United States.",
      observedAt: "2026-08-10T12:05:00.000Z",
      contentChecksum: "live-checksum",
    },
    gsc: {
      pageUrl: "https://trumoveinc.com/long-distance-moving",
      currentPeriod: { start: "2026-08-03", end: "2026-08-09" },
      comparisonPeriod: { start: "2026-07-27", end: "2026-08-02" },
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
        domain: "example-competitor.com",
        title: "Long Distance Movers",
        h1: "Long Distance Moving",
        observedAt: "2026-08-09T12:00:00.000Z",
        sourceChecksum: "competitor-checksum",
        provider: "dataforseo",
      },
    ],
    ga4: null,
    previousChanges: [],
    ...overrides,
  };
}

describe("title/H1 evidence sufficiency", () => {
  it("does not require GA4 to generate a proposal", () => {
    expect(assessTitleH1Evidence(completeBundle({ ga4: null }))).toEqual({ eligible: true });
  });

  it("blocks missing relevant stored competitor evidence", () => {
    expect(assessTitleH1Evidence(completeBundle({ competitors: [] }))).toMatchObject({
      eligible: false,
      reasons: [{ code: "missing_competitor_evidence" }],
    });
  });

  it("blocks ambiguous live headings", () => {
    const bundle = completeBundle();
    bundle.live.h1s = ["Long-Distance Moving", "Moving Services"];
    expect(assessTitleH1Evidence(bundle)).toMatchObject({
      eligible: false,
      reasons: [{ code: "ambiguous_live_h1" }],
    });
  });

  it("blocks page findings without page-level GSC evidence", () => {
    const bundle = completeBundle();
    bundle.gsc.rows = [];
    expect(assessTitleH1Evidence(bundle)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining([expect.objectContaining({ code: "missing_gsc_evidence" })]),
    });
  });

  it("blocks rules and targets outside this proposal type", () => {
    const bundle = completeBundle();
    bundle.finding.rule = "competitor_outranks_owned";
    bundle.finding.targetKind = "query";
    expect(assessTitleH1Evidence(bundle)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining([expect.objectContaining({ code: "ineligible_finding" })]),
    });
  });

  it("requires source timestamps and checksums", () => {
    const bundle = completeBundle();
    bundle.live.contentChecksum = "";
    bundle.competitors[0]!.observedAt = "";
    expect(assessTitleH1Evidence(bundle)).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining([
        expect.objectContaining({ code: "missing_source_provenance" }),
      ]),
    });
  });
});
