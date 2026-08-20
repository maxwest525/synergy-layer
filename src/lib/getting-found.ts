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

import { buildQueue, compareQueueItems, type QueueSource } from "./suggestion-queue";
import type { PeriodComparison } from "./search-console";

export type SearchListRow = {
  readonly label: string;
  readonly clicks: number;
};

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

export type TabId = "overview" | "suggestions" | "queries" | "pages" | "history";

export type Tab = {
  readonly id: TabId;
  readonly label: string;
  /** Null when the tab carries no count, as Overview does not. */
  readonly count: number | null;
};

export type GettingFoundView = {
  readonly tiles: readonly GettingFoundTile[];
  readonly status: GettingFoundStatus;
  readonly tabs: readonly Tab[];
};

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
function statusFor(open: ReturnType<typeof buildQueue>["open"]): GettingFoundStatus {
  if (open.length === 0) return { text: "Nothing needs you here", tone: "positive" };

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
  const handled = queue.ignored.length + queue.done.length;

  return {
    tiles: [
      clicksTile(facts.comparison, reason),
      impressionsTile(facts.comparison, reason),
      ctrTile(facts.comparison, reason),
      positionTile(facts.comparison, reason),
    ],
    status: statusFor(open),
    tabs: [
      { id: "overview", label: "Overview", count: null },
      { id: "suggestions", label: "Suggestions", count: open.length },
      { id: "queries", label: "Searches", count: null },
      { id: "pages", label: "Pages", count: null },
      { id: "history", label: "History", count: handled },
    ],
  };
}
