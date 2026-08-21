/**
 * The "Site health" view model.
 *
 * Two questions, and they are the two the rest of the OS cannot answer:
 *
 *  - Can Google read the site at all? That is the site-wide crawl evidence -
 *    robots.txt, the sitemap, pages that would not render - which has been
 *    computed for a long time and only recently became reachable in the queue.
 *  - Did the fixes actually work? Every approved change is measured against
 *    stored windows, and until now nothing anywhere read those readings back.
 *    `outcome-verdict.ts` was written, tested, and had no caller. This is it.
 *
 * The second one is why this page exists rather than being a speed dial. An
 * operating system that proposes changes and never grades them is asking to be
 * trusted on faith, which is the failure mode this whole project is a reaction
 * to.
 */

import { GROUNDED_WINDOWS, outcomeVerdict, type OutcomeVerdict } from "./outcome-verdict";
import type { Severity } from "./page-checks";
import type { SiteFinding } from "./site-checks";
import {
  buildQueue,
  compareQueueItems,
  type QueueItem,
  type QueueSource,
} from "./suggestion-queue";

/** One stored measurement of one approved change. */
export type StoredOutcome = {
  readonly changeId: string;
  readonly title: string;
  readonly targetUrl: string | null;
  /** The window the reading covers, verbatim from the stored row. */
  readonly windowDays: number;
  readonly daysSinceLive: number;
  readonly impressions: number;
  readonly clicks: number;
  /**
   * False when the reading covers a page the connected property cannot see, or
   * when the window was never collected. Not the same as a measured zero.
   */
  readonly measurable: boolean;
  /**
   * What the stored observation said about its own completeness.
   *
   * A `partial` reading covers only the days Search Console actually returned,
   * so its totals under-count by however many are missing. Grading one produces
   * a failure out of a gap, which is the thing this whole module refuses to do.
   */
  readonly readingStatus: "complete" | "partial" | "empty";
  /** Days the window asked for against days actually stored. Null when unknown. */
  readonly coverage: { readonly expectedDays: number; readonly observedDays: number } | null;
  /** The 28 days ending the day before approval, from the stored window-0 GSC observation. Null when never stored. */
  readonly baseline: { readonly impressions: number; readonly clicks: number } | null;
  /** Site-wide impressions over the same before/after pair. Null when fewer days are stored than the pair needs. */
  readonly siteTrend: {
    readonly beforeImpressions: number;
    readonly afterImpressions: number;
  } | null;
};

export type GradedOutcome = StoredOutcome & {
  /** Null when this reading is stored but not graded, with `ungraded` saying why. */
  readonly verdict: OutcomeVerdict | null;
  readonly reason: string;
};

export type SpeedReading = {
  readonly url: string;
  /** Mobile and desktop are separate readings of the same address. */
  readonly strategy: string;
  readonly performanceScore: number | null;
  readonly collectedAt: string;
};

export type SiteHealthFacts = {
  readonly now: string;
  /**
   * True when a read hit its own row limit, so the counts below are a floor
   * rather than a total. Silence here would present a truncation as a total.
   */
  readonly truncated?: boolean;
  readonly property: string | null;
  readonly siteFindings: readonly SiteFinding[];
  readonly siteObservedAt: string | null;
  readonly outcomes: readonly StoredOutcome[];
  readonly speed: readonly SpeedReading[];
  readonly queueSources: readonly QueueSource[];
};

export type Tile = {
  readonly label: string;
  readonly value: string | null;
  readonly explanation: string;
  readonly missingReason: string | null;
};

export type TabId = "suggestions" | "outcomes" | "crawl" | "history";

export type Tab = {
  readonly id: TabId;
  readonly label: string;
  readonly count: number | null;
};

export type StatusTone = "positive" | "warning" | "danger";

export type SiteHealthView = {
  readonly status: { readonly text: string; readonly tone: StatusTone };
  readonly tiles: readonly Tile[];
  readonly tabs: readonly Tab[];
  readonly crawl: readonly SiteFinding[];
  readonly outcomes: readonly GradedOutcome[];
  readonly suggestions: readonly QueueItem[];
  readonly history: readonly QueueItem[];
  readonly asOf: string | null;
  /**
   * Named on screen when some readings could not be graded, so a window nothing
   * derives is visible rather than quietly dropped.
   */
  readonly ungradedNote: string | null;
  /** Set when a read hit its limit, so a truncation is never shown as a total. */
  readonly truncatedNote: string | null;
};

const NOT_CHECKED =
  "The site checks have not run yet, so nothing has been read from robots.txt or your sitemap.";

/**
 * Why a stored reading is not graded.
 *
 * The measurement pipeline writes windows of 0, 7, 14 and 28 days. Zero is the
 * approval snapshot rather than an outcome. Seven is the one nothing derives:
 * it appears as a measurement window in none of the research, and its only
 * sibling anywhere is a cold-email follow-up cadence. It is kept and shown
 * rather than deleted, and it is labelled rather than graded, because a verdict
 * from a window we cannot justify is worse than no verdict.
 */
function ungradedReason(outcome: StoredOutcome): string | null {
  if (outcome.windowDays === 0) {
    return "Taken at approval, as the before picture. There is nothing to grade yet.";
  }
  if (!(GROUNDED_WINDOWS as readonly number[]).includes(outcome.windowDays)) {
    return `Taken at ${outcome.windowDays} days. Nothing derives a ${outcome.windowDays} day window, so this reading is kept but not graded.`;
  }
  if (outcome.readingStatus === "partial") {
    // The totals cover only the days Search Console returned. Judging them
    // would turn a reporting gap into a verdict, and the measurement code
    // already records the rule: do not infer from the gap.
    const covered =
      outcome.coverage === null
        ? "Search Console did not report every day in this window"
        : `Only ${outcome.coverage.observedDays} of ${outcome.coverage.expectedDays} days were reported`;
    return `${covered}, so these totals are short by an unknown amount. The reading is kept but not graded.`;
  }
  return null;
}

/** Grade every stored reading, or say why one is not graded. */
export function gradeOutcomes(outcomes: readonly StoredOutcome[]): GradedOutcome[] {
  return outcomes.map((outcome) => {
    const ungraded = ungradedReason(outcome);
    if (ungraded !== null) return { ...outcome, verdict: null, reason: ungraded };
    const assessment = outcomeVerdict({
      windowDays: outcome.windowDays,
      daysSinceLive: outcome.daysSinceLive,
      impressions: outcome.impressions,
      clicks: outcome.clicks,
      measurable: outcome.measurable,
      baseline: outcome.baseline,
      siteTrend: outcome.siteTrend,
    });
    return { ...outcome, verdict: assessment.verdict, reason: assessment.reason };
  });
}

/** One calendar day past a `YYYY-MM-DD` Pacific date string. */
function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * Sum of daily site impressions inside [start, end], or null when any day is
 * missing.
 *
 * A missing day is not a zero. Summing over a gap would understate the
 * site's own trend and make a page's rise look bigger than the tide really
 * was, which is exactly the honesty failure this module exists to avoid.
 */
export function sumSiteWindow(
  days: ReadonlyArray<{ readonly date: string; readonly impressions: number }>,
  start: string,
  end: string,
): { readonly impressions: number } | null {
  const byDate = new Map(days.map((day) => [day.date, day.impressions]));
  let sum = 0;
  for (let cursor = start; cursor <= end; cursor = nextDate(cursor)) {
    const value = byDate.get(cursor);
    if (value === undefined) return null;
    sum += value;
  }
  return { impressions: sum };
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };

/**
 * The worst score among the current readings, or null when none was stored.
 *
 * Superseded readings are dropped first. Reducing over the raw rows reported a
 * page that scored 18 three months ago and 91 today as the site's worst page,
 * which is a stale number presented as a current one.
 */
export function worstSpeed(speed: readonly SpeedReading[]): SpeedReading | null {
  const newest = new Map<string, SpeedReading>();
  for (const reading of speed) {
    if (reading.performanceScore === null) continue;
    const key = `${reading.url}\u0000${reading.strategy}`;
    const seen = newest.get(key);
    if (!seen || reading.collectedAt > seen.collectedAt) newest.set(key, reading);
  }
  const current = [...newest.values()];
  if (current.length === 0) return null;
  return current.reduce((worst, reading) =>
    (reading.performanceScore ?? 100) < (worst.performanceScore ?? 100) ? reading : worst,
  );
}

function tilesFor(facts: SiteHealthFacts, graded: readonly GradedOutcome[]): Tile[] {
  const checked = facts.siteObservedAt !== null;
  const critical = facts.siteFindings.filter((finding) => finding.severity === "critical").length;
  const slowest = worstSpeed(facts.speed);
  // A reading that says "too early" or "cannot be measured" is not a grade. The
  // tile used to count them, so it claimed two fixes had been live long enough
  // to measure directly above two cards saying neither had.
  const judged = graded.filter(
    (outcome) =>
      outcome.verdict !== null &&
      outcome.verdict !== "too_early" &&
      outcome.verdict !== "not_yet" &&
      outcome.verdict !== "unmeasurable",
  );
  const worked = judged.filter((outcome) => outcome.verdict === "success").length;

  return [
    {
      label: "Crawl problems",
      value: checked ? String(facts.siteFindings.length) : null,
      explanation: "Things stopping Google reading your site properly.",
      missingReason: checked ? null : NOT_CHECKED,
    },
    {
      label: "Blocking Google entirely",
      value: checked ? String(critical) : null,
      explanation: "Of those, the ones that stop pages being indexed at all.",
      missingReason: checked ? null : NOT_CHECKED,
    },
    {
      label: "Slowest page",
      value: slowest === null ? null : String(slowest.performanceScore),
      explanation:
        slowest === null
          ? "Google's own speed score for your worst page, out of 100."
          : `Google's own score for ${slowest.url}, out of 100, read on ${slowest.collectedAt.slice(0, 10)}.`,
      missingReason:
        slowest === null ? "No speed reading has been stored, so there is no score to show." : null,
    },
    {
      label: "Fixes graded",
      value: String(judged.length),
      explanation: facts.truncated
        ? "Approved changes that have been live long enough to be measured, among the most recent read."
        : "Approved changes that have been live long enough to be measured.",
      missingReason: null,
    },
    {
      label: "Fixes that worked",
      value: judged.length === 0 ? null : String(worked),
      explanation: "Of those graded, the ones the stored numbers say improved something.",
      missingReason:
        judged.length === 0
          ? "Nothing has been live long enough to grade, so there is nothing to count."
          : null,
    },
  ];
}

function statusFor(
  facts: SiteHealthFacts,
  graded: readonly GradedOutcome[],
  open: readonly QueueItem[],
): SiteHealthView["status"] {
  if (facts.siteObservedAt === null) {
    return { text: "Nothing has been checked yet", tone: "warning" };
  }
  const critical = facts.siteFindings.filter((finding) => finding.severity === "critical");
  if (critical.length > 0) {
    return {
      text:
        critical.length === 1
          ? "1 thing is blocking Google"
          : `${critical.length} things are blocking Google`,
      tone: "danger",
    };
  }
  if (facts.siteFindings.length > 0) {
    // Not critical, but not nothing. "Google can read your site" beside a tile
    // reading "Crawl problems: 3" is the badge contradicting the number.
    return {
      text:
        facts.siteFindings.length === 1
          ? "1 crawl problem worth fixing"
          : `${facts.siteFindings.length} crawl problems worth fixing`,
      tone: "warning",
    };
  }
  const failed = graded.filter((outcome) => outcome.verdict === "failure").length;
  if (failed > 0) {
    return {
      text: failed === 1 ? "1 fix did not work" : `${failed} fixes did not work`,
      tone: "warning",
    };
  }
  if (open.length > 0) {
    return {
      text: open.length === 1 ? "1 thing worth fixing" : `${open.length} things worth fixing`,
      tone: "warning",
    };
  }
  return { text: "Google can read your site", tone: "positive" };
}

/**
 * The windows the measurement pipeline can write.
 *
 * All four grounded windows are storable since the migration that widened
 * `change_measurement_windows.window_days` and taught the lifecycle trigger to
 * cut 56 and 90 day windows. 0 remains the approval baseline and 7 remains
 * accepted so rows already stored stay valid, though nothing creates new ones.
 */
export const STORABLE_WINDOWS = [0, 7, 14, 28, 56, 90] as const;

const GRADED_AND_STORABLE = GROUNDED_WINDOWS.filter((window) =>
  (STORABLE_WINDOWS as readonly number[]).includes(window),
);
const DERIVED_NOT_COLLECTED = GROUNDED_WINDOWS.filter(
  (window) => !(STORABLE_WINDOWS as readonly number[]).includes(window),
);

function ungradedNoteFor(graded: readonly GradedOutcome[]): string | null {
  const ungraded = graded.filter((outcome) => outcome.verdict === null && outcome.windowDays !== 0);
  if (ungraded.length === 0) return null;
  const windows = [...new Set(ungraded.map((outcome) => outcome.windowDays))].sort((a, b) => a - b);
  const notCollected =
    DERIVED_NOT_COLLECTED.length === 0
      ? ""
      : ` ${DERIVED_NOT_COLLECTED.join(" and ")} are derived too, but nothing collects them yet.`;
  return `${ungraded.length} ${ungraded.length === 1 ? "reading is" : "readings are"} stored at ${windows.join(" and ")} days and not graded. The windows this grades are ${GRADED_AND_STORABLE.join(" and ")}.${notCollected}`;
}

export function buildSiteHealth(facts: SiteHealthFacts): SiteHealthView {
  const queue = buildQueue(facts.queueSources, facts.now);
  const open = [...queue.open].sort(compareQueueItems);
  const graded = gradeOutcomes(facts.outcomes);
  const crawl = [...facts.siteFindings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return {
    status: statusFor(facts, graded, open),
    tiles: tilesFor(facts, graded),
    tabs: [
      { id: "suggestions", label: "Suggestions", count: open.length },
      { id: "outcomes", label: "Did the fixes work", count: graded.length },
      { id: "crawl", label: "Crawl checks", count: crawl.length },
      { id: "history", label: "History", count: queue.ignored.length + queue.done.length },
    ],
    crawl,
    // Worst news first: a failure the operator has not seen matters more than a
    // success they already banked.
    outcomes: [...graded].sort((a, b) => verdictRank(a) - verdictRank(b)),
    suggestions: open,
    history: [...queue.ignored, ...queue.done],
    asOf: facts.siteObservedAt,
    ungradedNote: ungradedNoteFor(graded),
    truncatedNote: facts.truncated
      ? "More changes are stored than were read for this page, so the counts above are a floor rather than a total."
      : null,
  };
}

const VERDICT_ORDER: Record<string, number> = {
  failure: 0,
  neutral: 1,
  not_yet: 2,
  too_early: 3,
  success: 4,
  unmeasurable: 5,
};

function verdictRank(outcome: GradedOutcome): number {
  // Ungraded readings sit last: they are not a verdict at all.
  return outcome.verdict === null ? 9 : (VERDICT_ORDER[outcome.verdict] ?? 5);
}
