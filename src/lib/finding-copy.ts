/**
 * Rule findings, in the operator's words.
 *
 * A rule id like `weak_ctr_page` and an evidence blob are machine vocabulary.
 * This turns them into the one-sentence claim and the one-line evidence the
 * card shows, and it is the only place that copy lives.
 *
 * Two rules govern everything here:
 *
 * 1. **Every number comes from the stored evidence.** When a field is missing or
 *    the wrong type, the evidence line is dropped entirely rather than filled
 *    with a guess, an "unknown", or a zero. The claim still stands, because the
 *    rule firing is itself a stored fact.
 * 2. **The window is the one the rule actually saw.** Rules run over a single
 *    finalized Pacific date, and two of them compare that date with the one a
 *    week earlier. Nothing here may describe a 28-day window; those numbers come
 *    from `buildPeriodComparison` and belong to the tiles.
 */

export const ALL_SEARCH_RULES = [
  "striking_distance_query",
  "position_loss",
  "weak_ctr_page",
  "visibility_gain",
  "possible_query_overlap",
  "serp_rotation",
  "zero_impression_page",
  "query_coverage_gap",
  "index_coverage_drift",
  "site_visibility_shift",
  "site_clicks_shift",
  // Targeting family: read from approved keywords and stored SERP evidence
  // rather than from Search Console. They are listed here because this array
  // is the registry that forces a plain-words writer below and a bucket
  // assignment in rule-buckets.ts.
  "approved_keyword_unobserved",
  "approved_keyword_no_page",
  "approved_keyword_multiple_pages",
  "referring_domain_movement",
  "tracked_set_has_no_route_query",
] as const;

export type SearchRule = (typeof ALL_SEARCH_RULES)[number];

export type FindingCopy = {
  /** One decision, in plain words. Never contains a rule id. */
  readonly claim: string;
  /** The stored numbers behind the claim, or null when none are stored. */
  readonly evidence: string | null;
  /** The page's current wording, when the rule stored it. */
  readonly currentWording: string | null;
};

type Evidence = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nested(value: unknown): Evidence | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Evidence)
    : null;
}

/** A position reads as "#14.2", the way the operator sees it in the results. */
function spot(value: number): string {
  return `#${value}`;
}

/** "shown 118 times, 2 clicks" — dropped whole when either number is absent. */
function shownAndClicked(evidence: Evidence): string | null {
  const impressions = num(evidence["impressions"]);
  const clicks = num(evidence["clicks"]);
  if (impressions === null || clicks === null) return null;
  return `shown ${impressions} times, ${clicks} clicks`;
}

function strikingDistance(evidence: Evidence, on: string): FindingCopy {
  const query = text(evidence["query"]);
  const position = num(evidence["position"]);
  const volume = shownAndClicked(evidence);
  return {
    claim: query === null ? "A search is close to page one" : `"${query}" is close to page one`,
    evidence:
      query === null || position === null || volume === null
        ? null
        : `Ranked ${spot(position)} for "${query}" on ${on} · ${volume}`,
    currentWording: null,
  };
}

function positionLoss(evidence: Evidence, on: string): FindingCopy {
  const query = text(evidence["query"]);
  const before = nested(evidence["before"]);
  const after = nested(evidence["after"]);
  const wasAt = before === null ? null : num(before["position"]);
  const nowAt = after === null ? null : num(after["position"]);
  const volume = after === null ? null : shownAndClicked(after);
  return {
    claim:
      query === null
        ? "You slipped down the results"
        : `You slipped down the results for "${query}"`,
    evidence:
      wasAt === null || nowAt === null || volume === null
        ? null
        : `Was ${spot(wasAt)} a week ago, now ${spot(nowAt)} on ${on} · ${volume}`,
    currentWording: null,
  };
}

/** The stored `ctr` is a fraction. It becomes a percent here, exactly once. */
function asPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function weakCtr(evidence: Evidence, on: string): FindingCopy {
  const impressions = num(evidence["impressions"]);
  const clicks = num(evidence["clicks"]);
  const ctr = num(evidence["ctr"]);
  return {
    claim: "People see this page in Google but do not click it",
    evidence:
      impressions === null || clicks === null || ctr === null
        ? null
        : `Shown ${impressions} times on ${on}, clicked ${clicks} times (${asPercent(ctr)})`,
    currentWording: null,
  };
}

function visibilityGain(evidence: Evidence, on: string): FindingCopy {
  const before = nested(evidence["before"]);
  const after = nested(evidence["after"]);
  const wasShown = before === null ? null : num(before["impressions"]);
  const nowShown = after === null ? null : num(after["impressions"]);
  return {
    claim: "This page is being shown more than it was",
    evidence:
      wasShown === null || nowShown === null
        ? null
        : `Shown ${wasShown} times a week ago, ${nowShown} on ${on}`,
    currentWording: null,
  };
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"] as const;

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

function queryOverlap(evidence: Evidence, on: string): FindingCopy {
  const query = text(evidence["query"]);
  const pages = Array.isArray(evidence["pages"]) ? evidence["pages"] : [];
  return {
    claim:
      query === null
        ? "Several of your pages compete for the same search"
        : `${countWord(pages.length)} of your pages compete for "${query}"`,
    evidence:
      pages.length === 0
        ? null
        : `${pages.length} pages split the same search on ${on}, so none of them wins it`,
    currentWording: null,
  };
}

/**
 * Rotation, in the operator's words.
 *
 * Deliberately not "cannibalisation": the word carries a remedy with it, and
 * the remedy here is the operator's to choose. What is being reported is that
 * Google kept changing its mind, and which of their pages it changed between.
 */
function serpRotation(evidence: Evidence, on: string): FindingCopy {
  const query = text(evidence["query"]);
  const dates = num(evidence["datesObserved"]);
  const contenders = Array.isArray(evidence["contenders"]) ? evidence["contenders"] : [];
  const first = contenders[0] as { page?: unknown; datesWon?: unknown } | undefined;
  const second = contenders[1] as { page?: unknown; datesWon?: unknown } | undefined;
  const firstPage = text(first?.page);
  const secondPage = text(second?.page);

  return {
    claim:
      query === null
        ? "Google keeps swapping which of your pages it shows"
        : `Google keeps swapping which page it shows for "${query}"`,
    evidence:
      dates === null || firstPage === null || secondPage === null
        ? null
        : `Across ${dates} days on ${on} it chose ${firstPage} on ${num(first?.datesWon) ?? 0} and ${secondPage} on ${num(second?.datesWon) ?? 0}`,
    currentWording: null,
  };
}

function zeroImpressions(evidence: Evidence, on: string): FindingCopy {
  return {
    claim: "This page never showed up in Google",
    evidence: text(evidence["page"]) === null ? null : `Not shown once on ${on}`,
    currentWording: null,
  };
}

function coverageGap(evidence: Evidence, on: string): FindingCopy {
  const query = text(evidence["query"]);
  const position = num(evidence["position"]);
  const volume = shownAndClicked(evidence);
  return {
    claim:
      query === null
        ? "This page ranks for a search it never mentions"
        : `This page ranks for "${query}" but never says it`,
    evidence:
      position === null || volume === null ? null : `Ranked ${spot(position)} on ${on} · ${volume}`,
    currentWording: text(evidence["pageTitle"]),
  };
}

/**
 * One rule id, three different problems.
 *
 * `index_coverage_drift` covers a page Google refused to index, a page where
 * Google chose a different canonical, and a page Google has not recrawled in a
 * long time. The id cannot tell them apart, so the evidence does.
 */
function coverageDrift(evidence: Evidence, on: string): FindingCopy {
  const staleDays = num(evidence["crawlAgeDays"]);
  if (staleDays !== null) {
    return {
      claim: "Google has not looked at this page in a long time",
      evidence: `Last crawled ${staleDays} days ago`,
      currentWording: null,
    };
  }

  const googleCanonical = text(evidence["googleCanonical"]);
  const userCanonical = text(evidence["userCanonical"]);
  if (googleCanonical !== null && userCanonical !== null && googleCanonical !== userCanonical) {
    return {
      claim: "Google picked a different address for this page than you did",
      evidence: `You point at ${userCanonical}, Google indexed ${googleCanonical}`,
      currentWording: null,
    };
  }

  const coverageState = text(evidence["coverageState"]);
  return {
    claim: "Google has not added this page to its index",
    evidence: coverageState === null ? null : `Google reported "${coverageState}" on ${on}`,
    currentWording: null,
  };
}

/**
 * Totals from the last two 28-day windows, pooled across every page Search
 * Console stored rather than judged one page at a time. That total is a sum
 * over stored rows, not Google's own property-wide figure — Search Console
 * "stores top data rows and not all data rows" — so the copy names what was
 * summed rather than claiming "your whole site".
 */
function siteVisibilityShift(evidence: Evidence, on: string): FindingCopy {
  const prior = num(evidence["priorImpressions"]);
  const curr = num(evidence["currentImpressions"]);
  const direction = curr !== null && prior !== null ? (curr > prior ? "more" : "less") : null;
  return {
    claim:
      direction === null
        ? "Visibility across the pages Search Console stored has changed"
        : `The pages Search Console stored are being shown ${direction} than they were`,
    evidence:
      curr === null || prior === null
        ? null
        : `Shown ${prior} times last month, ${curr} times in the month through ${on}`,
    currentWording: null,
  };
}

function siteClicksShift(evidence: Evidence, on: string): FindingCopy {
  const prior = num(evidence["priorClicks"]);
  const curr = num(evidence["currentClicks"]);
  const direction = curr !== null && prior !== null ? (curr > prior ? "more" : "fewer") : null;
  return {
    claim:
      direction === null
        ? "Clicks across the pages Search Console stored have changed"
        : `The pages Search Console stored are getting ${direction} clicks than they were`,
    evidence:
      curr === null || prior === null
        ? null
        : `Clicked ${prior} times last month, ${curr} times in the month through ${on}`,
    currentWording: null,
  };
}

function keywordUnobserved(evidence: Evidence, on: string): FindingCopy {
  const keyword = text(evidence["keyword"]);
  return {
    claim:
      keyword === null
        ? "One of your approved searches has never been checked"
        : `Nothing has checked where you rank for "${keyword}"`,
    evidence: keyword === null ? null : `Approved, and no stored result for it as of ${on}`,
    currentWording: null,
  };
}

function keywordWithoutPage(evidence: Evidence, on: string): FindingCopy {
  const keyword = text(evidence["keyword"]);
  const pagesRead = num(evidence["pagesRead"]);
  return {
    claim:
      keyword === null
        ? "One of your approved searches has no page about it"
        : `No page here is about "${keyword}"`,
    evidence:
      pagesRead === null
        ? null
        : `Not in the title or heading of any of the ${pagesRead} pages read by ${on}`,
    currentWording: null,
  };
}

function keywordMultiplePages(evidence: Evidence, on: string): FindingCopy {
  const keyword = text(evidence["keyword"]);
  const pageCount = Array.isArray(evidence["pages"]) ? evidence["pages"].length : null;
  return {
    claim:
      keyword === null
        ? "More than one of your pages targets the same approved search"
        : pageCount === null
          ? `More than one page is about "${keyword}"`
          : `${pageCount} pages are about "${keyword}"`,
    evidence:
      pageCount === null ? null : `In the title or heading of ${pageCount} pages read by ${on}`,
    currentWording: null,
  };
}

function referringDomainMovement(evidence: Evidence, on: string): FindingCopy {
  const priorCount = num(evidence["priorCount"]);
  const currentCount = num(evidence["currentCount"]);
  const priorDate = text(evidence["priorDate"]) ?? on;
  const gained = Array.isArray(evidence["gained"]) ? evidence["gained"].length : 0;
  const lost = Array.isArray(evidence["lost"]) ? evidence["lost"].length : 0;
  return {
    claim:
      gained >= lost
        ? "More other sites link here than they did"
        : "Fewer other sites link here than they did",
    evidence:
      priorCount === null || currentCount === null
        ? null
        : `${priorCount} linking sites on ${priorDate}, ${currentCount} on ${on} · ${gained} new, ${lost} gone`,
    currentWording: null,
  };
}

function routeQueriesUnnamed(evidence: Evidence, on: string): FindingCopy {
  const routeQueryCount = num(evidence["routeQueryCount"]);
  const impressions = num(evidence["impressions"]);
  const clicks = num(evidence["clicks"]);
  const examples = Array.isArray(evidence["examples"])
    ? (evidence["examples"] as { query?: unknown }[])
        .map((entry) => (typeof entry.query === "string" ? `"${entry.query}"` : null))
        .filter((entry): entry is string => entry !== null)
        .slice(0, 3)
    : [];
  return {
    claim: "Searches naming a journey reach the site, and none of your approved keywords is one",
    evidence:
      routeQueryCount === null
        ? null
        : `${routeQueryCount} route search${routeQueryCount === 1 ? "" : "es"} recorded as of ${on}` +
          (impressions === null ? "" : ` · ${impressions} impressions`) +
          (clicks === null ? "" : ` · ${clicks} clicks`) +
          (examples.length > 0 ? ` · e.g. ${examples.join(", ")}` : ""),
    currentWording: null,
  };
}

const WRITERS: Record<SearchRule, (evidence: Evidence, on: string) => FindingCopy> = {
  striking_distance_query: strikingDistance,
  position_loss: positionLoss,
  weak_ctr_page: weakCtr,
  visibility_gain: visibilityGain,
  possible_query_overlap: queryOverlap,
  serp_rotation: serpRotation,
  zero_impression_page: zeroImpressions,
  query_coverage_gap: coverageGap,
  index_coverage_drift: coverageDrift,
  site_visibility_shift: siteVisibilityShift,
  site_clicks_shift: siteClicksShift,
  approved_keyword_unobserved: keywordUnobserved,
  approved_keyword_no_page: keywordWithoutPage,
  approved_keyword_multiple_pages: keywordMultiplePages,
  referring_domain_movement: referringDomainMovement,
  tracked_set_has_no_route_query: routeQueriesUnnamed,
};

export function isSearchRule(value: string): value is SearchRule {
  return (ALL_SEARCH_RULES as readonly string[]).includes(value);
}

/**
 * The claim and evidence for one finding.
 *
 * `on` is the finding's `period_end_pt`: the date the rule actually looked at.
 */
export function describeFinding(rule: SearchRule, evidence: Evidence, on: string): FindingCopy {
  return WRITERS[rule](evidence, on);
}
