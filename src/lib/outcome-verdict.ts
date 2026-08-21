/**
 * Did the fix work?
 *
 * The measurement layer has never answered this. `describeOutcome` deliberately
 * refuses to give a verdict, which is defensible on its own terms and leaves
 * the operator to judge outcomes themselves, which is the one thing a
 * non-expert operator cannot do. So changes go live, the windows open, and
 * nothing ever reads them back.
 *
 * The thresholds below are not invented. They are the table from the operator's
 * own research run, `mark/05-logs/trumove-seo-geo-strategy-2026.md`, under a
 * heading that names the problem it exists to solve: **"Prediction-engine
 * thresholds (evidence-based, replacing vibes)"**. That run went 5 search
 * angles to 22 sources to 109 extracted claims, of which 25 were adversarially
 * verified with three independent verifier votes each: 19 confirmed, 1 refuted.
 *
 * The single most important line in it, and the reason this module cannot be a
 * naive "clicks went up or down" check:
 *
 *   "the 0-clicks-with-impressions to neutral rule is directly justified by the
 *    verified 61% / 20-35% AIO click-suppression findings: a page appearing in
 *    search but unclicked is *not* a failed page in 2026."
 *
 * Grading such a page as a failure would tell the operator to undo work that is
 * doing exactly what it should.
 */

import { confidenceInCountChange, MIN_BASELINE } from "./confidence";

/**
 * The windows the research actually grounds.
 *
 * The stored constant is `[0, 7, 14, 28]`. The research says 14, 28, 56, 90.
 * **7 appears nowhere in it**, and appears nowhere as a measurement window in
 * any of the six repositories searched; its only sibling anywhere is a
 * cold-email follow-up cadence, `followUpDays: [3, 7, 14, 28]`. 56 and 90 were
 * derived and then dropped.
 */
export const GROUNDED_WINDOWS = [14, 28, 56, 90] as const;

export type GroundedWindow = (typeof GROUNDED_WINDOWS)[number];

export type OutcomeVerdict =
  "success" | "neutral" | "failure" | "not_yet" | "too_early" | "unmeasurable";

export type OutcomeReading = {
  readonly windowDays: number;
  /** Days since the change was proven live on the rendered page. */
  readonly daysSinceLive: number;
  readonly impressions: number;
  readonly clicks: number;
  /**
   * False when the published URL sits outside the connected Search Console
   * property, so nothing can read it. Not the same as having failed.
   */
  readonly measurable: boolean;
  /** The 28 days ending the day before approval, from the stored window-0 GSC observation. Null when never stored — stated, not defaulted. */
  readonly baseline: { readonly impressions: number; readonly clicks: number } | null;
  /** Site-wide impressions over the same before/after pair, from property_totals daily snapshots. Null when fewer days are stored than the pair needs. */
  readonly siteTrend: {
    readonly beforeImpressions: number;
    readonly afterImpressions: number;
  } | null;
};

export type OutcomeAssessment = {
  readonly verdict: OutcomeVerdict;
  /** Why, naming the numbers it rests on. */
  readonly reason: string;
};

function isGrounded(days: number): days is GroundedWindow {
  return (GROUNDED_WINDOWS as readonly number[]).includes(days);
}

/** The site's own after/before ratio over the same weeks, or null when too little site history is stored to trust it. */
function siteRatio(trend: OutcomeReading["siteTrend"]): number | null {
  if (trend === null || trend.beforeImpressions < MIN_BASELINE) return null;
  return trend.afterImpressions / trend.beforeImpressions;
}

/**
 * The verdict for one window, or an honest refusal.
 *
 * Order matters. Measurability and elapsed time are checked before any
 * threshold, because a verdict computed from a window that has not closed, or
 * from a page nothing can see, would be a fabricated result wearing the same
 * shape as a real one.
 */
export function outcomeVerdict(reading: OutcomeReading): OutcomeAssessment {
  if (!reading.measurable) {
    return {
      verdict: "unmeasurable",
      reason:
        "This page sits outside the connected Search Console property, so nothing here can measure it. Publish it on the connected domain to make its outcome readable.",
    };
  }

  if (!isGrounded(reading.windowDays)) {
    return {
      verdict: "unmeasurable",
      reason: `${reading.windowDays} days is not one of the windows this system grades on, so no verdict is given rather than inventing one.`,
    };
  }

  if (reading.daysSinceLive < reading.windowDays) {
    const left = reading.windowDays - reading.daysSinceLive;
    return {
      verdict: "too_early",
      reason: `The ${reading.windowDays} day window has not closed yet. ${left} more ${left === 1 ? "day" : "days"} before there is anything to judge.`,
    };
  }

  // 14 days asks one question only: has Google seen it yet. Asking about
  // clicks this early would fail pages that are working exactly as intended.
  // The honest negative answer at 14 days is *not yet*, not failure: Google's
  // own recrawl timeline says this can take a few days to a few weeks.
  // https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
  if (reading.windowDays === 14) {
    return reading.impressions > 0
      ? {
          verdict: "success",
          reason: `Google has indexed this page and shown it ${reading.impressions} times. That is all this first check asks.`,
        }
      : {
          verdict: "not_yet",
          reason:
            "Google has not shown this page yet. Google's own timeline says recrawling alone can take a few days to a few weeks, so two quiet weeks is normal, not a failure. Keep waiting.",
        };
  }

  // 28, 56 and 90 days all ask the same question: did this change move the
  // number, against the site's own before picture and the site's own tide?
  // The level alone answers neither, which is why it is never used here.
  if (reading.baseline === null) {
    return {
      verdict: "neutral",
      reason:
        "No before picture was stored for this change, so there is nothing honest to compare against. The level alone cannot say whether the fix did anything.",
    };
  }

  const scale = reading.windowDays / 28;
  const scaledBaselineImpressions = reading.baseline.impressions * scale;
  const scaledBaselineClicks = reading.baseline.clicks * scale;
  const scalingNote =
    scale === 1
      ? ""
      : ` (the ${reading.windowDays} day window is compared against the 28 day baseline scaled ×${scale.toFixed(2).replace(/\.?0+$/, "")}, ${reading.baseline.impressions} to ${Math.round(scaledBaselineImpressions)})`;

  const confidence = confidenceInCountChange(scaledBaselineImpressions, reading.impressions);
  if (confidence.band === "low") {
    return { verdict: "neutral", reason: confidence.reason };
  }

  if (reading.impressions < scaledBaselineImpressions) {
    // A fall. Clicks holding despite fewer impressions is the same AIO-shaped
    // rule as the zero-click case below: the page is still earning what it is
    // shown, so a drop in visibility alone is not graded a failure.
    if (reading.clicks >= scaledBaselineClicks) {
      return {
        verdict: "neutral",
        reason: `Shown ${reading.impressions} times against a baseline of ${Math.round(scaledBaselineImpressions)}${scalingNote}, but clicks held at ${reading.clicks}. A page shown less but still earning its clicks is not a failure.`,
      };
    }
    return {
      verdict: "failure",
      reason: `Fell from ${Math.round(scaledBaselineImpressions)} to ${reading.impressions} impressions${scalingNote}, and clicks fell with it, from ${Math.round(scaledBaselineClicks)} to ${reading.clicks}. ${confidence.reason}`,
    };
  }

  // A rise. It only counts as this change's doing once the site's own tide is
  // ruled out: a page rising no faster than the whole site rose is riding the
  // tide, not the treatment.
  const tide = siteRatio(reading.siteTrend);
  const changeRatio = reading.impressions / scaledBaselineImpressions;
  if (tide !== null && changeRatio <= tide) {
    return {
      verdict: "neutral",
      reason: `Rose from ${Math.round(scaledBaselineImpressions)} to ${reading.impressions} impressions, ×${changeRatio.toFixed(1)}, but the whole site rose ×${tide.toFixed(1)} over the same weeks, so this is the tide, not the treatment.`,
    };
  }
  const tideNote =
    tide === null
      ? " No site trend was stored to compare against, so call this a success qualified, not certain."
      : tide >= 0.95 && tide <= 1.05
        ? " The site held flat over the same weeks, so this looks like the treatment, not the tide."
        : ` The site itself moved ×${tide.toFixed(1)} over the same weeks, less than this page's ×${changeRatio.toFixed(1)}.`;
  return {
    verdict: "success",
    reason: `Rose from ${Math.round(scaledBaselineImpressions)} to ${reading.impressions} impressions${scalingNote}.${tideNote}`,
  };
}
