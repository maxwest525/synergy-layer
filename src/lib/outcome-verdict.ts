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

import { confidenceInCountChange, MIN_BASELINE, type ConfidenceBand } from "./confidence";

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
  /**
   * True when the change altered only what Google *displays* (title, meta
   * description), not the page's own content or structure. Google may rewrite
   * either: "we may try to generate an improved title link from anchors,
   * on-page text, or other sources," and "we can't manually change title
   * links for individual sites." A fall after a wording-only change was never
   * verified as the wording actually shown, so it cannot be graded a failure.
   * https://developers.google.com/search/docs/appearance/title-link
   */
  readonly wordingTreatment: boolean;
};

/** The statistical confidence a graded verdict rests on, for the screen. */
export type VerdictConfidence = {
  /** 0 to MAX_CONFIDENCE, as `confidenceInCountChange` computes it. */
  readonly value: number;
  readonly band: ConfidenceBand;
};

export type OutcomeAssessment = {
  readonly verdict: OutcomeVerdict;
  /** Why, naming the numbers it rests on. */
  readonly reason: string;
  /**
   * Present on the verdicts that rest on a count comparison (success,
   * failure, and the neutral that a low confidence forces); absent where no
   * comparison was made. Rendered beside the verdict so a 0.4 and a 0.9 do
   * not read the same (MEAS-7).
   */
  readonly confidence?: VerdictConfidence;
};

function isGrounded(days: number): days is GroundedWindow {
  return (GROUNDED_WINDOWS as readonly number[]).includes(days);
}

/** The approval-baseline window's length. Fixed by the lifecycle trigger that cuts window-0 rows. */
const BASELINE_WINDOW_DAYS = 28;

/**
 * The site's own after/before ratio over the same weeks, or null when too
 * little site history is stored to trust it.
 *
 * `beforeImpressions` always covers the 28 day baseline window; `afterImpressions`
 * covers `windowDays`, which is 56 or 90 days at the windows this is used for.
 * Dividing the raw totals would carry that window-length factor straight into
 * the ratio (a flat site reads as having "risen" ×2 or ×3.21), so both sides
 * are converted to a per-day rate first.
 */
function siteRatio(trend: OutcomeReading["siteTrend"], windowDays: number): number | null {
  if (trend === null || trend.beforeImpressions < MIN_BASELINE) return null;
  const beforeRate = trend.beforeImpressions / BASELINE_WINDOW_DAYS;
  const afterRate = trend.afterImpressions / windowDays;
  return afterRate / beforeRate;
}

/**
 * Stated assumption: within ±5% we describe the site as holding flat; nothing
 * derives 5% — it only selects wording, never a verdict.
 */
const FLAT_SITE_BAND = 0.05;

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

  const scale = reading.windowDays / BASELINE_WINDOW_DAYS;
  const rawScaledBaselineImpressions = reading.baseline.impressions * scale;

  // Checked against the UNROUNDED scaled value, before any rounding happens.
  // Rounding first let a 3-impression baseline scaled ×3.21 at 90 days round
  // 9.64 up to 10 and clear the floor — a threshold moving because of display
  // rounding, which is exactly the kind of fabricated confidence this module
  // exists to refuse.
  if (rawScaledBaselineImpressions < MIN_BASELINE) {
    const scalingClause =
      scale === 1
        ? ""
        : `, about ${rawScaledBaselineImpressions.toFixed(1)} scaled to ${reading.windowDays} days`;
    return {
      verdict: "neutral",
      reason: `Only ${reading.baseline.impressions} in the 28 day baseline${scalingClause}, so a move to ${reading.impressions} is well inside ordinary variation. Too little happened to tell a change from noise.`,
    };
  }

  const scaleLabel = scale.toFixed(2).replace(/\.?0+$/, "");

  // Rounded once, here, and used everywhere below: an unrounded scaled count
  // (90 / 28 does not divide evenly) would otherwise leak a three-decimal
  // number into copy the operator reads, and into confidenceInCountChange's
  // own reason string, which quotes its "before" argument verbatim.
  const scaledBaselineImpressions = Math.round(rawScaledBaselineImpressions);
  const scaledBaselineClicks = Math.round(reading.baseline.clicks * scale);
  const scalingNote =
    scale === 1
      ? ""
      : ` (the ${reading.windowDays} day window is compared against the 28 day baseline scaled ×${scaleLabel}, ${reading.baseline.impressions} to ${scaledBaselineImpressions})`;
  // A standalone sentence carrying the same fact, for embedding after a full
  // stop rather than mid-sentence: appending scalingNote's lowercase
  // parenthetical straight after a period reads as a dangling fragment.
  const scalingSentence =
    scale === 1
      ? ""
      : ` The ${reading.windowDays} day window compares against the 28 day baseline scaled ×${scaleLabel}, ${reading.baseline.impressions} to ${scaledBaselineImpressions}.`;

  const confidence = confidenceInCountChange(scaledBaselineImpressions, reading.impressions);
  const rested = { value: confidence.value, band: confidence.band };
  if (confidence.band === "low") {
    return {
      verdict: "neutral",
      reason: `${confidence.reason}${scalingSentence}`,
      confidence: rested,
    };
  }

  if (reading.impressions < scaledBaselineImpressions) {
    // A fall. Clicks holding despite fewer impressions is the same AIO-shaped
    // rule as the zero-click case below: the page is still earning what it is
    // shown, so a drop in visibility alone is not graded a failure.
    if (reading.clicks >= scaledBaselineClicks) {
      if (reading.baseline.clicks === 0 && reading.clicks === 0) {
        // The AIO rationale from the module comment, restated where the
        // operator actually reads it: a page can fall in visibility and still
        // never have earned a click in either period, and that is not new.
        return {
          verdict: "neutral",
          reason: `Shown ${reading.impressions} times against a baseline of ${scaledBaselineImpressions}${scalingNote}, and it earned no clicks before this either. A page appearing in search but not clicked is not a failure: AI Overviews cut organic clicks by around 61% even when the page is doing its job.`,
        };
      }
      return {
        verdict: "neutral",
        reason: `Shown ${reading.impressions} times against a baseline of ${scaledBaselineImpressions}${scalingNote}, but clicks held at ${reading.clicks}. A page shown less but still earning its clicks is not a failure.`,
      };
    }
    if (reading.wordingTreatment) {
      return {
        verdict: "unmeasurable",
        reason: `The numbers fell, but this change only altered wording, and Google may be showing its own wording instead. It rewrites titles it doesn't like and no one can force the one on the page. Until what Google displays is verified, this is an unmeasured treatment, not a failed one.`,
      };
    }

    // A fall only counts as this page's doing once the site's own tide is
    // ruled out: a page falling no harder than the whole site fell is riding
    // a site-wide slump, not failing on its own.
    const fallTide = siteRatio(reading.siteTrend, reading.windowDays);
    const fallRatio = reading.impressions / scaledBaselineImpressions;
    if (fallTide !== null && fallTide <= 1 && fallRatio >= fallTide) {
      const fallRatioLabel = fallRatio.toFixed(1);
      const fallTideLabel = fallTide.toFixed(1);
      // Same rounding-collision guard as the rise branch: a page ×0.6 against
      // a site ×0.6 must not be presented as a contrast the printed numbers
      // don't carry.
      const siteClause =
        fallTideLabel === fallRatioLabel
          ? `the whole site kept pace (×${fallTideLabel})`
          : `the whole site fell as hard, ×${fallTideLabel}`;
      return {
        verdict: "neutral",
        reason: `Fell from ${scaledBaselineImpressions} to ${reading.impressions} impressions${scalingNote}, ×${fallRatioLabel}, but ${siteClause} over the same weeks, so this looks like the season, not the page.`,
      };
    }

    return {
      verdict: "failure",
      reason: `Fell from ${scaledBaselineImpressions} to ${reading.impressions} impressions${scalingNote}, and clicks fell with it, from ${scaledBaselineClicks} to ${reading.clicks}. ${confidence.reason}`,
      confidence: rested,
    };
  }

  // A rise. It only counts as this change's doing once the site's own tide is
  // ruled out: a page rising no faster than the whole site rose is riding the
  // tide, not the treatment.
  const tide = siteRatio(reading.siteTrend, reading.windowDays);
  const changeRatio = reading.impressions / scaledBaselineImpressions;
  if (tide !== null && changeRatio <= tide) {
    const changeRatioLabel = changeRatio.toFixed(1);
    const tideLabel = tide.toFixed(1);
    // At the rounded figure the two can coincide (a page ×2.18 against a site
    // ×2.22 both read as ×2.2). Asserting a contrast between two numbers that
    // print identically would read as a false precision the underlying counts
    // don't carry.
    const siteClause =
      tideLabel === changeRatioLabel
        ? `the whole site kept pace (×${tideLabel})`
        : `the whole site rose ×${tideLabel}`;
    return {
      verdict: "neutral",
      reason: `Rose from ${scaledBaselineImpressions} to ${reading.impressions} impressions${scalingNote}, ×${changeRatioLabel}, but ${siteClause} over the same weeks, so this is the tide, not the treatment.`,
    };
  }

  // Being shown more only counts as a win once it earns at least as much as
  // before, scaled the same way. A rise in impressions with clicks collapsing
  // is being seen more while earning less, which is not yet a win either way.
  if (reading.clicks < scaledBaselineClicks) {
    return {
      verdict: "neutral",
      reason: `Shown ${reading.impressions} times against a baseline of ${scaledBaselineImpressions}${scalingNote} (×${changeRatio.toFixed(1)} more), but clicks fell from ${scaledBaselineClicks} to ${reading.clicks}. Being seen more while earning less is not yet a win.`,
    };
  }

  const tideLabelForSuccess = tide === null ? null : tide.toFixed(1);
  const changeRatioLabelForSuccess = changeRatio.toFixed(1);
  const tideNote =
    tide === null
      ? " No site trend was stored to compare against, so call this a success qualified, not certain."
      : tide >= 1 - FLAT_SITE_BAND && tide <= 1 + FLAT_SITE_BAND
        ? " The site held flat over the same weeks, so this looks like the treatment, not the tide."
        : // Same rounding-collision guard as the tide-neutral branch above: a
          // site ×2.16 against a page ×2.24 can both print as ×2.2, and
          // asserting "less than" between two identical printed numbers is a
          // false precision the underlying counts don't carry.
          tideLabelForSuccess === changeRatioLabelForSuccess
          ? ` The site itself kept pace, ×${tideLabelForSuccess}, over the same weeks.`
          : ` The site itself moved ×${tideLabelForSuccess} over the same weeks, less than this page's ×${changeRatioLabelForSuccess}.`;
  return {
    verdict: "success",
    reason: `Rose from ${scaledBaselineImpressions} to ${reading.impressions} impressions${scalingNote}.${tideNote}`,
    confidence: rested,
  };
}
