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
};

export type GradedOutcome = StoredOutcome & {
  /** Null when this reading is stored but not graded, with `ungraded` saying why. */
  readonly verdict: OutcomeVerdict | null;
  readonly reason: string;
};

export type SpeedReading = {
  readonly url: string;
  readonly performanceScore: number | null;
  readonly collectedAt: string;
};

export type SiteHealthFacts = {
  readonly now: string;
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
function ungradedReason(windowDays: number): string | null {
  if (windowDays === 0) {
    return "Taken at approval, as the before picture. There is nothing to grade yet.";
  }
  if (!(GROUNDED_WINDOWS as readonly number[]).includes(windowDays)) {
    return `Taken at ${windowDays} days. Nothing derives a ${windowDays} day window, so this reading is kept but not graded.`;
  }
  return null;
}

/** Grade every stored reading, or say why one is not graded. */
export function gradeOutcomes(outcomes: readonly StoredOutcome[]): GradedOutcome[] {
  return outcomes.map((outcome) => {
    const ungraded = ungradedReason(outcome.windowDays);
    if (ungraded !== null) return { ...outcome, verdict: null, reason: ungraded };
    const assessment = outcomeVerdict({
      windowDays: outcome.windowDays,
      daysSinceLive: outcome.daysSinceLive,
      impressions: outcome.impressions,
      clicks: outcome.clicks,
      measurable: outcome.measurable,
    });
    return { ...outcome, verdict: assessment.verdict, reason: assessment.reason };
  });
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };

/** The worst score across every page speed was read for, or null when none was. */
function worstSpeed(speed: readonly SpeedReading[]): SpeedReading | null {
  const scored = speed.filter((reading) => reading.performanceScore !== null);
  if (scored.length === 0) return null;
  return scored.reduce((worst, reading) =>
    (reading.performanceScore ?? 100) < (worst.performanceScore ?? 100) ? reading : worst,
  );
}

function tilesFor(facts: SiteHealthFacts, graded: readonly GradedOutcome[]): Tile[] {
  const checked = facts.siteObservedAt !== null;
  const critical = facts.siteFindings.filter((finding) => finding.severity === "critical").length;
  const slowest = worstSpeed(facts.speed);
  const judged = graded.filter((outcome) => outcome.verdict !== null);
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
      explanation: "Google's own speed score for your worst page, out of 100.",
      missingReason:
        slowest === null ? "No speed reading has been stored, so there is no score to show." : null,
    },
    {
      label: "Fixes graded",
      value: String(judged.length),
      explanation: "Approved changes that have been live long enough to be measured.",
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

function ungradedNoteFor(graded: readonly GradedOutcome[]): string | null {
  const ungrounded = graded.filter(
    (outcome) => outcome.verdict === null && outcome.windowDays !== 0,
  );
  if (ungrounded.length === 0) return null;
  const windows = [...new Set(ungrounded.map((outcome) => outcome.windowDays))].sort(
    (a, b) => a - b,
  );
  return `${ungrounded.length} ${ungrounded.length === 1 ? "reading is" : "readings are"} stored at ${windows.join(" and ")} days and not graded. The windows this grades are ${GROUNDED_WINDOWS.join(", ")}, each of which the research derives.`;
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
  };
}

const VERDICT_ORDER: Record<string, number> = {
  failure: 0,
  neutral: 1,
  too_early: 2,
  success: 3,
  unmeasurable: 4,
};

function verdictRank(outcome: GradedOutcome): number {
  // Ungraded readings sit last: they are not a verdict at all.
  return outcome.verdict === null ? 9 : (VERDICT_ORDER[outcome.verdict] ?? 5);
}
