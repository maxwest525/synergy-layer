import {
  AUTOMATIC_EVENTS,
  GA4_CHECK_RULES,
  GA4_RULE_THRESHOLDS,
  sessionsByPage,
  type Ga4Row,
} from "./ga4-rule-checks";
import { RULE_ASSIGNMENTS, type RuleBucket } from "./rule-buckets";

/**
 * The "Who visits your site" view model.
 *
 * This page deliberately reports levels, not changes, and the reason is
 * arithmetic rather than taste.
 *
 * Analytics is stored here as a rolling 28-day window collected daily. At this
 * property that window holds around a hundred and twenty sessions, of which the
 * home page takes the large majority and every other page is in single figures.
 * A count that small cannot carry a verdict about movement: the ordinary
 * week-to-week wobble on a page with six visits is larger than any change worth
 * reporting, so "traffic to this page fell" would be a coin toss dressed as a
 * finding. `RULE_ASSIGNMENTS` reached the same conclusion independently and
 * buckets three of the four GA4 rules as pooled.
 *
 * What a count that small answers perfectly well is "how many, and what did
 * they do". Twenty-one people opening a form is twenty-one people opening a
 * form; it needs no significance test, because it is not a comparison. So the
 * page shows arrival, the things visitors actually did, and where they landed -
 * and then says plainly which questions its volume cannot answer, rather than
 * answering them badly.
 *
 * Two other rules hold here as everywhere: no number appears that did not come
 * from a stored row, and an absence states its reason instead of rendering a
 * zero.
 */

/** One reading of the stored analytics window. */
export type VisitorFacts = {
  /** The GA4 property the reading came from. */
  readonly property: string;
  /** Inclusive window the snapshot covers. */
  readonly windowStart: string;
  readonly windowEnd: string;
  /** When the snapshot was stored. */
  readonly collectedAt: string;
  /** Sessions across the whole property in the window. */
  readonly totalSessions: number;
  /** Page x event rows exactly as stored. */
  readonly rows: readonly Ga4Row[];
  /**
   * Whether GA4 truncated the row set. A truncated reading is a partial one
   * and must not be presented as a total.
   */
  readonly truncated: boolean;
  /**
   * How many days separate the oldest stored snapshot from this one. Null when
   * only one snapshot exists, which is a different fact from zero days apart.
   */
  readonly historyDays: number | null;
  /** Findings raised from this property's analytics, all states counted. */
  readonly findings: number;
};

export type EventCount = {
  readonly name: string;
  readonly count: number;
};

export type PageVisits = {
  readonly page: string;
  readonly sessions: number;
};

export type Answer = {
  readonly question: string;
  readonly answerable: boolean;
  /** Why it can or cannot be answered, in the operator's words. */
  readonly because: string;
};

export type VisitorsView = {
  readonly status: { readonly text: string; readonly tone: "positive" | "warning" | "danger" };
  /** Null when no snapshot has been stored; the page then says so. */
  readonly reading: {
    readonly sessions: number;
    readonly windowDays: number;
    readonly perDay: string;
    readonly windowLabel: string;
    readonly collectedAt: string;
    readonly partial: boolean;
  } | null;
  /** Things a visitor did, beyond the browser loading a page. */
  readonly actions: readonly EventCount[];
  /** Events GA4 records by itself, kept apart from the above. */
  readonly automatic: readonly EventCount[];
  readonly pages: readonly PageVisits[];
  /** Pages that received a visit but are not in the list above. */
  readonly pagesBeyondList: number;
  readonly answers: readonly Answer[];
  /**
   * Why nothing has been raised from this analytics, or null when something
   * has been.
   */
  readonly silence: string | null;
};

/** How many days a window covers, counting both ends. */
function daysBetween(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

/** The most a single page carries, which is what a per-page rule would read. */
function busiestPage(rows: readonly Ga4Row[]): number {
  let most = 0;
  for (const sessions of sessionsByPage([...rows]).values()) {
    if (sessions > most) most = sessions;
  }
  return most;
}

function eventTotals(rows: readonly Ga4Row[]): Map<string, number> {
  const byName = new Map<string, number>();
  for (const row of rows) {
    if (!row.eventName) continue;
    byName.set(row.eventName, (byName.get(row.eventName) ?? 0) + row.eventCount);
  }
  return byName;
}

function descending(entries: Iterable<[string, number]>): EventCount[] {
  return [...entries]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

/** How many pages a rule needs before it can speak, per rule family. */
const PER_PAGE_SESSIONS_NEEDED = Math.max(
  GA4_RULE_THRESHOLDS.trafficShift.minPriorSessions,
  GA4_RULE_THRESHOLDS.zeroEngagement.minSessions,
);

const GA4_BUCKETS: ReadonlyMap<string, RuleBucket> = new Map(
  RULE_ASSIGNMENTS.filter((assignment) =>
    (GA4_CHECK_RULES as readonly string[]).includes(assignment.rule),
  ).map((assignment) => [assignment.rule, assignment.bucket]),
);

/**
 * What this volume can and cannot answer.
 *
 * Derived from the rule thresholds and the busiest page rather than written
 * down, so it cannot claim an answer the rules would refuse to give - and so
 * it changes on its own when the traffic does.
 */
function answersFor(facts: VisitorFacts): Answer[] {
  const busiest = busiestPage(facts.rows);
  const pagesOverThreshold = [...sessionsByPage([...facts.rows]).values()].filter(
    (sessions) => sessions >= PER_PAGE_SESSIONS_NEEDED,
  ).length;
  const pageCount = sessionsByPage([...facts.rows]).size;
  const hasComparison =
    facts.historyDays !== null && facts.historyDays >= GA4_RULE_THRESHOLDS.comparisonWindowDays;

  return [
    {
      question: "How many people came, and what did they do?",
      answerable: facts.totalSessions > 0,
      because:
        facts.totalSessions > 0
          ? "A count of what happened needs no comparison, so the volume does not limit it."
          : "No sessions are stored for this window.",
    },
    {
      question: "Did visits to a particular page go up or down?",
      // Both traffic rules are per-page, so the honest answer tracks whether
      // any page carries the evidence they need.
      answerable: hasComparison && pagesOverThreshold > 0,
      because: !hasComparison
        ? `Comparing needs a reading from at least ${GA4_RULE_THRESHOLDS.comparisonWindowDays} days earlier. ${
            facts.historyDays === null
              ? "Only one reading is stored."
              : `The oldest stored reading is ${facts.historyDays} ${facts.historyDays === 1 ? "day" : "days"} old.`
          }`
        : pagesOverThreshold > 0
          ? `${pagesOverThreshold} of ${pageCount} pages carry enough visits to tell a real change from ordinary variation.`
          : `No page reaches the ${PER_PAGE_SESSIONS_NEEDED} visits a month needed to tell a real change from ordinary variation. The busiest has ${busiest}.`,
    },
    {
      question: "Is a page getting visits but no action?",
      answerable: busiest >= GA4_RULE_THRESHOLDS.zeroEngagement.minSessions,
      because:
        busiest >= GA4_RULE_THRESHOLDS.zeroEngagement.minSessions
          ? "At least one page carries enough visits for the question to mean something."
          : `This is a rate question, and a rate needs ${GA4_RULE_THRESHOLDS.zeroEngagement.minSessions} visits on the page before it is worth reading. The busiest page has ${busiest}.`,
    },
    {
      question: "Has something you track stopped being recorded?",
      // The one fact-shaped GA4 rule: whether an event fired is not a
      // statistical question at any volume.
      answerable: hasComparison,
      because: hasComparison
        ? "Whether an event stopped firing is a wiring question, not a question of volume."
        : `Whether an event stopped needs an earlier reading to compare against, and none is stored from ${GA4_RULE_THRESHOLDS.comparisonWindowDays} days back yet.`,
    },
  ];
}

/**
 * Why the analytics has raised nothing.
 *
 * There is always a reason, and it is never "your site is fine". Saying
 * nothing at all in this space is how a page implies an all-clear it has not
 * earned.
 */
function silenceFor(facts: VisitorFacts, answers: readonly Answer[]): string | null {
  if (facts.findings > 0) return null;
  const unanswerable = answers.filter((answer) => !answer.answerable);
  if (unanswerable.length === 0) {
    return "Nothing has been raised from your analytics, and the checks that read it could have spoken. Take that as a quiet month rather than a broken one.";
  }
  const pooled = [...GA4_BUCKETS.values()].filter((bucket) => bucket === "pooled").length;
  return `Nothing has been raised from your analytics, and that is not the same as nothing being wrong. ${unanswerable.length} of the ${answers.length} questions below are out of reach at this volume, and ${pooled} of the four checks that read your analytics ask a per-page question your busiest page is too quiet to answer.`;
}

function statusFor(facts: VisitorFacts | null, answers: readonly Answer[]): VisitorsView["status"] {
  if (facts === null) {
    return { text: "No analytics reading stored", tone: "warning" };
  }
  if (facts.totalSessions === 0) {
    return { text: "No visits recorded in this window", tone: "warning" };
  }
  const answerable = answers.filter((answer) => answer.answerable).length;
  // Never green while most of what the operator would ask is out of reach: a
  // reassuring pill above a page explaining its own blindness is the shape
  // this project has shipped three times.
  if (answerable < answers.length) {
    return { text: `${answerable} of ${answers.length} questions answerable`, tone: "warning" };
  }
  return { text: "Every question here is answerable", tone: "positive" };
}

const PAGE_LIST_LIMIT = 8;

export function buildVisitors(facts: VisitorFacts | null): VisitorsView {
  if (facts === null) {
    return {
      status: statusFor(null, []),
      reading: null,
      actions: [],
      automatic: [],
      pages: [],
      pagesBeyondList: 0,
      answers: [],
      silence: null,
    };
  }

  const answers = answersFor(facts);
  const totals = eventTotals(facts.rows);
  const windowDays = daysBetween(facts.windowStart, facts.windowEnd);
  const bySessions = descending(sessionsByPage([...facts.rows]).entries());

  return {
    status: statusFor(facts, answers),
    reading: {
      sessions: facts.totalSessions,
      windowDays,
      perDay: windowDays > 0 ? (facts.totalSessions / windowDays).toFixed(1) : "0",
      windowLabel: `${facts.windowStart} to ${facts.windowEnd}`,
      collectedAt: facts.collectedAt,
      partial: facts.truncated,
    },
    actions: descending([...totals].filter(([name]) => !AUTOMATIC_EVENTS.has(name))),
    automatic: descending([...totals].filter(([name]) => AUTOMATIC_EVENTS.has(name))),
    pages: bySessions
      .slice(0, PAGE_LIST_LIMIT)
      .map((entry) => ({ page: entry.name, sessions: entry.count })),
    pagesBeyondList: Math.max(0, bySessions.length - PAGE_LIST_LIMIT),
    answers,
    silence: silenceFor(facts, answers),
  };
}
