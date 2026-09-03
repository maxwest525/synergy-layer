import type { Citation } from "./citation";

/**
 * Which sentence in which ingested source justifies each rule (CODE-98).
 *
 * The entries below are transcribed from chunks read out of this tenant's own
 * knowledge base on 2026-09-02, not from memory and not from the web. Each is
 * checked at test time against the stored chunk text, so an entry that drifts
 * from what the source says fails the build rather than sitting here as a
 * plausible sentence nobody re-read.
 *
 * Deliberately incomplete. Sixty-five rules are registered in this repository
 * and a handful are cited here. The gap is the finding, not an oversight to be
 * papered over by inventing quotes for the rest: a rule with no citation is a
 * rule resting on somebody's judgement, and `uncitedRules` names them so the
 * count is visible instead of implied.
 */
export const AUTHORITY = {
  /** "SEO & AEO Laws, Algorithms and Decision Models", ingested 2026-08-15. */
  seoAeoLaws: "playbook.seo-aeo-laws",
} as const;

export const RULE_CITATIONS: Readonly<Record<string, readonly Citation[]>> = {
  serp_rotation: [
    {
      source: AUTHORITY.seoAeoLaws,
      quote:
        "One intent gets one primary URL. Synonyms and close variants belong together when Google returns substantially the same results.",
      because:
        "Names the test as the result set rather than the wording, which is why rotation is read from what Google actually returned on each date instead of from how the phrases are spelled.",
    },
    {
      source: AUTHORITY.seoAeoLaws,
      quote: "Diagnostic law: never prescribe a later-stage fix for an earlier-stage failure.",
      because:
        "Why the finding states the observation and recommends nothing. Rotation is a Select-stage symptom, and the remedy depends on what each page is for.",
    },
  ],
  possible_query_overlap: [
    {
      source: AUTHORITY.seoAeoLaws,
      quote:
        "One intent gets one primary URL. Synonyms and close variants belong together when Google returns substantially the same results.",
      because:
        "The same law backs the co-listing test, which catches a live split on one SERP where rotation catches a choice changing across dates.",
    },
  ],
} as const;

/**
 * Rules registered in the repository that cite nothing.
 *
 * Passed in rather than imported so this module stays free of the rule registry
 * and can be unit tested on its own. The caller supplies every known rule id;
 * what comes back is the honest size of the gap.
 */
export function uncitedRules(allRuleIds: readonly string[]): string[] {
  return allRuleIds.filter((rule) => (RULE_CITATIONS[rule] ?? []).length === 0).sort();
}

/** Every distinct source the citations depend on, for the verifier to load. */
export function citedSources(): string[] {
  return [
    ...new Set(Object.values(RULE_CITATIONS).flatMap((list) => list.map((c) => c.source))),
  ].sort();
}
