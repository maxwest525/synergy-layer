import type { Database } from "@/integrations/supabase/types";
import { confidenceInCount, confidenceInCountChange } from "./confidence";

/**
 * Pure rule checks over already-stored GA4 snapshots. Kept out of the .server
 * module so they test without mocks, matching search-console-rule-checks.ts.
 * Nothing here reads a network or a database; the .server caller supplies rows
 * and persists results.
 *
 * GA4 snapshots are rolling 28-day windows collected daily, so two snapshots
 * taken 7 days apart still share 21 days of data. A complete traffic stop in
 * the newest week shows up as only a ~25% window-over-window drop; every
 * threshold below is scaled for that damping.
 *
 * Bucketed in RULE_ASSIGNMENTS (rule-buckets.ts) per
 * docs/handoffs/2026-08-20-rule-thresholds-audit.md: trafficShift and
 * zeroEngagement are pooled (they read a per-page count that needs pooling
 * to clear the noise floor at this volume); disappearedEvent is a fact (a
 * tag or trigger stopped firing entirely, which is a wiring question, not a
 * statistics one).
 */

export type Ga4CheckRule =
  | "page_traffic_loss"
  | "page_traffic_gain"
  | "event_disappeared"
  | "zero_engagement_page"
  | "event_silent_yesterday";

/** One day's event totals, as runGa4Inventory stores them beside the window. */
export type DailyEventCounts = {
  date: string;
  events: { eventName: string; eventCount: number }[];
};

export type Ga4ObservationDraft = {
  rule: Ga4CheckRule;
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  confidence: number;
};

/** Matches metrics.rows stored on ga4_snapshots by runGa4Inventory. */
export type Ga4Row = {
  hostName: string;
  pagePath: string;
  eventName: string;
  eventCount: number;
  activeUsers: number;
  sessions: number;
};

export const GA4_RULE_THRESHOLDS = {
  trafficShift: {
    minPriorSessions: 50,
    minDropRatio: 0.2,
    minGrowthRatio: 0.25,
    maxFindingsPerRun: 10,
  },
  disappearedEvent: { minPriorEventCount: 25, maxFindingsPerRun: 10 },
  /**
   * An event is silent when it recorded nothing yesterday after recording at
   * least one on each of the previous seven days. Seven is the existing
   * comparison window, and "each day" is the whole test: no volume floor is
   * invented, so a genuinely daily event of any size qualifies and a
   * sporadic one never does.
   */
  silentEvent: { priorDays: 7, maxFindingsPerRun: 10 },
  zeroEngagement: { minSessions: 50, maxFindingsPerRun: 10 },
  comparisonWindowDays: 7,
} as const;

/** Events GA4 collects on its own; they prove rendering, not engagement. */
const AUTOMATIC_EVENTS = new Set([
  "page_view",
  "session_start",
  "first_visit",
  "user_engagement",
  "scroll",
]);

/**
 * Sessions per page. Rows are page x event, and the sessions metric counts
 * sessions in which that event fired on that page, so summing across events
 * multiplies real sessions. The max across event rows (normally the page_view
 * row) is the page's session count.
 */
function sessionsByPage(rows: Ga4Row[]): Map<string, number> {
  const byPage = new Map<string, number>();
  for (const row of rows) {
    const page = `${row.hostName}${row.pagePath}`;
    byPage.set(page, Math.max(byPage.get(page) ?? 0, row.sessions));
  }
  return byPage;
}

function eventCountByName(rows: Ga4Row[]): Map<string, number> {
  const byEvent = new Map<string, number>();
  for (const row of rows) {
    if (!row.eventName) continue;
    byEvent.set(row.eventName, (byEvent.get(row.eventName) ?? 0) + row.eventCount);
  }
  return byEvent;
}

/**
 * Pages whose window-over-window sessions moved past the damped thresholds,
 * in either direction. A page absent from the current snapshot counts as zero.
 */
export function detectPageTrafficShift(current: Ga4Row[], prior: Ga4Row[]): Ga4ObservationDraft[] {
  const t = GA4_RULE_THRESHOLDS.trafficShift;
  const currentByPage = sessionsByPage(current);
  const priorByPage = sessionsByPage(prior);

  const losses: Array<{ page: string; before: number; after: number; ratio: number }> = [];
  const gains: Array<{ page: string; before: number; after: number; ratio: number }> = [];
  for (const [page, before] of priorByPage) {
    if (before < t.minPriorSessions) continue;
    const after = currentByPage.get(page) ?? 0;
    const ratio = (after - before) / before;
    if (-ratio >= t.minDropRatio) losses.push({ page, before, after, ratio });
    else if (ratio >= t.minGrowthRatio) gains.push({ page, before, after, ratio });
  }

  const drafts: Ga4ObservationDraft[] = [];
  losses.sort((a, b) => a.ratio - b.ratio);
  for (const entry of losses.slice(0, t.maxFindingsPerRun)) {
    const confidence = confidenceInCountChange(entry.before, entry.after);
    drafts.push({
      rule: "page_traffic_loss",
      target: entry.page,
      title: `Traffic loss on ${entry.page}`,
      description: `Sessions fell from ${entry.before} to ${entry.after} (${(entry.ratio * 100).toFixed(0)}%) between overlapping 28-day GA4 windows. Because the windows share most of their days, even this damped drop means recent daily traffic fell hard.`,
      evidence: {
        page: entry.page,
        before: entry.before,
        after: entry.after,
        ratio: entry.ratio,
        confidenceReason: confidence.reason,
      },
      businessImpact: "high",
      confidence: confidence.value,
    });
  }
  gains.sort((a, b) => b.ratio - a.ratio);
  for (const entry of gains.slice(0, t.maxFindingsPerRun)) {
    const confidence = confidenceInCountChange(entry.before, entry.after);
    drafts.push({
      rule: "page_traffic_gain",
      target: entry.page,
      title: `Traffic gain on ${entry.page}`,
      description: `Sessions rose from ${entry.before} to ${entry.after} (+${(entry.ratio * 100).toFixed(0)}%) between overlapping 28-day GA4 windows. Worth reinforcing while the page is trending.`,
      evidence: {
        page: entry.page,
        before: entry.before,
        after: entry.after,
        ratio: entry.ratio,
        confidenceReason: confidence.reason,
      },
      businessImpact: "medium",
      confidence: confidence.value,
    });
  }
  return drafts;
}

/**
 * Events that carried real volume in the prior window and vanished entirely
 * from the current one: almost always broken tracking, not user behavior.
 * The rolling windows overlap, so an event only reads as vanished once it has
 * been silent for the full current window.
 */
export function detectDisappearedEvents(current: Ga4Row[], prior: Ga4Row[]): Ga4ObservationDraft[] {
  const t = GA4_RULE_THRESHOLDS.disappearedEvent;
  const currentByEvent = eventCountByName(current);
  const priorByEvent = eventCountByName(prior);

  const drafts: Ga4ObservationDraft[] = [];
  const missing = [...priorByEvent.entries()]
    .filter(([name, count]) => count >= t.minPriorEventCount && !currentByEvent.has(name))
    .sort((a, b) => b[1] - a[1]);
  for (const [name, count] of missing.slice(0, t.maxFindingsPerRun)) {
    drafts.push({
      rule: "event_disappeared",
      target: name,
      title: `Event "${name}" stopped firing`,
      description: `"${name}" recorded ${count} events in the prior 28-day GA4 window and zero in the current one. The tag, trigger, or feature that fired it has most likely broken.`,
      evidence: { eventName: name, priorEventCount: count },
      businessImpact: "high",
      // Stated assumption: 0.9 — an event that fired reliably and then
      // stopped entirely is a wiring fact, not a sampling question; capped
      // below 1 because we cannot rule out the event simply being renamed.
      confidence: 0.9,
    });
  }
  return drafts;
}

/**
 * Events that fired on each of the previous seven days and not at all
 * yesterday. `event_disappeared` compares two 28-day windows, so a broken tag
 * takes 28 silent days to show; this reads the one-day totals stored beside
 * each window and says it the next morning (MEAS-9). Automatic events count:
 * a silent page_view is the tag itself gone.
 */
export function detectSilentEvents(
  yesterday: DailyEventCounts,
  priorDays: readonly DailyEventCounts[],
): Ga4ObservationDraft[] {
  const t = GA4_RULE_THRESHOLDS.silentEvent;
  if (priorDays.length < t.priorDays) return [];
  const window = priorDays.slice(0, t.priorDays);
  const yesterdayByEvent = new Map(yesterday.events.map((e) => [e.eventName, e.eventCount]));

  const everyDay = new Map<string, number[]>();
  for (const event of window[0]!.events) {
    if (event.eventCount < 1) continue;
    const counts = window.map(
      (day) => day.events.find((e) => e.eventName === event.eventName)?.eventCount ?? 0,
    );
    if (counts.every((count) => count >= 1)) everyDay.set(event.eventName, counts);
  }

  const drafts: Ga4ObservationDraft[] = [];
  const silent = [...everyDay.entries()]
    .filter(([name]) => (yesterdayByEvent.get(name) ?? 0) === 0)
    .sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0));
  for (const [name, counts] of silent.slice(0, t.maxFindingsPerRun)) {
    drafts.push({
      rule: "event_silent_yesterday",
      target: name,
      title: `Event "${name}" recorded nothing yesterday`,
      description: `"${name}" fired on each of the previous ${t.priorDays} days (${counts.join(", ")} events) and recorded zero on ${yesterday.date}. Check the tag, trigger or form before reading it as behaviour.`,
      evidence: {
        eventName: name,
        silentDate: yesterday.date,
        priorDays: window.map((day, index) => ({ date: day.date, eventCount: counts[index] })),
      },
      businessImpact: "high",
      // Stated assumption: 0.9, as event_disappeared. A daily event that
      // stops outright is a wiring fact; held below 1 because one quiet day
      // can still be a real quiet day, which the next read will say.
      confidence: 0.9,
    });
  }
  return drafts;
}

/**
 * High-traffic pages where nothing beyond GA4's automatic events ever fires:
 * either the page has no conversion path or key-event tracking never reached
 * it. Capped so a first run over a large page set does not flood the queue.
 */
export function detectZeroEngagementPages(current: Ga4Row[]): Ga4ObservationDraft[] {
  const t = GA4_RULE_THRESHOLDS.zeroEngagement;
  const byPage = sessionsByPage(current);
  const pagesWithCustomEvents = new Set(
    current
      .filter((row) => row.eventName && !AUTOMATIC_EVENTS.has(row.eventName) && row.eventCount > 0)
      .map((row) => `${row.hostName}${row.pagePath}`),
  );

  const drafts: Ga4ObservationDraft[] = [];
  const candidates = [...byPage.entries()]
    .filter(([page, sessions]) => sessions >= t.minSessions && !pagesWithCustomEvents.has(page))
    .sort((a, b) => b[1] - a[1]);
  for (const [page, sessions] of candidates.slice(0, t.maxFindingsPerRun)) {
    const confidence = confidenceInCount(sessions, t.minSessions);
    drafts.push({
      rule: "zero_engagement_page",
      target: page,
      title: `No tracked engagement on ${page}`,
      description: `${page} drew ${sessions} sessions in the 28-day window but fired only GA4's automatic events. Either the page offers no next step or its key events are not instrumented.`,
      evidence: { page, sessions, confidenceReason: confidence.reason },
      businessImpact: "medium",
      confidence: confidence.value,
    });
  }
  return drafts;
}
