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

export type OutcomeVerdict = "success" | "neutral" | "failure" | "too_early" | "unmeasurable";

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
};

export type OutcomeAssessment = {
  readonly verdict: OutcomeVerdict;
  /** Why, naming the numbers it rests on. */
  readonly reason: string;
};

/** 28d: a page shown this often has been given a real chance to be clicked. */
const REAL_EXPOSURE = 100;
/** 28d: clicks that count as the page having earned traffic. */
const EARNED_CLICKS = 5;
/** 56d and 90d: sustained visibility across the window. */
const SUSTAINED_IMPRESSIONS = 300;

function isGrounded(days: number): days is GroundedWindow {
  return (GROUNDED_WINDOWS as readonly number[]).includes(days);
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

  // 14 days asks one question only: did Google index it. Asking about clicks
  // this early would fail pages that are working exactly as intended.
  if (reading.windowDays === 14) {
    return reading.impressions > 0
      ? {
          verdict: "success",
          reason: `Google has indexed this page and shown it ${reading.impressions} times. That is all this first check asks.`,
        }
      : {
          verdict: "failure",
          reason:
            "Google has not shown this page once in two weeks, so it is probably not indexed. That is a technical problem, not a wording one.",
        };
  }

  if (reading.windowDays === 28) {
    if (reading.clicks >= EARNED_CLICKS) {
      return {
        verdict: "success",
        reason: `This page earned ${reading.clicks} clicks from ${reading.impressions} appearances in four weeks.`,
      };
    }
    if (reading.impressions >= REAL_EXPOSURE) {
      // The load-bearing rule. See the module comment.
      return {
        verdict: "neutral",
        reason: `Shown ${reading.impressions} times and clicked ${reading.clicks} times. Being shown without being clicked is not a failure in 2026: an AI Overview on the results page cuts clicks sharply even when your page is doing its job. Keep measuring.`,
      };
    }
    return {
      verdict: "failure",
      reason: `Shown only ${reading.impressions} times in four weeks and clicked ${reading.clicks} times. There is not enough visibility here for the wording to be the problem.`,
    };
  }

  // 56 and 90 days both ask whether the visibility held.
  if (reading.impressions >= SUSTAINED_IMPRESSIONS) {
    return {
      verdict: "success",
      reason: `Still being shown, ${reading.impressions} times over ${reading.windowDays} days. The gain held.`,
    };
  }
  if (reading.impressions > 0) {
    return {
      verdict: "neutral",
      reason: `Shown ${reading.impressions} times over ${reading.windowDays} days. Present but not growing, so it is worth watching rather than judging.`,
    };
  }
  return {
    verdict: "failure",
    reason: `Not shown once over ${reading.windowDays} days. Whatever visibility this had did not last.`,
  };
}
