/**
 * Law 3, applied to stored evidence (CODE-95).
 *
 * The playbook ingested into this tenant's knowledge base on 2026-08-15,
 * "SEO & AEO Laws, Algorithms and Decision Models", states it as one of its
 * twenty governing laws:
 *
 *   "One intent gets one primary URL. Synonyms and close variants belong
 *    together when Google returns substantially the same results."
 *
 * The test it names is the result set, not the wording. `keyword-phrases.ts`
 * grouped on content words instead, which is a test nobody wrote down: it
 * treated "best" as a qualifier that could be stripped, and so folded
 * twenty-six spellings into one target. Run against the forty SERPs this tenant
 * has already paid DataForSEO for, Law 3 disagrees. Overlap of the top ten
 * organic domains against "long distance movers", read 2026-09-02:
 *
 *   100%  long-distance movers
 *    80%  long-distance moving company, moving company long-distance
 *    78%  long distance movers near me
 *    70%  movers long distance, top long-distance movers
 *    56%  best long-distance movers, best rated long distance movers
 *    44%  best long distance movers, recommended long distance movers
 *    40%  top rated long distance movers
 *
 * Every superlative spelling sits at the bottom. Google returns review sites
 * and listicles for them and moving companies for the plain ones, so they are
 * not the same intent and a service page will not win them however it is
 * worded. That is a Retrieve or Select stage mismatch, and the playbook's
 * diagnostic law forbids answering it with a later-stage fix: "never prescribe
 * a later-stage fix for an earlier-stage failure."
 *
 * Nothing here decides what "substantially" means. The cutoff is the caller's
 * to state, because the playbook is equally clear that a coefficient invented
 * to make a model work is not evidence: "Do not invent the coefficients. Fit
 * them on your historical pages labeled by an explicit outcome."
 */

/** One stored result set: the phrase it was bought for, and who ranked. */
export type ObservedSerp = {
  keyword: string;
  /** Distinct organic domains in the graded window, in rank order. */
  domains: string[];
};

/**
 * Shared domains between two observed result sets, and the smaller set's size.
 *
 * Reported as a count against a denominator rather than a single ratio: a nine
 * result page and a ten result page sharing seven domains is a different claim
 * from a two result page sharing two, and one number hides which it was.
 */
export type SerpOverlap = {
  shared: number;
  /** Domains in the smaller of the two sets, which is what `shared` can reach. */
  comparable: number;
  sharedDomains: string[];
};

export function serpOverlap(a: ObservedSerp, b: ObservedSerp): SerpOverlap {
  const left = new Set(a.domains.map((domain) => domain.toLowerCase()));
  const sharedDomains = [
    ...new Set(
      b.domains.map((domain) => domain.toLowerCase()).filter((domain) => left.has(domain)),
    ),
  ].sort();
  return {
    shared: sharedDomains.length,
    comparable: Math.min(left.size, new Set(b.domains).size),
    sharedDomains,
  };
}

export type IntentGroup = {
  /** The spelling with the most observed results, which is the best evidenced. */
  canonical: string;
  members: string[];
  /**
   * Why these are one intent, in the words the finding will use. Names the
   * measurement rather than asserting the conclusion.
   */
  evidence: string;
};

export type IntentGrouping = {
  /** Groups whose members were compared against stored result sets. */
  observed: IntentGroup[];
  /**
   * Phrases with no stored result set. They are not grouped and not asserted
   * about: the playbook's evidence vocabulary calls this Unknown, and its rule
   * for it is "do not convert uncertainty into a rule."
   */
  unobserved: string[];
};

/**
 * Group phrases that Google answers with substantially the same results.
 *
 * `minSharedDomains` has no default on purpose. Law 3 says "substantially" and
 * does not quantify it, so the number belongs at the call site where it can be
 * read, argued with and changed, not buried here as though it came from the
 * source.
 *
 * Greedy and order-independent: phrases are considered most-observed first, and
 * a phrase joins the first group whose canonical it matches. A phrase that
 * matches two canonicals is a sign the cutoff is too loose, not a tie to break
 * cleverly, so it joins the better-evidenced group and nothing pretends
 * otherwise.
 */
export function groupByObservedIntent(
  serps: readonly ObservedSerp[],
  options: { minSharedDomains: number },
): IntentGrouping {
  const withResults = serps.filter((serp) => serp.domains.length > 0);
  const unobserved = serps.filter((serp) => serp.domains.length === 0).map((serp) => serp.keyword);

  const ordered = [...withResults].sort(
    (a, b) => b.domains.length - a.domains.length || a.keyword.localeCompare(b.keyword),
  );

  const groups: { head: ObservedSerp; members: string[]; worst: SerpOverlap | null }[] = [];
  for (const serp of ordered) {
    const home = groups.find(
      (group) => serpOverlap(group.head, serp).shared >= options.minSharedDomains,
    );
    if (!home) {
      groups.push({ head: serp, members: [serp.keyword], worst: null });
      continue;
    }
    const overlap = serpOverlap(home.head, serp);
    home.members.push(serp.keyword);
    if (home.worst === null || overlap.shared < home.worst.shared) home.worst = overlap;
  }

  return {
    observed: groups.map((group) => ({
      canonical: group.head.keyword,
      members: [...group.members].sort(),
      evidence:
        group.members.length === 1
          ? `Only spelling observed for this result set: ${group.head.domains.length} organic domains stored.`
          : `${group.members.length} spellings share at least ${group.worst?.shared ?? options.minSharedDomains} of the top organic domains with "${group.head.keyword}".`,
    })),
    unobserved: unobserved.sort(),
  };
}

/**
 * Phrases whose result sets differ enough from the group they were assumed to
 * join that treating them as one target would be wrong.
 *
 * Separated from the grouping itself because this is the finding worth raising:
 * a spelling that reads like a variant and does not behave like one is a page
 * the operator is about to write for a SERP that wants something else.
 */
export function intentOutliers(
  serps: readonly ObservedSerp[],
  canonical: string,
  options: { minSharedDomains: number },
): { keyword: string; overlap: SerpOverlap }[] {
  const head = serps.find((serp) => serp.keyword === canonical);
  if (!head) return [];
  return serps
    .filter((serp) => serp.keyword !== canonical && serp.domains.length > 0)
    .map((serp) => ({ keyword: serp.keyword, overlap: serpOverlap(head, serp) }))
    .filter((row) => row.overlap.shared < options.minSharedDomains)
    .sort((a, b) => a.overlap.shared - b.overlap.shared || a.keyword.localeCompare(b.keyword));
}
