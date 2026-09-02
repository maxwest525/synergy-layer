/**
 * Traffic and revenue impact on a recommendation.
 *
 * Until 2026-09-02 every rule module copied its business impact into these
 * two columns, so a finding read "revenue: high" on the strength of nothing.
 * No revenue evidence is collected anywhere in AOOS and no rule estimates
 * traffic, so the only truthful rendering of the default is the absence in
 * words (BACKLOG CODE-51, from AGT-3 in the 2026-09-02 review).
 */

export const NOT_ESTIMATED = "Not estimated";

/** True when a stored level is an estimate rather than the untouched default. */
export function isEstimated(level: string | null | undefined): boolean {
  return typeof level === "string" && level !== "" && level !== "none";
}

export function describeImpact(level: string | null | undefined): string {
  return isEstimated(level) ? (level as string) : NOT_ESTIMATED;
}

/**
 * Time saved on a recommendation. Every rule module writes `time_saved_minutes: 0`
 * because nothing in AOOS estimates it; the only non-zero values are the ones
 * typed into the 2026-08-04 seed rows. Zero is the untouched default, so it
 * reads as the absence it is (AGT-4).
 */
export function describeTimeSaved(minutes: number | null | undefined): string {
  return typeof minutes === "number" && minutes > 0 ? `${minutes} minutes` : NOT_ESTIMATED;
}
