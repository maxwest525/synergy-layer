/**
 * How much a change in a count is worth believing.
 *
 * Twenty-odd findings across `seo-validation.server.ts` carry a bare
 * `confidence: 0.7`. Nothing derives those numbers, and they do not move when
 * the evidence does: a click drop from 400 to 100 and one from 8 to 6 both
 * arrive on screen at 0.7. That is the same defect as the unaccounted-for
 * measurement windows, one layer down.
 *
 * This derives the number instead. Counts of clicks and impressions are
 * arrivals, so the noise floor is set by how many there were: the standard
 * error on a count of n is about the square root of n. A change worth believing
 * is one that clears that floor.
 *
 * The comparison uses the variance-stabilising form for counts, `2(√after -
 * √before)`, which behaves at the small counts this property actually has
 * rather than only in the large-sample limit where a plain normal
 * approximation works.
 */

/**
 * How much noisier real web traffic is than pure arrivals.
 *
 * Clicks are not independent: they cluster by day of week, by campaign, by
 * season. That correlation inflates the variance above the count itself, and
 * ignoring it would make every wobble look significant. Daily web counts
 * typically sit between two and four times the Poisson variance; three is the
 * middle of that range.
 *
 * This is an assumption, and it is stated here rather than buried. Getting it
 * wrong moves how confident a finding is; it cannot flip which direction the
 * change went, and it cannot manufacture a finding out of a change that did not
 * happen.
 */
export const DISPERSION = 3;

/**
 * Below this many events in the earlier period there is no floor to clear.
 * A drop from 8 to 2 is arithmetically dramatic and evidentially nothing.
 */
export const MIN_BASELINE = 10;

/** Two numbers never justify near-certainty, however far apart they are. */
export const MAX_CONFIDENCE = 0.9;

export type ConfidenceBand = "low" | "medium" | "high";

export type Confidence = {
  /** 0 to {@link MAX_CONFIDENCE}. */
  readonly value: number;
  readonly band: ConfidenceBand;
  /** Why, in words the operator can read, always naming the counts it rests on. */
  readonly reason: string;
};

/** Abramowitz and Stegun 7.1.26. Accurate to about 1e-7, which is far past what is claimed. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const series =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - series * Math.exp(-z * z));
}

/** The share of a normal distribution within `z` standard deviations of its centre. */
function withinZ(z: number): number {
  return erf(Math.abs(z) / Math.SQRT2);
}

function bandOf(value: number): ConfidenceBand {
  if (value >= 0.75) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

/**
 * How far apart two counts are, measured in standard deviations of the noise.
 *
 * Exported because it is the number worth arguing about. A caller that wants a
 * different threshold should read this rather than re-deriving it.
 */
export function countChangeZ(before: number, after: number): number {
  return (2 * (Math.sqrt(after) - Math.sqrt(before))) / Math.sqrt(DISPERSION);
}

/**
 * How much to believe that a count really changed, rather than wobbled.
 *
 * Returns a low confidence with its reason rather than refusing: the finding is
 * still worth recording, it just must not be presented as firm. A confidence
 * this function cannot justify is the one it reports.
 */
export function confidenceInCountChange(before: number, after: number): Confidence {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0) {
    return {
      value: 0,
      band: "low",
      reason: "The counts behind this are not readable, so there is nothing to judge it on.",
    };
  }

  if (before < MIN_BASELINE) {
    return {
      value: 0.1,
      band: "low",
      reason: `Only ${before} in the earlier period, so a move to ${after} is well inside ordinary variation. Too little happened to tell a change from noise.`,
    };
  }

  if (before === after) {
    return {
      value: 0,
      band: "low",
      reason: `Both periods hold ${before}, so nothing changed to be confident about.`,
    };
  }

  const z = countChangeZ(before, after);
  const value = Math.min(MAX_CONFIDENCE, Math.round(withinZ(z) * 100) / 100);
  const direction = after > before ? "rise" : "fall";

  return {
    value,
    band: bandOf(value),
    reason:
      value >= 0.75
        ? `A ${direction} from ${before} to ${after} is around ${Math.abs(z).toFixed(1)} times the ordinary swing at this volume, so it is very unlikely to be noise.`
        : value >= 0.4
          ? `A ${direction} from ${before} to ${after} is about ${Math.abs(z).toFixed(1)} times the ordinary swing at this volume. Real enough to look at, not firm enough to act on alone.`
          : `A ${direction} from ${before} to ${after} is within the ordinary swing at this volume, so it may well be noise.`,
  };
}

/**
 * The confidence for a finding that rests on a count existing rather than on it
 * having moved: a page with impressions and no clicks at all, for instance.
 *
 * There is no before period to compare against, so the only question is whether
 * enough happened for the absence to mean anything.
 */
export function confidenceInCount(count: number, needed: number): Confidence {
  if (!Number.isFinite(count) || count < 0) {
    return {
      value: 0,
      band: "low",
      reason: "The count behind this is not readable, so there is nothing to judge it on.",
    };
  }
  if (count < needed) {
    return {
      value: Math.round((count / needed) * 0.4 * 100) / 100,
      band: "low",
      reason: `Only ${count} of the ${needed} needed before this reads as a pattern rather than a quiet week.`,
    };
  }
  // Saturates: past the threshold, more evidence helps, but with diminishing
  // returns, and never reaches certainty from one window.
  const value = Math.min(MAX_CONFIDENCE, Math.round((1 - Math.exp(-count / needed)) * 100) / 100);
  return {
    value,
    band: bandOf(value),
    reason: `${count} observed against the ${needed} needed, so this is a pattern rather than a quiet week.`,
  };
}
