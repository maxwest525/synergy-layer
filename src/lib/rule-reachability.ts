/**
 * Which rules can fire on this site, and what each one is waiting for.
 *
 * Every threshold in this system was written for a property with far more
 * traffic than this one. The best finalized day is eighteen impressions across
 * the whole site; the rules ask for two hundred on a single page. So the rules
 * do not fire, and the operator sees an empty screen that reads as either "all
 * good" or "this thing is broken". Neither is true.
 *
 * This module makes the third answer sayable: the rule is fine, the site is
 * fine, and there is not yet enough evidence for the question to have an
 * answer. It names the number each rule needs and the number the site actually
 * has, so silence stops being ambiguous.
 *
 * It deliberately does not lower anything. Lowering a threshold until a rule
 * fires is how a system starts reporting noise as findings, which is worse than
 * silence and is the failure this project exists to prevent.
 *
 * See `.claude/skills/seo-measurement/SKILL.md` for the sourcing rules, and
 * `docs/handoffs/2026-08-20-rule-thresholds-audit.md` for the work order this
 * is the first piece of.
 */

/**
 * How answerable a question is at all, independent of this site's volume.
 *
 * This is the distinction that matters most, because two of these can be fixed
 * by waiting and one cannot.
 */
export type Answerability =
  /** A fact about the page. No threshold, no statistics, true at any volume. */
  | "any_volume"
  /** Needs more evidence than the site currently produces. Waiting fixes it. */
  | "needs_volume"
  /**
   * Cannot be answered per page at any volume this site will reach soon, but
   * can be answered across a group of pages. Waiting does not fix it; changing
   * the unit of analysis does.
   */
  | "pooled_only";

/**
 * Which set of rows a rule reads.
 *
 * This decides which count its threshold is measured against, and getting it
 * wrong is not cosmetic: a page with forty impressions spread over twelve
 * searches clears a page-level floor of twenty-five and clears no query-level
 * floor at all.
 */
export type RuleDimension = "page" | "query" | "page_query";

/** What one rule needs before it can say anything. */
export type RuleRequirement = {
  readonly rule: string;
  readonly label: string;
  readonly dimension: RuleDimension;
  readonly answerability: Answerability;
  /** The volume threshold, measured against the row set named by `dimension`. */
  readonly needs: { readonly amount: number; readonly unit: "impressions" | "clicks" } | null;
  /**
   * A condition other than volume that also has to hold, or null.
   *
   * Recorded because volume is often not what binds first. Six rules compare
   * against a prior window and cannot fire at any volume until a second
   * collection has run, and two read stored rows from a different table
   * entirely. A registry that listed only the impression floor would report
   * those as reachable while they sat waiting on something else.
   */
  readonly alsoNeeds: string | null;
  /**
   * Where the number came from, or null when nothing derives it.
   *
   * Every one of these is currently null. That is not an oversight in this
   * file: it is the finding. Thirteen rules decide what the operator is told,
   * and not one of them rests on a citation.
   */
  readonly source: string | null;
};

/**
 * The rules, and what each one is actually waiting for.
 *
 * `needs` carries the binding threshold only. Several rules have more than one
 * condition; the one recorded here is whichever fails first on a low-traffic
 * property, because that is the one the operator would have to clear.
 */
export const RULE_REQUIREMENTS: readonly RuleRequirement[] = [
  {
    rule: "zero_impression_page",
    label: "A page Google has never shown",
    dimension: "page",
    // A page appearing zero times is a fact about the page, not an inference
    // from a sample, so no volume is required to state it.
    answerability: "any_volume",
    needs: null,
    alsoNeeds: "the page audit to have read the page at least once",
    source: null,
  },
  {
    rule: "index_coverage_drift",
    label: "Pages dropping out of Google's index",
    dimension: "page",
    answerability: "any_volume",
    needs: null,
    alsoNeeds: "a stored URL inspection to compare against",
    source: null,
  },
  {
    rule: "declining_clicks",
    label: "Clicks falling on a page",
    dimension: "page",
    // A click count trend, not a rate estimate: it fires the moment one page
    // accumulates ten clicks in a window, so waiting is exactly the fix.
    answerability: "needs_volume",
    needs: { amount: 10, unit: "clicks" },
    alsoNeeds: "a second collection, to compare against a prior window",
    source: null,
  },
  {
    rule: "declining_impressions",
    label: "A page being shown less often",
    dimension: "page",
    answerability: "needs_volume",
    needs: { amount: 100, unit: "impressions" },
    alsoNeeds: "a second collection, to compare against a prior window",
    source: null,
  },
  {
    rule: "declining_position",
    label: "A page slipping down the results",
    dimension: "query",
    answerability: "needs_volume",
    needs: { amount: 50, unit: "impressions" },
    alsoNeeds: "a second collection, to compare against a prior window",
    source: null,
  },
  {
    rule: "position_loss",
    label: "A search you have slipped down",
    dimension: "query",
    answerability: "needs_volume",
    needs: { amount: 100, unit: "impressions" },
    alsoNeeds: "a second collection, to compare against a prior window",
    source: null,
  },
  {
    rule: "visibility_gain",
    label: "A page being shown much more often",
    dimension: "page",
    answerability: "needs_volume",
    needs: { amount: 100, unit: "impressions" },
    alsoNeeds: "a second collection, to compare against a prior window",
    source: null,
  },
  {
    // `weak_ctr_page` in the other engine is the identical predicate over the
    // same rows. Listed once, so the count is of questions rather than of
    // implementations. Collapsing the two is handed off.
    rule: "high_impression_low_ctr",
    label: "Shown often, rarely clicked",
    dimension: "page",
    answerability: "pooled_only",
    needs: { amount: 200, unit: "impressions" },
    alsoNeeds: null,
    source: null,
  },
  {
    rule: "zero_click_page",
    label: "Shown but never clicked",
    dimension: "page",
    answerability: "pooled_only",
    needs: { amount: 150, unit: "impressions" },
    alsoNeeds: null,
    source: null,
  },
  {
    rule: "striking_distance_query",
    label: "A search you almost rank for",
    dimension: "query",
    answerability: "needs_volume",
    needs: { amount: 50, unit: "impressions" },
    alsoNeeds: null,
    source: null,
  },
  {
    rule: "possible_query_overlap",
    label: "Two pages competing for one search",
    dimension: "page_query",
    answerability: "needs_volume",
    needs: { amount: 25, unit: "impressions" },
    alsoNeeds: "two pages clearing that on the same search, and a prior window",
    source: null,
  },
  {
    rule: "significant_period_change",
    label: "A big change between periods",
    dimension: "page",
    answerability: "needs_volume",
    needs: { amount: 100, unit: "impressions" },
    alsoNeeds: "a second collection, to compare against a prior window",
    source: null,
  },
  {
    rule: "research_page_traction",
    label: "A page starting to get picked up",
    dimension: "page",
    answerability: "needs_volume",
    needs: { amount: 20, unit: "impressions" },
    alsoNeeds: "the page to match a stored research address, and a prior window",
    source: null,
  },
  {
    rule: "query_coverage_gap",
    label: "A search you show up for but have no page for",
    dimension: "page_query",
    answerability: "needs_volume",
    needs: { amount: 25, unit: "impressions" },
    alsoNeeds: null,
    source: null,
  },
];

/** What the site produced in the window, per row set the rules read. */
export type VolumeEvidence = {
  /**
   * The busiest single page: its impressions and its own clicks.
   *
   * Both counts come from the same row. Taking independent maxima reported
   * "your busiest page had 3 clicks" about a page that had none, because the
   * clicks belonged to a different, smaller page.
   */
  readonly bestPage: { readonly impressions: number; readonly clicks: number } | null;
  /** Impressions on the busiest single search. Null when nothing was stored. */
  readonly bestQueryImpressions: number | null;
  /** Impressions on the busiest single page-and-search pair. */
  readonly bestPageQueryImpressions: number | null;
  /** Every page Search Console reported in the window. */
  readonly pagesReported: number;
  readonly windowDays: number;
};

export type RuleReach = RuleRequirement & {
  /** False when the site cannot currently produce enough for this to fire. */
  readonly reachable: boolean;
  /** What the site has, against what the rule needs. Written for display. */
  readonly reason: string;
};

const NOTHING_STORED =
  "Nothing has been collected yet, so there is no way to tell whether this could fire.";

const ROW_SET: Record<RuleDimension, string> = {
  page: "page",
  query: "search",
  page_query: "page and search pair",
};

/** The count this rule's threshold is measured against, by the rows it reads. */
function availableFor(requirement: RuleRequirement, evidence: VolumeEvidence): number | null {
  if (requirement.needs?.unit === "clicks") return evidence.bestPage?.clicks ?? null;
  if (requirement.dimension === "query") return evidence.bestQueryImpressions;
  if (requirement.dimension === "page_query") return evidence.bestPageQueryImpressions;
  return evidence.bestPage?.impressions ?? null;
}

/**
 * Whether one rule could fire, and why not when it could not.
 *
 * Measured against the busiest single row of the set the rule reads, rather
 * than a site total, because these are per-row thresholds: a rule needing two
 * hundred impressions on one page is not helped by two hundred spread across
 * forty, and a page-level total does not clear a per-search floor.
 */
export function reachOf(requirement: RuleRequirement, evidence: VolumeEvidence): RuleReach {
  const waitingOn =
    requirement.alsoNeeds === null ? "" : ` It also needs ${requirement.alsoNeeds}.`;

  if (requirement.needs === null) {
    return {
      ...requirement,
      reachable: true,
      reason: `Needs no minimum: this is a fact about the page, not a measurement of it.${waitingOn}`,
    };
  }

  const has = availableFor(requirement, evidence);
  const set = ROW_SET[requirement.dimension];

  if (has === null) {
    return { ...requirement, reachable: false, reason: NOTHING_STORED };
  }

  if (has >= requirement.needs.amount) {
    return {
      ...requirement,
      reachable: true,
      reason: `Your busiest ${set} had ${has} ${requirement.needs.unit} in ${evidence.windowDays} days, which clears the ${requirement.needs.amount} this needs.${waitingOn}`,
    };
  }

  const shortfall = requirement.needs.amount - has;
  return {
    ...requirement,
    reachable: false,
    reason:
      requirement.answerability === "pooled_only"
        ? `Needs ${requirement.needs.amount} ${requirement.needs.unit} on one ${set}. Your busiest had ${has} in ${evidence.windowDays} days. A question about click-through cannot be answered for a single page at this volume, however long you wait: it has to be asked across a group of pages instead.`
        : `Needs ${requirement.needs.amount} ${requirement.needs.unit} on one ${set}. Your busiest had ${has} in ${evidence.windowDays} days, so it is ${shortfall} short.${waitingOn}`,
  };
}

export type ReachSummary = {
  readonly rules: readonly RuleReach[];
  readonly reachable: number;
  readonly blocked: number;
  /**
   * One sentence for the operator, or null when every rule can fire and there
   * is nothing to explain.
   */
  readonly headline: string | null;
};

/**
 * Every rule, with whether it can fire, worst news first.
 *
 * The headline exists because the operator's real question is never "which of
 * thirteen rules is blocked". It is "why is this screen empty".
 */
export function assessReach(evidence: VolumeEvidence): ReachSummary {
  const rules = RULE_REQUIREMENTS.map((requirement) => reachOf(requirement, evidence)).sort(
    (left, right) => Number(left.reachable) - Number(right.reachable),
  );
  const blocked = rules.filter((rule) => !rule.reachable).length;
  const reachable = rules.length - blocked;

  if (blocked === 0) return { rules, reachable, blocked, headline: null };

  if (evidence.bestPage === null) {
    return {
      rules,
      reachable,
      blocked,
      headline: `Nothing has been collected yet, so none of these ${rules.length} checks can say anything. Run the Search Console observation first.`,
    };
  }

  return {
    rules,
    reachable,
    blocked,
    headline: `${blocked} of ${rules.length} checks cannot run on this site yet. Your busiest page was shown ${evidence.bestPage.impressions} times in ${evidence.windowDays} days, and they need more than that. This is not a fault in your site or in the checks: there is not enough evidence yet for those questions to have an answer.`,
  };
}

/**
 * How many rules rest on a citation.
 *
 * Exported so a test can pin it. It is currently zero, and that is the point:
 * the numbers deciding what the operator is told were never derived from
 * anything. Raising this is the work in the handoff.
 */
export function citedRuleCount(): number {
  return RULE_REQUIREMENTS.filter((requirement) => requirement.source !== null).length;
}
