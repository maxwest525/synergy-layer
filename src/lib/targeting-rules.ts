/**
 * What the targeting evidence already in the database says, as pure functions.
 *
 * Keyword candidates are collected, approved and stored, and until this module
 * existed nothing read them again: `finding-router.ts` had no reference to
 * `keyword_candidates` or `tracked_keywords`, so an approval produced no
 * suggestion anywhere. These detectors are the reading half of that wire; the
 * writing half is `dataforseo/targeting-rules.server.ts`.
 *
 * Every rule here is a yes/no reading of stored rows — a keyword nobody looked
 * up, a phrase no page carries — so none of them invents a threshold to decide
 * whether it fires. Where a count exists to judge (referring-domain movement),
 * the confidence comes from `confidence.ts` rather than from a literal.
 */

import { confidenceInCountChange } from "./confidence";

export type TargetingRule =
  | "approved_keyword_unobserved"
  | "approved_keyword_no_page"
  | "approved_keyword_multiple_pages"
  | "question_asked_no_page"
  | "referring_domain_movement"
  | "tracked_set_has_no_route_query";

export type TargetingObservation = {
  readonly rule: TargetingRule;
  /** The thing the finding is about: a keyword, a question, or a domain. */
  readonly target: string;
  /** Operator-facing. Never contains a rule id. */
  readonly title: string;
  readonly description: string;
  readonly evidence: Record<string, unknown>;
  /**
   * 1 for a fact read straight off stored rows. Anything derived from counts
   * takes its number from `confidence.ts` instead.
   */
  readonly confidence: number;
};

import { closestPageFor, groupByPhrase, pageCoversPhrase } from "./keyword-phrases";

export type ApprovedKeyword = { readonly keyword: string };
export type ObservedSerp = { readonly keyword: string; readonly reportingDate: string };
export type PageText = {
  readonly url: string;
  readonly title: string | null;
  readonly h1: string | null;
};

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** A query that names a journey: "movers boston to miami", "moving from texas to florida". */
export function isRouteQuery(value: string): boolean {
  return /\s(to|from)\s/i.test(value.trim());
}

export type SearchQuery = {
  readonly query: string;
  readonly impressions: number;
  readonly clicks: number;
};

/**
 * The approved set holds no route query while route searches already reach
 * the site. The research log records the tracked set as forty synonyms of one
 * head term, the queries listicle publishers are built to win, and none of
 * the route queries the route-matrix operators compete on (COMP-1). This
 * reads what Search Console already stored: it invents no keyword, it names
 * the ones searchers used. It says nothing when no keyword has been approved
 * (that is a different absence) and nothing when no route query has reached
 * the site (there is no evidence to name).
 */
export function detectMissingRouteQueries(
  approved: readonly ApprovedKeyword[],
  queries: readonly SearchQuery[],
): TargetingObservation[] {
  if (approved.length === 0) return [];
  if (approved.some((entry) => isRouteQuery(entry.keyword))) return [];
  const routes = new Map<string, { impressions: number; clicks: number }>();
  for (const row of queries) {
    const query = normalise(row.query);
    if (!query || !isRouteQuery(query)) continue;
    const current = routes.get(query) ?? { impressions: 0, clicks: 0 };
    routes.set(query, {
      impressions: current.impressions + row.impressions,
      clicks: current.clicks + row.clicks,
    });
  }
  if (routes.size === 0) return [];
  const ranked = [...routes.entries()].sort((a, b) => b[1].impressions - a[1].impressions);
  const impressions = ranked.reduce((sum, [, row]) => sum + row.impressions, 0);
  const clicks = ranked.reduce((sum, [, row]) => sum + row.clicks, 0);
  const examples = ranked.slice(0, 3).map(([query]) => `"${query}"`);
  return [
    {
      rule: "tracked_set_has_no_route_query",
      target: "route queries",
      title:
        "None of your approved keywords is a route query, and route searches already reach the site",
      description:
        `${approved.length} approved keyword(s), none naming a journey. Search Console recorded ` +
        `${ranked.length} route quer${ranked.length === 1 ? "y" : "ies"} reaching the site, ` +
        `${impressions} impression(s) and ${clicks} click(s) across them, such as ${examples.join(", ")}. ` +
        "Nothing here is approved on your behalf: these are the searches people used, for you to choose from.",
      evidence: {
        approvedCount: approved.length,
        routeQueryCount: ranked.length,
        impressions,
        clicks,
        examples: ranked.slice(0, 10).map(([query, row]) => ({ query, ...row })),
      },
      confidence: 1,
    },
  ];
}

/** Approved keywords no stored SERP has ever looked up. */
export function detectUnobservedKeywords(
  approved: readonly ApprovedKeyword[],
  observed: readonly ObservedSerp[],
): TargetingObservation[] {
  const seen = new Set(observed.map((serp) => normalise(serp.keyword)));
  return approved
    .filter((entry) => !seen.has(normalise(entry.keyword)))
    .map((entry) => ({
      rule: "approved_keyword_unobserved" as const,
      target: entry.keyword,
      title: `Nothing has checked where you rank for "${entry.keyword}"`,
      description:
        `You approved "${entry.keyword}", and no stored search result exists for it yet, ` +
        "so there is nothing to say about where the site sits for it.",
      evidence: { keyword: entry.keyword, observedKeywords: seen.size },
      confidence: 1,
    }));
}

/**
 * Targets no read page carries.
 *
 * Coverage means the page's own words include every content word of the target,
 * so word order and the qualifiers ("best", "top rated") stop deciding it. The
 * old test asked for the approved phrase as a literal substring, which was
 * exactly right about one spelling and wrong about the other thirty-nine:
 * 50 approved keywords are 14 targets, and a page titled "Long Distance Movers"
 * answers nineteen of the spellings at once (CODE-93, keyword-phrases.ts).
 *
 * Still no threshold and still no score. A page either carries every content
 * word of the target or it does not.
 */
export function detectKeywordsWithoutPage(
  approved: readonly ApprovedKeyword[],
  pages: readonly PageText[],
): TargetingObservation[] {
  // With nothing read, every keyword would look uncovered. That is a statement
  // about the audit, not about the site.
  if (pages.length === 0) return [];

  const pageText = pages.map((page) => `${page.title ?? ""} ${page.h1 ?? ""}`).join(" ");
  const perPage = pages.map((page) => ({
    url: page.url,
    text: `${page.title ?? ""} ${page.h1 ?? ""}`,
  }));

  return groupByPhrase(approved, (entry) => entry.keyword)
    .filter((group) => !pageCoversPhrase(pageText, group.canonical))
    .map((group) => {
      const closest = closestPageFor(group.canonical, perPage);
      const opening =
        `You approved ${describeSpellings(group.variants)}, and none of the ${pages.length} ` +
        "pages read so far carry those words in a title or main heading.";
      return {
        rule: "approved_keyword_no_page" as const,
        target: group.canonical,
        title: `No page here is about "${group.canonical}"`,
        description: closest
          ? `${opening} The nearest is ${closest.url}, which already says ` +
            `${listWords(closest.shared)} and is short of ${listWords(closest.missing)}. ` +
            "Rewording that page or writing a new one is your call; the overlap is here so " +
            "the choice is made with it rather than instead of it."
          : `${opening} No page read so far shares a single word of it, so there is nothing ` +
            "here to reword. One page that is about it answers every one of those searches; " +
            "there is no need for one page each.",
        evidence: {
          keyword: group.canonical,
          variants: group.variants,
          approvedSpellings: group.variants.length,
          pagesRead: pages.length,
          ...(closest
            ? {
                nearestPage: closest.url,
                nearestPageHas: closest.shared,
                nearestPageMissing: closest.missing,
              }
            : {}),
        },
        confidence: 1,
      };
    });
}

/** A list of words as operator prose: `"long"`, `"long" and "distance"`, `"a", "b" and "c"`. */
function listWords(items: readonly string[]): string {
  const quoted = items.map((word) => `"${word}"`);
  if (quoted.length === 0) return "nothing";
  if (quoted.length === 1) return quoted[0]!;
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]!}`;
}

/** "X" on its own, or "X and N other ways of spelling it". */
function describeSpellings(variants: readonly string[]): string {
  const [first, ...rest] = variants;
  if (rest.length === 0) return `"${first}"`;
  return `"${first}" and ${rest.length} other ${rest.length === 1 ? "spelling" : "spellings"} of it`;
}

/**
 * Approved keywords more than one read page carries.
 *
 * The inverse of `detectKeywordsWithoutPage`, and the join CODE-5 named as
 * missing: nothing before this connected the approved-keyword list to page
 * text to check whether *two* pages both claim the same phrase, which is
 * cannibalisation the site itself created rather than a coincidence in what
 * Google chose to rank. `possible_query_overlap` (search-console-rules.server.ts)
 * catches the same shape from the query side -- two pages sharing impressions
 * for one term -- but only after Google has already observed both; this reads
 * the site's own wording and needs no query data at all.
 *
 * Same discipline as its sibling: the approved phrase itself must appear, not
 * a token overlap a threshold would have to justify.
 */
export function detectKeywordCannibalization(
  approved: readonly ApprovedKeyword[],
  pages: readonly PageText[],
): TargetingObservation[] {
  if (pages.length === 0) return [];

  return groupByPhrase(approved, (entry) => entry.keyword)
    .map((group) => {
      const matches = pages.filter((page) =>
        pageCoversPhrase(`${page.title ?? ""} ${page.h1 ?? ""}`, group.canonical),
      );
      return { group, matches };
    })
    .filter(({ matches }) => matches.length >= 2)
    .map(({ group, matches }) => ({
      rule: "approved_keyword_multiple_pages" as const,
      target: group.canonical,
      title: `${matches.length} pages are about "${group.canonical}"`,
      description:
        `You approved ${describeSpellings(group.variants)}, and ${matches.length} different ` +
        "pages carry those words in their title or main heading. They are competing with each " +
        "other for it, not just with other sites. Which one should own it is your call; a " +
        "wording change can differentiate the rest.",
      evidence: {
        keyword: group.canonical,
        variants: group.variants,
        pages: matches.map((page) => page.url),
      },
      confidence: 1,
    }));
}

export type ReferringDomainSnapshot = {
  readonly reportingDate: string;
  readonly domains: readonly string[];
};

/**
 * How the set of sites linking here moved between the two most recent stored
 * backlink snapshots.
 *
 * This reports movement and stops. Acquiring links is never recommended:
 * "Exchanging money for links" is link spam in Google's own spam policies
 * (docs/superpowers/research/2026-08-20-small-site-growth-research.md §3), and
 * this lane emits nothing that could be read as an instruction to buy them.
 *
 * Both sides are counts, so the confidence is derived rather than asserted.
 */
export function detectReferringDomainMovement(
  prior: ReferringDomainSnapshot | null,
  current: ReferringDomainSnapshot | null,
): TargetingObservation[] {
  if (prior === null || current === null) return [];

  const before = new Set(prior.domains.map(normalise));
  const after = new Set(current.domains.map(normalise));
  const gained = [...after].filter((domain) => !before.has(domain));
  const lost = [...before].filter((domain) => !after.has(domain));
  if (gained.length === 0 && lost.length === 0) return [];

  const judgement = confidenceInCountChange(before.size, after.size);

  return [
    {
      rule: "referring_domain_movement",
      target: current.reportingDate,
      title:
        gained.length >= lost.length
          ? `${gained.length} more sites link here than last time`
          : `${lost.length} sites that linked here no longer do`,
      description:
        `Between ${prior.reportingDate} and ${current.reportingDate} the number of sites linking ` +
        `here went from ${before.size} to ${after.size}. ${judgement.reason}`,
      evidence: {
        priorDate: prior.reportingDate,
        currentDate: current.reportingDate,
        priorCount: before.size,
        currentCount: after.size,
        gained: gained.slice(0, 25),
        lost: lost.slice(0, 25),
      },
      confidence: judgement.value,
    },
  ];
}
