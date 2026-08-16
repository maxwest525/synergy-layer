import { describe, expect, it } from "vitest";

import { buildMeasuredOutcome } from "./outcomes";

const gsc = {
  baseline: {
    window: { start: "2026-07-01", end: "2026-07-28", complete: true },
    clicks: 100,
    impressions: 10_000,
    ctr: 0.01,
    position: 8,
  },
  followup: {
    window: { start: "2026-08-15", end: "2026-09-11", complete: true },
    clicks: 130,
    impressions: 11_000,
    ctr: 130 / 11_000,
    position: 6.5,
  },
};

const ga4 = {
  connected: true,
  leadEventsConfigured: true,
  baseline: {
    window: { start: "2026-07-01", end: "2026-07-28", complete: true },
    views: 500,
    sessions: 400,
    engagementRate: 0.55,
    leadEvents: 20,
  },
  followup: {
    window: { start: "2026-08-15", end: "2026-09-11", complete: true },
    views: 540,
    sessions: 430,
    engagementRate: 0.58,
    leadEvents: 24,
  },
};

describe("measured title/H1 outcomes", () => {
  it("shows source windows and differences without a verdict", () => {
    const view = buildMeasuredOutcome({ gsc, ga4 });

    expect(view).not.toHaveProperty("success");
    expect(JSON.stringify(view)).not.toMatch(/successful|winner|caused/i);
    expect(view).toMatchObject({
      completeness: "complete",
      gsc: {
        clicks: { baseline: 100, followup: 130, absoluteDifference: 30, relativeDifference: 0.3 },
        position: { baseline: 8, followup: 6.5, absoluteDifference: -1.5 },
      },
      ga4: {
        leadEvents: { baseline: 20, followup: 24, absoluteDifference: 4 },
      },
      gaps: [],
    });
  });

  it("reports GSC lag and disconnected GA4 as explicit gaps", () => {
    const view = buildMeasuredOutcome({
      gsc: { baseline: gsc.baseline, followup: null },
      ga4: { connected: false, leadEventsConfigured: false, baseline: null, followup: null },
    });

    expect(view).toMatchObject({
      completeness: "waiting",
      gsc: null,
      ga4: null,
      gaps: expect.arrayContaining([
        "Finalized post-publication GSC data is not available yet.",
        "GA4 Data API is not connected.",
        "GA4 lead-event mapping is not configured.",
      ]),
    });
  });

  it("marks partial windows and avoids invalid relative division", () => {
    const view = buildMeasuredOutcome({
      gsc: {
        baseline: { ...gsc.baseline, clicks: 0 },
        followup: { ...gsc.followup, window: { ...gsc.followup.window, complete: false } },
      },
      ga4: null,
    });

    expect(view).toMatchObject({
      completeness: "partial",
      gsc: { clicks: { relativeDifference: null } },
      gaps: expect.arrayContaining([
        "The GSC follow-up window is incomplete.",
        "GA4 measurement was not requested or configured.",
      ]),
    });
  });
});
