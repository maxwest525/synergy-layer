/**
 * Orders keyword candidates for filing. Volume orders them, nothing filters
 * them: a candidate under some monthly volume used to be discarded before an
 * operator saw it (CONTENT-1), which was a judgement the tool made on the
 * operator's behalf with a number nobody chose. The cap is a cap on one run's
 * filing, and what it left unfiled is counted, never dropped silently.
 */
export type RankedCandidates<T> = {
  filed: T[];
  /** Candidates beyond the per-run cap, left for a later run. */
  beyondCap: number;
  /** Candidates the provider returned with no volume figure at all. */
  withoutVolume: number;
};

export function rankByVolume<T extends { searchVolume: number | null }>(
  candidates: readonly T[],
  cap: number,
): RankedCandidates<T> {
  const withoutVolume = candidates.filter((entry) => entry.searchVolume === null).length;
  // Known volumes first, highest first; unknown volumes keep their arrival
  // order after them rather than being read as zero.
  const ordered = [...candidates].sort((a, b) => {
    if (a.searchVolume === null && b.searchVolume === null) return 0;
    if (a.searchVolume === null) return 1;
    if (b.searchVolume === null) return -1;
    return b.searchVolume - a.searchVolume;
  });
  const filed = ordered.slice(0, Math.max(0, cap));
  return { filed, beyondCap: ordered.length - filed.length, withoutVolume };
}
