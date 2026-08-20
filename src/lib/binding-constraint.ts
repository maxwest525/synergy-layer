/**
 * Which constraint binds, and therefore which suggestions matter right now.
 *
 * From the operator's own research
 * (`trumove-marketing-director/docs/research/agentic-marketing-fundamentals.md`):
 *
 *   "'best' is never a property of the candidate; it is a property of the
 *    candidate given a constraint that binds. The first job of any
 *    recommendation engine is to identify which constraint binds, not to rank
 *    candidates. A ranked list produced before that diagnosis is arbitrary
 *    regardless of how sophisticated the ranking is."
 *
 * The same document records the mistake this module exists to prevent: "a
 * CTR-gap ranking applied to a site whose binding constraint was visibility.
 * The ranking logic was sound and the answer was useless."
 *
 * The queue ranks by urgency and age. That ordering is exactly what the passage
 * warns about: for a site whose pages are not indexed, it will confidently sort
 * title rewrites while nothing can be found at all. This module supplies the
 * diagnosis that has to come first.
 *
 * The ladder is ordered, and the first unmet condition wins, because the states
 * are genuinely sequential: a page nobody sees cannot have a click problem, and
 * a page nobody clicks cannot have a conversion problem.
 */

/** The four states, in the order they bind. */
export type Constraint = "reachability" | "click" | "conversion" | "economics";

export type ConstraintFacts = {
  /** Pages we know exist, from the sitemap and the page audit. */
  readonly pagesKnown: number;
  /** Pages that appeared in search results at all during the window. */
  readonly pagesWithImpressions: number;
  readonly impressions: number;
  readonly clicks: number;
  /** Null when analytics is not connected, which is not the same as zero. */
  readonly sessions: number | null;
  /** Null when nothing measures conversion, which is not the same as none. */
  readonly conversions: number | null;
};

export type Diagnosis = {
  /** Null when the stored rows cannot support a diagnosis. */
  readonly constraint: Constraint | null;
  /** Why, in the operator's words, always naming the numbers it rests on. */
  readonly reason: string;
};

/**
 * Below this share of known pages ever being shown, being found is the problem
 * regardless of what else is true. A site where two thirds of pages have never
 * appeared in a result does not have a click-through problem.
 */
const REACHABLE_SHARE = 0.5;

/**
 * A click-through rate this far below the floor means the pages are being seen
 * and passed over. Google's own reported average across positions sits well
 * above this; a site under it is losing the click, not the ranking.
 */
const WEAK_CTR = 0.01;

export function bindingConstraint(facts: ConstraintFacts): Diagnosis {
  if (facts.pagesKnown === 0) {
    return {
      constraint: null,
      reason:
        "Nothing stored yet about which pages exist, so there is no way to tell what is holding you back. Run the page audit first.",
    };
  }

  // 1. Reachability. Nothing downstream can be diagnosed while the pages are
  //    not being found, and a zero here is a real measured zero.
  const reachableShare = facts.pagesWithImpressions / facts.pagesKnown;
  if (facts.impressions === 0 || reachableShare < REACHABLE_SHARE) {
    return {
      constraint: "reachability",
      reason:
        facts.pagesWithImpressions === 0
          ? `None of your ${facts.pagesKnown} pages showed up in Google at all. Until that changes, nothing about wording or rankings can help.`
          : `Only ${facts.pagesWithImpressions} of your ${facts.pagesKnown} pages showed up in Google at all. Getting the rest found matters more than improving the ones that already are.`,
    };
  }

  // 2. The click decision. They are being seen and not chosen.
  const ctr = facts.impressions > 0 ? facts.clicks / facts.impressions : 0;
  if (facts.clicks === 0 || ctr < WEAK_CTR) {
    return {
      constraint: "click",
      reason: `Your pages were shown ${facts.impressions} times and clicked ${facts.clicks} times. People are finding you and choosing someone else, so the wording they see is what matters now.`,
    };
  }

  // 3. Conversion. Only diagnosable when something actually measures it: an
  //    unconnected analytics account is not a site that fails to convert, and
  //    saying otherwise would be inventing a problem.
  if (facts.sessions === null || facts.conversions === null) {
    return {
      constraint: "click",
      reason: `Your pages were shown ${facts.impressions} times and clicked ${facts.clicks} times. What happens after the click is not connected, so that cannot be measured yet and the click is still the thing to work on.`,
    };
  }

  if (facts.conversions === 0) {
    return {
      constraint: "conversion",
      reason: `${facts.sessions} visits arrived and none of them turned into an enquiry. Getting more visitors will not help until that changes.`,
    };
  }

  // 4. Economics. Everything above is working, so the question becomes whether
  //    it pays.
  return {
    constraint: "economics",
    reason: `${facts.sessions} visits produced ${facts.conversions} enquiries. The funnel works, so what is left is whether it pays for itself.`,
  };
}

/**
 * The constraint a rule addresses, or null when it addresses none cleanly.
 *
 * Null is a real answer, not a gap. A position slip is a movement signal rather
 * than a diagnosis: it can matter under any constraint, so forcing it into a
 * bucket would make the partition claim something untrue.
 */
const CONSTRAINT_BY_RULE: Record<string, Constraint> = {
  // Not being found.
  zero_impression_page: "reachability",
  query_coverage_gap: "reachability",
  index_coverage_drift: "reachability",

  // Found, and passed over.
  weak_ctr_page: "click",
  striking_distance_query: "click",
  high_impression_low_ctr: "click",
  zero_click_page: "click",
};

export function constraintForRule(rule: string): Constraint | null {
  return CONSTRAINT_BY_RULE[rule] ?? null;
}

export type ConstraintSplit<T> = {
  /** Addresses the binding constraint. Work on these. */
  readonly addressing: readonly T[];
  /** Real, but not what is holding you back today. */
  readonly parked: readonly T[];
  /** Everything, unpartitioned, when no diagnosis was possible. */
  readonly undiagnosed: readonly T[];
};

/**
 * Splits a queue by whether each item addresses the binding constraint.
 *
 * Parked items are kept and counted, never hidden: the operator is told that
 * eleven other things are real but are not today's problem, which is a
 * different claim from pretending they do not exist.
 *
 * With no diagnosis, everything comes back undiagnosed and the caller keeps its
 * own order. Partitioning on a constraint we could not establish would be the
 * same arbitrary ranking in a new costume.
 */
export function partitionByConstraint<T>(
  items: readonly T[],
  binding: Constraint | null,
  ruleOf: (item: T) => string,
): ConstraintSplit<T> {
  if (binding === null) return { addressing: [], parked: [], undiagnosed: [...items] };

  const addressing: T[] = [];
  const parked: T[] = [];
  for (const item of items) {
    if (constraintForRule(ruleOf(item)) === binding) addressing.push(item);
    else parked.push(item);
  }
  return { addressing, parked, undiagnosed: [] };
}
