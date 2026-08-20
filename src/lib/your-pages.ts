/**
 * The "Your pages" view model.
 *
 * The audit reports by check: "17 pages have a missing title". That is the
 * right shape for a rule engine and the wrong shape for this page. The category
 * is called Your pages, and the operator opening it is asking what is wrong
 * with one page, not how many pages share one defect. So the first thing this
 * does is invert that grouping.
 *
 * The second thing it does is decide which page is worth opening first, and
 * that is not "the one with the worst defect". A title rewrite on a page nobody
 * has ever seen buys nothing; the same rewrite on a page with four hundred
 * impressions and no clicks is the whole job. Which of those is true depends on
 * the constraint that binds, so the same diagnosis that orders the search page
 * orders this one.
 *
 * Same honesty rules as everywhere else: a number appears only when a stored
 * row backs it, an absence names what is missing, and a stored zero is a zero.
 */

import { bindingConstraint, type ConstraintFacts, type Constraint } from "./binding-constraint";
import type { PageCoverage } from "./getting-found";
import type { CheckFinding, Severity } from "./page-checks";
import type { PeriodComparison } from "./search-console";
import {
  buildQueue,
  compareQueueItems,
  type QueueItem,
  type QueueSource,
} from "./suggestion-queue";

/** One defect on one page, as the operator reads it. */
export type PageDefect = {
  readonly check: string;
  readonly label: string;
  readonly severity: Severity;
  /** What the check actually saw on this page. */
  readonly detail: string;
  /** True when the governed wording proposal can draft the fix. */
  readonly fixable: boolean;
};

/** What Search Console reported for one page, plus whatever the audit found on it. */
export type PageEvidence = {
  readonly url: string;
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number | null;
  readonly position: number | null;
  /** A change request already drafted for this page, if any. */
  readonly changeId: string | null;
  readonly changeState: string | null;
};

export type PageRow = PageEvidence & {
  readonly defects: readonly PageDefect[];
  /** The worst severity on this page, or null when nothing is wrong with it. */
  readonly worst: Severity | null;
  /** Why this page sits where it does, in the operator's words. */
  readonly reason: string;
};

export type YourPagesFacts = {
  readonly now: string;
  readonly property: string | null;
  /** Every page Search Console reported, with its stored metrics. */
  readonly pages: readonly PageEvidence[];
  /** The audit's findings, grouped by check as the rules produce them. */
  readonly findings: readonly CheckFinding[];
  readonly queueSources: readonly QueueSource[];
  /** How many pages the audit read, and how many it could not. */
  readonly observedPages: number;
  readonly failedPages: number;
  readonly lastObservedAt: string | null;
  /** Changes that are live on the site now. */
  readonly fixesLive: number;
  readonly comparison: PeriodComparison;
  readonly coverage: PageCoverage | null;
  readonly sessions: number | null;
};

export type Tile = {
  readonly label: string;
  readonly value: string | null;
  readonly explanation: string;
  readonly missingReason: string | null;
};

export type TabId = "suggestions" | "pages" | "history";

export type Tab = {
  readonly id: TabId;
  readonly label: string;
  readonly count: number | null;
};

export type StatusTone = "positive" | "warning" | "danger";

export type YourPagesView = {
  readonly status: { readonly text: string; readonly tone: StatusTone };
  readonly tiles: readonly Tile[];
  readonly tabs: readonly Tab[];
  /** One row per page, ordered by what the constraint says matters. */
  readonly rows: readonly PageRow[];
  /** Why the rows are in this order, or null when no diagnosis backs it. */
  readonly ordering: string | null;
  readonly suggestions: readonly QueueItem[];
  readonly history: readonly QueueItem[];
  /** The last time the audit read the site, written for display. */
  readonly asOf: string | null;
};

const NOT_AUDITED = "The page audit has not run yet, so nothing has been read from your pages.";

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };

/**
 * Turn check-grouped findings into per-page defects.
 *
 * This is the inversion the page exists for. The rules produce one finding per
 * check listing every page it matched; the operator wants one entry per page
 * listing every check that matched it.
 */
export function defectsByPage(
  findings: readonly CheckFinding[],
): ReadonlyMap<string, readonly PageDefect[]> {
  const byPage = new Map<string, PageDefect[]>();
  for (const finding of findings) {
    for (const page of finding.pages) {
      const list = byPage.get(page.url) ?? [];
      list.push({
        check: finding.check,
        label: finding.label,
        severity: finding.severity,
        detail: page.detail,
        fixable: finding.fixableByWordingProposal,
      });
      byPage.set(page.url, list);
    }
  }
  for (const [url, list] of byPage) {
    byPage.set(
      url,
      [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    );
  }
  return byPage;
}

function worstOf(defects: readonly PageDefect[]): Severity | null {
  if (defects.length === 0) return null;
  return defects.reduce<Severity>(
    (worst, defect) =>
      SEVERITY_ORDER[defect.severity] < SEVERITY_ORDER[worst] ? defect.severity : worst,
    "advice",
  );
}

/**
 * The constraint the page ordering answers to, or null when none is established.
 *
 * Assembled from the same period comparison the tiles render, for the same
 * reason it is on the search page: a banner and a tile drawn from two different
 * measurements of the same word will eventually disagree on screen.
 */
function constraintFor(facts: YourPagesFacts): Constraint | null {
  if (facts.coverage === null) return null;
  if (facts.comparison.status !== "ready") return null;
  const diagnosis = bindingConstraint({
    pagesKnown: facts.coverage.pagesKnown,
    pagesWithImpressions: facts.coverage.pagesWithImpressions,
    impressions: facts.comparison.current.impressions,
    clicks: facts.comparison.current.clicks,
    sessions: facts.sessions,
    conversions: null,
  } satisfies ConstraintFacts);
  return diagnosis.constraint;
}

/**
 * Why one page sits where it does, and how far up.
 *
 * Lower sorts first. The reason is carried alongside the number so the page can
 * say it out loud rather than presenting an order the operator has to trust.
 */
function rank(
  page: PageEvidence,
  defects: readonly PageDefect[],
  constraint: Constraint | null,
): { readonly key: number; readonly reason: string } {
  const worst = worstOf(defects);
  const severity = worst === null ? 3 : SEVERITY_ORDER[worst];

  if (constraint === "reachability") {
    // Nothing downstream matters while the page cannot be found. A page Google
    // has never shown is the work, however clean its wording is.
    if (page.impressions === 0) {
      return {
        key: 0,
        reason: "Google has never shown this page, so nothing on it can be working yet.",
      };
    }
    return {
      key: 10 + severity,
      reason: `Google is showing this page ${page.impressions} times, so it is already past the problem holding the rest back.`,
    };
  }

  if (constraint === "click") {
    // Being seen and passed over. The pages with the most impressions and the
    // least to show for them are where wording actually moves something.
    if (page.impressions > 0 && page.clicks === 0) {
      return {
        key: 0 + severity / 10,
        reason: `Shown ${page.impressions} times and clicked none. This is the wording people are reading and passing over.`,
      };
    }
    return {
      key: 10 - Math.min(9, Math.log10(page.impressions + 1)) + severity / 10,
      reason:
        page.impressions === 0
          ? "Google has not shown this page, so its wording is not what is costing you clicks."
          : `Shown ${page.impressions} times and clicked ${page.clicks}.`,
    };
  }

  // No diagnosis. Worst defect first, and among equals the page most people see.
  return {
    key: severity * 1000 - Math.min(999, page.impressions),
    reason:
      worst === null
        ? "Nothing is wrong with this page."
        : `${defects.length} ${defects.length === 1 ? "thing" : "things"} to fix, and Google showed it ${page.impressions} times.`,
  };
}

function orderingStatement(constraint: Constraint | null): string | null {
  if (constraint === "reachability") {
    return "Ordered by what Google has never shown. Wording cannot help a page that is not being found, so those come last.";
  }
  if (constraint === "click") {
    return "Ordered by pages people see and do not click. That is where the wording on the page is what decides it.";
  }
  return null;
}

function tilesFor(facts: YourPagesFacts, rows: readonly PageRow[]): Tile[] {
  const audited = facts.lastObservedAt !== null;
  const withDefects = rows.filter((row) => row.defects.length > 0).length;
  const neverShown = facts.pages.filter((page) => page.impressions === 0).length;

  return [
    {
      label: "Pages read",
      value: audited ? String(facts.observedPages) : null,
      explanation: "How many of your pages the audit was able to open and read.",
      missingReason: audited ? null : NOT_AUDITED,
    },
    {
      label: "Pages with something wrong",
      value: audited ? String(withDefects) : null,
      explanation: "Pages where at least one check found a real defect.",
      missingReason: audited ? null : NOT_AUDITED,
    },
    {
      label: "Pages that would not open",
      value: audited ? String(facts.failedPages) : null,
      explanation: "Pages that failed to render when read. A crawler sees the same failure.",
      missingReason: audited ? null : NOT_AUDITED,
    },
    {
      label: "Fixes live now",
      value: String(facts.fixesLive),
      explanation: "Changes you approved that are on the site and have not been rolled back.",
      missingReason: null,
    },
    {
      label: "Never shown by Google",
      value: facts.pages.length === 0 ? null : String(neverShown),
      explanation: "Pages Search Console has never reported a single impression for.",
      missingReason:
        facts.pages.length === 0
          ? "Search Console has reported no pages yet, so there is nothing to count."
          : null,
    },
  ];
}

function statusFor(rows: readonly PageRow[], open: readonly QueueItem[]): YourPagesView["status"] {
  const critical = rows.filter((row) => row.worst === "critical").length;
  if (critical > 0) {
    return {
      text: critical === 1 ? "1 page badly broken" : `${critical} pages badly broken`,
      tone: "danger",
    };
  }
  if (open.length > 0) {
    return {
      text: open.length === 1 ? "1 fix waiting for you" : `${open.length} fixes waiting for you`,
      tone: "warning",
    };
  }
  const withDefects = rows.filter((row) => row.defects.length > 0).length;
  if (withDefects > 0) {
    return { text: `${withDefects} pages worth tidying`, tone: "warning" };
  }
  return { text: "Nothing needs you here", tone: "positive" };
}

export function buildYourPages(facts: YourPagesFacts): YourPagesView {
  const queue = buildQueue(facts.queueSources, facts.now);
  const open = [...queue.open].sort(compareQueueItems);
  const defects = defectsByPage(facts.findings);
  const constraint = constraintFor(facts);

  const rows = facts.pages
    .map((page) => {
      const own = defects.get(page.url) ?? [];
      const ranked = rank(page, own, constraint);
      return {
        ...page,
        defects: own,
        worst: worstOf(own),
        reason: ranked.reason,
        // Kept off the public type: the order is the output, not the number.
        __key: ranked.key,
      };
    })
    .sort((left, right) => left.__key - right.__key || left.url.localeCompare(right.url))
    .map(({ __key: _unused, ...row }) => row);

  return {
    status: statusFor(rows, open),
    tiles: tilesFor(facts, rows),
    tabs: [
      { id: "suggestions", label: "Suggestions", count: open.length },
      { id: "pages", label: "Pages", count: rows.length },
      { id: "history", label: "History", count: queue.ignored.length + queue.done.length },
    ],
    rows,
    ordering: orderingStatement(constraint),
    suggestions: open,
    history: [...queue.ignored, ...queue.done],
    asOf: facts.lastObservedAt,
  };
}
