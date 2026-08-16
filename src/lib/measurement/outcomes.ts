export type MeasurementWindow = { start: string; end: string; complete: boolean };

export type GscWindow = {
  window: MeasurementWindow;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type Ga4Window = {
  window: MeasurementWindow;
  views: number;
  sessions: number;
  engagementRate: number;
  leadEvents: number;
};

export type MeasuredOutcomeInput = {
  gsc: { baseline: GscWindow | null; followup: GscWindow | null };
  ga4: {
    connected: boolean;
    leadEventsConfigured: boolean;
    baseline: Ga4Window | null;
    followup: Ga4Window | null;
  } | null;
};

function difference(baseline: number, followup: number) {
  return {
    baseline,
    followup,
    absoluteDifference: followup - baseline,
    relativeDifference: baseline === 0 ? null : (followup - baseline) / baseline,
  };
}

export function buildMeasuredOutcome(input: MeasuredOutcomeInput) {
  const gaps: string[] = [];

  if (!input.gsc.baseline) gaps.push("The pre-publication GSC baseline is not available.");
  if (!input.gsc.followup) {
    gaps.push("Finalized post-publication GSC data is not available yet.");
  } else if (!input.gsc.followup.window.complete) {
    gaps.push("The GSC follow-up window is incomplete.");
  }

  const gsc =
    input.gsc.baseline && input.gsc.followup
      ? {
          windows: {
            baseline: input.gsc.baseline.window,
            followup: input.gsc.followup.window,
          },
          clicks: difference(input.gsc.baseline.clicks, input.gsc.followup.clicks),
          impressions: difference(input.gsc.baseline.impressions, input.gsc.followup.impressions),
          ctr: difference(input.gsc.baseline.ctr, input.gsc.followup.ctr),
          position: {
            ...difference(input.gsc.baseline.position, input.gsc.followup.position),
            interpretation: "A negative difference is a lower numeric average position.",
          },
        }
      : null;

  let ga4 = null;
  if (input.ga4 === null) {
    gaps.push("GA4 measurement was not requested or configured.");
  } else {
    if (!input.ga4.connected) gaps.push("GA4 Data API is not connected.");
    if (!input.ga4.leadEventsConfigured) {
      gaps.push("GA4 lead-event mapping is not configured.");
    }
    if (input.ga4.connected && !input.ga4.baseline) {
      gaps.push("The page has no stored GA4 baseline.");
    }
    if (input.ga4.connected && !input.ga4.followup) {
      gaps.push("The page has no stored GA4 follow-up window.");
    }
    if (input.ga4.followup && !input.ga4.followup.window.complete) {
      gaps.push("The GA4 follow-up window is incomplete.");
    }
    if (input.ga4.baseline && input.ga4.followup) {
      ga4 = {
        windows: {
          baseline: input.ga4.baseline.window,
          followup: input.ga4.followup.window,
        },
        views: difference(input.ga4.baseline.views, input.ga4.followup.views),
        sessions: difference(input.ga4.baseline.sessions, input.ga4.followup.sessions),
        engagementRate: difference(
          input.ga4.baseline.engagementRate,
          input.ga4.followup.engagementRate,
        ),
        leadEvents: difference(input.ga4.baseline.leadEvents, input.ga4.followup.leadEvents),
      };
    }
  }

  const waiting = !input.gsc.followup;
  const incomplete =
    Boolean(input.gsc.baseline && !input.gsc.baseline.window.complete) ||
    Boolean(input.gsc.followup && !input.gsc.followup.window.complete) ||
    Boolean(input.ga4?.baseline && !input.ga4.baseline.window.complete) ||
    Boolean(input.ga4?.followup && !input.ga4.followup.window.complete) ||
    ga4 === null;

  return {
    completeness: waiting
      ? ("waiting" as const)
      : incomplete
        ? ("partial" as const)
        : ("complete" as const),
    gsc,
    ga4,
    gaps,
  };
}
