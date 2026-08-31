/**
 * The "Getting found on Google" view model.
 *
 * Same discipline as the Command center: a tile shows a number only when a
 * stored row backs it, and otherwise carries `value: null` with a
 * `missingReason` naming what is missing. A stored zero is a zero.
 *
 * Two arithmetic traps live in this data and are handled once, here:
 *
 * - `ctr` is a **fraction** (0.038), while `change.ctrPoints` is already in
 *   **percentage points** (-1.1). Multiplying both by 100 is the obvious bug.
 * - `position` is Google's average rank, where **a smaller number is better**.
 *   A falling position number is an improvement, so its delta's good direction
 *   is down, the opposite of every other tile here.
 */

import {
  bindingConstraint,
  partitionByConstraint,
  type ConstraintFacts,
} from "./binding-constraint";
import { MIN_BASELINE } from "./confidence";
import { RULE_ASSIGNMENTS, unmetPrerequisites, type RuleAssignment } from "./rule-buckets";
import {
  buildQueue,
  compareQueueItems,
  type QueueItem,
  type QueueSource,
} from "./suggestion-queue";
import type { PeriodComparison } from "./search-console";

export type SearchListRow = {
  readonly label: string;
  readonly clicks: number;
};

/** How many search terms or pages a list shows before it is cut off. */
export const LIST_LIMIT = 25;

/** One row as Search Console stores it inside a snapshot payload. */
export type StoredSearchRow = {
  readonly keys?: readonly string[];
  readonly clicks?: unknown;
  readonly impressions?: unknown;
};

/**
 * A stored count, or zero when the field is missing or not a number.
 *
 * Callers must not read the zero as "measured zero" on its own: it means only
 * that nothing usable was stored. Every caller here treats it conservatively,
 * so a missing field can lower a count but can never raise one or manufacture a
 * finding.
 */
export function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The biggest contributors first, cut to the list limit and labelled by key.
 *
 * A row without a usable key is dropped rather than shown as an empty label:
 * Search Console withholds the term on rare queries, and an unlabelled line
 * would read as a search nobody typed.
 */
export function topRows(rows: readonly StoredSearchRow[]): SearchListRow[] {
  return rows
    .flatMap((row): SearchListRow[] => {
      const label = row.keys?.[0];
      if (typeof label !== "string" || label.length === 0) return [];
      return [{ label, clicks: countOf(row.clicks) }];
    })
    .sort((left, right) => right.clicks - left.clicks)
    .slice(0, LIST_LIMIT);
}

/**
 * How many of the pages we know about Google was seen to show.
 *
 * Matched on the address rather than counted straight off the window, because
 * the two sets are collected differently: Search Console reports whatever it
 * has, while the page audit stops at its own limit. Counting the window's rows
 * directly produced shares above one, which silently un-fired the diagnosis on
 * exactly the large sites that most need it.
 */
export function countShownPages(
  rows: readonly StoredSearchRow[],
  readable: ReadonlySet<string>,
): number {
  const shown = new Set<string>();
  for (const row of rows) {
    if (countOf(row.impressions) <= 0) continue;
    const url = row.keys?.[0];
    if (typeof url === "string" && readable.has(url)) shown.add(url);
  }
  return shown.size;
}

export type GettingFoundFacts = {
  readonly now: string;
  /** The connected Search Console property, or null when none is selected. */
  readonly property: string | null;
  readonly comparison: PeriodComparison;
  /** The most recent finalized date any snapshot covers. */
  readonly latestDate: string | null;
  readonly queries: readonly SearchListRow[];
  readonly pages: readonly SearchListRow[];
  readonly queueSources: readonly QueueSource[];
  /**
   * How much of the site Google has been seen to show. Null when the window
   * that would answer it has not been collected, which is not the same as none
   * of it being shown.
   */
  readonly coverage: PageCoverage | null;
  /** Null when analytics is not connected, which is not the same as no visits. */
  readonly sessions: number | null;
  /** Approved keywords on the tenant. Zero means nothing has been chosen to target. */
  readonly approvedKeywords: number;
  /** Stored backlinks_referring_domains snapshots. Two or more means movement can be compared. */
  readonly backlinkSnapshots: number;
};

/**
 * The two page counts the diagnosis needs, and the only two it takes from the
 * page-dimension window.
 *
 * The impression and click totals deliberately do not come from here. That
 * window is a separate measurement from the daily totals the tiles show, and
 * the two legitimately disagree, so taking totals from it would put two
 * different impression counts on one screen.
 */
export type PageCoverage = {
  /** Pages the audit read successfully. A page it could not read is not known. */
  readonly pagesKnown: number;
  /** How many of those Google was seen to show at least once. */
  readonly pagesWithImpressions: number;
};

export type TileDelta = {
  readonly direction: "up" | "down" | "flat";
  /** Already written for display, including its unit. */
  readonly label: string;
  readonly tone: "positive" | "danger" | "neutral";
};

export type GettingFoundTile = {
  readonly label: string;
  /** Written for display, so the caller never re-formats a raw number. */
  readonly value: string | null;
  readonly delta: TileDelta | null;
  readonly explanation: string;
  readonly missingReason: string | null;
};

export type StatusTone = "positive" | "warning" | "danger";

export type GettingFoundStatus = {
  readonly text: string;
  readonly tone: StatusTone;
};

export type TabId = "suggestions" | "queries" | "pages" | "history";

export type Tab = {
  readonly id: TabId;
  readonly label: string;
  /** Null when the tab carries no count, as the two lists do not. */
  readonly count: number | null;
};

export type ConstraintBanner = {
  /** What is actually holding the site back, in plain words. */
  readonly reason: string;
  /** How many open suggestions address it. */
  readonly addressing: number;
  /** How many are real but are not today's problem. Counted, never hidden. */
  readonly parked: number;
};

export type Answerability = {
  readonly line: string;
  readonly beyond: readonly string[];
  /**
   * Sentences from `unmetPrerequisites`: what else is blocking an answer,
   * besides volume. Empty once every prerequisite this page can see is met.
   * Kept beside `line` rather than folded into it, because "not enough
   * traffic" and "no second window yet" are different answers and the
   * operator needs to know which one applies.
   */
  readonly waitingOn: readonly string[];
};

export type GettingFoundView = {
  readonly tiles: readonly GettingFoundTile[];
  readonly status: GettingFoundStatus;
  /**
   * What this site's traffic volume can and cannot answer, and the lever
   * that changes it. Null when the page count behind it is not stored, in
   * which case the tiles' own `missingReason` already says why — this is
   * never a second "not measurable" message. When only the comparison window
   * is missing, this stays non-null so `waitingOn` can name that instead of
   * going quiet.
   */
  readonly answerability: Answerability | null;
  readonly tabs: readonly Tab[];
  /**
   * The diagnosis that has to precede the ranking. Null when the stored rows
   * cannot support one, in which case the queue keeps its own order rather than
   * asserting a priority it cannot justify.
   */
  readonly constraint: ConstraintBanner | null;
  /**
   * Every open suggestion, ranked. When a constraint was diagnosed, the ones
   * addressing it come first and the rest follow, still present and still
   * ranked among themselves. Nothing is hidden by the diagnosis.
   */
  readonly suggestions: readonly QueueItem[];
  /**
   * The index in `suggestions` where the parked group begins, so the page can
   * draw the divider that explains why the order changed. Null when there is no
   * diagnosis, or when every suggestion falls on the same side of it.
   */
  readonly parkedFrom: number | null;
  /** What has already been decided, so a handled item stays findable. */
  readonly history: readonly QueueItem[];
  /**
   * The last finalized day the stored window covers, written for display. Null
   * when nothing has been collected. Shown, because a four week old window
   * presented without its date is presented as current.
   */
  readonly asOf: string | null;
  /** The search terms behind the totals, biggest first. */
  readonly queries: readonly SearchListRow[];
  /** The pages behind the totals, biggest first. */
  readonly pages: readonly SearchListRow[];
};

/**
 * Plain-words names for the beyond_current_volume rules, written for the
 * operator screen. `RuleAssignment.rule` ids are developer-facing and must
 * never reach this page directly.
 */
const BEYOND_RULE_NAMES: Record<string, string> = {
  striking_distance_query: "Near-miss search terms (page 2 rankings)",
  declining_position: "Position-slip warnings",
  position_loss: "Position-loss alerts",
  possible_query_overlap: "Overlapping search-term signals",
  query_coverage_gap: "Search-term coverage gaps",
  research_page_traction: "Research-page traction signals",
};

/**
 * What each beyond_current_volume rule's threshold actually counts.
 *
 * striking_distance_query, declining_position, position_loss and
 * query_coverage_gap all read a query-dimension row: the threshold is an
 * impression count for one search term, aggregated the same way regardless of
 * which page earns it (search-console-rules.server.ts, seo-validation.server.ts).
 * possible_query_overlap and research_page_traction instead read a
 * page-dimension count — a page's own total impressions, or a page's earnings
 * on a shared term — so "on a single search term" would misstate what they
 * measure. See rule-buckets.ts's `needsPerTarget` for the live threshold each
 * one cites.
 */
const PER_PAGE_BEYOND_RULES = new Set<string>(["possible_query_overlap", "research_page_traction"]);

/**
 * The lever that changes what this volume can answer, so "not measurable
 * yet" never reads as a dead end. Discovery order per
 * docs/superpowers/research/2026-08-20-small-site-growth-research.md:
 * internal links first, the sitemap second, one recrawl request third, then
 * weeks of patience.
 */
const GROWTH_LEVER_LINE =
  "More pages earning appearances is what changes this. Google finds pages mainly " +
  "through links from pages it already crawled, in this order: internal links first, " +
  "the sitemap second, one recrawl request third, then weeks of patience.";

/**
 * What this site's traffic volume can and cannot answer, in plain words, and
 * the lever that changes it.
 *
 * `beyond` names, per beyond_current_volume rule, the per-target evidence it
 * would need against what a page here actually earns today — never the rule
 * id, never developer-facing `why` text.
 */
export function describeAnswerability(
  siteImpressions28d: number,
  pageCount: number,
  assignments: readonly RuleAssignment[],
): { line: string; beyond: string[] } {
  const perPage = Math.round(siteImpressions28d / pageCount);
  // The same floor confidence.ts uses everywhere else: below it, a site-wide
  // total is not itself trustworthy, so the site-wide half of the claim below
  // cannot be made either.
  const hasSiteVolume = siteImpressions28d >= MIN_BASELINE;

  const line = hasSiteVolume
    ? `Your site earned ~${siteImpressions28d} appearances over the last four weeks across ` +
      `${pageCount} pages: enough for the site-wide checks and the yes/no facts, not enough ` +
      `for per-page click judgements. That is a statement about traffic, not about the ` +
      `site's quality. ${GROWTH_LEVER_LINE}`
    : `Your site earned only ~${siteImpressions28d} appearances over the last four weeks across ` +
      `${pageCount} pages: too little even to trust the site-wide checks, so only the yes/no ` +
      `facts are answerable right now. That is a statement about traffic, not about the ` +
      `site's quality. ${GROWTH_LEVER_LINE}`;

  const beyond = assignments
    .filter((assignment) => assignment.bucket === "beyond_current_volume")
    .map((assignment) => {
      const name = BEYOND_RULE_NAMES[assignment.rule] ?? assignment.rule;
      const unit = PER_PAGE_BEYOND_RULES.has(assignment.rule)
        ? "on a single page"
        : "on a single search term";
      return (
        `${name} need about ${assignment.needsPerTarget} appearances ${unit}; ` +
        `the average page here earns about ${perPage} a month.`
      );
    });

  return { line, beyond };
}

/**
 * Refused, not guessed at, when the page count behind it is not stored: the
 * coverage diagnosis already reads it, so a missing window here means nothing
 * on this page has anything to say yet, and the tile above already carries
 * why.
 *
 * A missing comparison is different: the page count is known, so there is a
 * real prerequisite to name (no second collection yet), rather than nothing at
 * all. `line` and `beyond` still need the site-wide total the comparison
 * carries, so they stay in a degraded form — `insufficientReason`'s own
 * sentence, no per-rule volume detail — while `waitingOn` says what is
 * missing.
 */
function answerabilityFor(facts: GettingFoundFacts): Answerability | null {
  if (facts.coverage === null) return null;

  const waitingOn = unmetPrerequisites({
    secondCollection: facts.comparison.status === "ready",
    // Coverage being present already means the page audit read something.
    pageAudit: true,
    analytics: facts.sessions !== null,
    // Nothing on this page reads a stored URL inspection yet.
    urlInspection: true,
    approvedKeywords: facts.approvedKeywords > 0,
    backlinkCollection: facts.backlinkSnapshots >= 2,
    // None of this page's rules are OnPage crawl rules (site-audit routes to
    // health/pages), so this always reads as met, same as urlInspection above.
    onpageCrawl: true,
  });

  if (facts.comparison.status !== "ready") {
    return { line: insufficientReason(facts.comparison) ?? "", beyond: [], waitingOn };
  }

  const { line, beyond } = describeAnswerability(
    facts.comparison.current.impressions,
    facts.coverage.pagesKnown,
    RULE_ASSIGNMENTS,
  );
  return { line, beyond, waitingOn };
}

const NO_PROPERTY =
  "No Search Console property is selected, so there is nothing to read these numbers from.";

function insufficientReason(comparison: PeriodComparison): string | null {
  if (comparison.status !== "insufficient") return null;
  return `Only ${comparison.availableDays} of ${comparison.requiredDays} required calendar days are stored, so no 28 day total is shown yet.`;
}

function absent(label: string, explanation: string, reason: string): GettingFoundTile {
  return { label, value: null, delta: null, explanation, missingReason: reason };
}

/** A percentage change, rounded to whole points, with its sign carried by `direction`. */
function percentDelta(percent: number | null, goodWhen: "up" | "down"): TileDelta | null {
  if (percent === null) return null;
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  if (direction === "flat") return { direction, label: "0%", tone: "neutral" };
  return {
    direction,
    label: `${Math.abs(Math.round(percent))}%`,
    tone: direction === goodWhen ? "positive" : "danger",
  };
}

function clicksTile(comparison: PeriodComparison, reason: string | null): GettingFoundTile {
  const explanation = 'How many people clicked through to your site. Google calls these "clicks".';
  if (reason !== null || comparison.status !== "ready") {
    return absent("People who clicked", explanation, reason ?? NO_PROPERTY);
  }
  return {
    label: "People who clicked",
    value: String(comparison.current.clicks),
    delta: percentDelta(comparison.change.clicksPercent, "up"),
    explanation,
    missingReason: null,
  };
}

function impressionsTile(comparison: PeriodComparison, reason: string | null): GettingFoundTile {
  const explanation =
    'How many times a page of yours appeared in results. Google calls these "impressions".';
  if (reason !== null || comparison.status !== "ready") {
    return absent("Times you showed up", explanation, reason ?? NO_PROPERTY);
  }
  return {
    label: "Times you showed up",
    value: String(comparison.current.impressions),
    delta: percentDelta(comparison.change.impressionsPercent, "up"),
    explanation,
    missingReason: null,
  };
}

function ctrTile(comparison: PeriodComparison, reason: string | null): GettingFoundTile {
  const explanation = 'Of the people who saw you, how many clicked. Google calls this "CTR".';
  if (reason !== null || comparison.status !== "ready") {
    return absent("Seeing to clicking", explanation, reason ?? NO_PROPERTY);
  }
  const ctr = comparison.current.ctr;
  if (ctr === null) {
    return absent(
      "Seeing to clicking",
      explanation,
      "Nothing was shown in the window, so there is no rate to work out.",
    );
  }
  const points = comparison.change.ctrPoints;
  return {
    label: "Seeing to clicking",
    // The stored value is a fraction. This is the only place it becomes a percent.
    value: `${(ctr * 100).toFixed(1)}%`,
    delta:
      points === null || points === 0
        ? points === 0
          ? { direction: "flat", label: "0 points", tone: "neutral" }
          : null
        : {
            // `ctrPoints` is already in points, so it is never multiplied here.
            direction: points > 0 ? "up" : "down",
            label: `${Math.abs(points).toFixed(1)} points`,
            tone: points > 0 ? "positive" : "danger",
          },
    explanation,
    missingReason: null,
  };
}

function positionTile(comparison: PeriodComparison, reason: string | null): GettingFoundTile {
  const explanation = "Where you sit on average. Page one is spots 1 to 10.";
  if (reason !== null || comparison.status !== "ready") {
    return absent("Average spot", explanation, reason ?? NO_PROPERTY);
  }
  const position = comparison.current.position;
  if (position === null) {
    return absent(
      "Average spot",
      explanation,
      "No impression in the window carried a position, so there is no average spot to show.",
    );
  }
  const moved = comparison.change.position;
  return {
    label: "Average spot",
    value: `#${Number(position.toFixed(1))}`,
    delta:
      moved === null || moved === 0
        ? moved === 0
          ? { direction: "flat", label: "steady", tone: "neutral" }
          : null
        : {
            // A smaller position number is a better spot, so a fall is good news.
            direction: moved > 0 ? "up" : "down",
            label: `${Math.abs(moved).toFixed(1)} ${moved > 0 ? "worse" : "better"}`,
            tone: moved > 0 ? "danger" : "positive",
          },
    explanation,
    missingReason: null,
  };
}

/**
 * The header's status line, written as a consequence rather than a count of
 * abstract items, per the spec's "Mostly OK, clicks dipped, 2 things worth
 * fixing".
 */
function statusFor(
  open: ReturnType<typeof buildQueue>["open"],
  answerability: Answerability | null,
): GettingFoundStatus {
  if (open.length === 0) {
    // "Nothing needs you" is a claim about what was looked at. With checks
    // beyond this site's volume it rendered in green directly above the
    // sentence explaining that those checks cannot answer anything, so the
    // reassurance and its own correction sat one on top of the other.
    const blind = answerability?.beyond.length ?? 0;
    return blind > 0
      ? { text: `${blind} checks cannot answer yet`, tone: "warning" }
      : { text: "Nothing needs you here", tone: "positive" };
  }

  const urgent = open.filter((item) => item.urgency === "fix_now").length;
  const rest = open.length - urgent;

  if (urgent > 0) {
    const head = urgent === 1 ? "1 thing to fix now" : `${urgent} things to fix now`;
    if (rest === 0) return { text: head, tone: "danger" };
    return { text: `${head}, ${rest} more worth a look`, tone: "danger" };
  }

  return {
    text: open.length === 1 ? "1 thing worth fixing" : `${open.length} things worth fixing`,
    tone: "warning",
  };
}

/**
 * Builds everything the page renders.
 *
 * The queue is derived once and both the tab counts and the status line read
 * that same derivation, so the two can never disagree.
 */
export function buildGettingFound(facts: GettingFoundFacts): GettingFoundView {
  const reason = facts.property === null ? NO_PROPERTY : insufficientReason(facts.comparison);

  const queue = buildQueue(facts.queueSources, facts.now);
  const open = [...queue.open].sort(compareQueueItems);
  const answerability = answerabilityFor(facts);
  const handled = queue.ignored.length + queue.done.length;
  const constraint = constraintFor(facts, open);
  const ordered = orderByConstraint(facts, open);

  return {
    tiles: [
      clicksTile(facts.comparison, reason),
      impressionsTile(facts.comparison, reason),
      ctrTile(facts.comparison, reason),
      positionTile(facts.comparison, reason),
    ],
    status: statusFor(open, answerability),
    answerability,
    tabs: [
      { id: "suggestions", label: "Suggestions", count: open.length },
      { id: "queries", label: "Searches", count: null },
      { id: "pages", label: "Pages", count: null },
      { id: "history", label: "History", count: handled },
    ],
    constraint,
    suggestions: ordered.suggestions,
    parkedFrom: ordered.parkedFrom,
    history: [...queue.ignored, ...queue.done],
    asOf: facts.latestDate,
    queries: facts.queries,
    pages: facts.pages,
  };
}

/**
 * The open queue, re-ordered so what addresses the binding constraint comes
 * first.
 *
 * Nothing is dropped. A suggestion that is real but is not today\'s problem
 * stays on the page below a divider, because removing it would be the engine
 * deciding for the operator, and the diagnosis is a priority claim, not a
 * correctness claim.
 */
function orderByConstraint(
  facts: GettingFoundFacts,
  open: readonly QueueItem[],
): { suggestions: readonly QueueItem[]; parkedFrom: number | null } {
  const constraintFacts = constraintFactsFor(facts);
  if (constraintFacts === null) return { suggestions: open, parkedFrom: null };

  const diagnosis = bindingConstraint(constraintFacts);
  if (diagnosis.constraint === null) return { suggestions: open, parkedFrom: null };

  const split = partitionByConstraint(open, diagnosis.constraint, (item) => item.rule ?? "");
  // A divider with nothing on one side of it explains nothing.
  if (split.addressing.length === 0 || split.parked.length === 0) {
    return { suggestions: open, parkedFrom: null };
  }
  return {
    suggestions: [...split.addressing, ...split.parked],
    parkedFrom: split.addressing.length,
  };
}

/**
 * The numbers the diagnosis rests on, or null when they cannot be assembled.
 *
 * The impression and click totals are taken from the very same comparison the
 * tiles render. That is not a saved read, it is the guarantee: a banner and a
 * tile drawn from two different measurements of "impressions" will eventually
 * contradict each other on screen, and the banner is the one that decides the
 * order of everything below it.
 *
 * Refused, rather than guessed at, in two cases: when the coverage window has
 * not been collected, and when the comparison is not ready. A zero assembled
 * from an absent read is exactly the fabricated diagnosis this module exists to
 * prevent.
 */
function constraintFactsFor(facts: GettingFoundFacts): ConstraintFacts | null {
  if (facts.coverage === null) return null;
  if (facts.comparison.status !== "ready") return null;
  return {
    pagesKnown: facts.coverage.pagesKnown,
    pagesWithImpressions: facts.coverage.pagesWithImpressions,
    impressions: facts.comparison.current.impressions,
    clicks: facts.comparison.current.clicks,
    sessions: facts.sessions,
    // Nothing in the estate measures a conversion yet. Null says that; zero
    // would claim we looked and found none.
    conversions: null,
  };
}

/**
 * The diagnosis, and how the open queue splits against it.
 *
 * Returns null rather than guessing when the facts are absent or inconclusive,
 * because a banner asserting a priority we could not establish is the same
 * arbitrary ranking the principle warns about, only louder.
 */
function constraintFor(
  facts: GettingFoundFacts,
  open: ReturnType<typeof buildQueue>["open"],
): ConstraintBanner | null {
  const constraintFacts = constraintFactsFor(facts);
  if (constraintFacts === null) return null;

  const diagnosis = bindingConstraint(constraintFacts);
  if (diagnosis.constraint === null) return null;

  const split = partitionByConstraint(open, diagnosis.constraint, (item) => item.rule ?? "");
  return {
    reason: diagnosis.reason,
    addressing: split.addressing.length,
    parked: split.parked.length,
  };
}
