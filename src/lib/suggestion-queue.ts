/**
 * The suggestion queue's state machine, derived entirely from rows that already
 * exist.
 *
 * The queue is the centre of gravity of every category page, and the Command
 * center shows the top of it. Nothing here invents a state: `open`, `ignored`
 * and `done` are readings of the stored `recommendation_state` /
 * change-request state, and urgency is read off stored timestamps and stored
 * audit severities. That is why this module is pure and exhaustively tested
 * while the surfaces that render it stay thin.
 *
 * Phase 1 adds no table, so an affordance that would need one (ignoring an
 * audit finding, restoring a rejected change request) reports itself as
 * unavailable rather than rendering a button that cannot work.
 */

import type { CategoryId } from "./categories";

/** Open suggestions shown in one week, per the spec's cap. */
export const WEEKLY_VISIBLE_CAP = 7;

const DAY_MS = 86_400_000;
const FIX_NOW_AFTER_DAYS = 14;
const WORTH_DOING_AFTER_DAYS = 3;
const WEEK_DAYS = 7;

export type QueueItemKind = "change" | "recommendation" | "audit";
export type QueueState = "open" | "ignored" | "done";
export type UrgencyRank = "fix_now" | "worth_doing" | "nice_to_have";
export type UrgencyTone = "danger" | "warning" | "info";
export type AuditSeverity = "critical" | "warning" | "advice";

export type QueueSource = {
  readonly id: string;
  readonly kind: QueueItemKind;
  readonly categoryId: CategoryId;
  readonly title: string;
  readonly targetUrl: string | null;
  /** The stored state verbatim: `recommendation_state` or a change-request state. */
  readonly storedState: string;
  /** `recommendations.issue_fingerprint`, the natural dedup key. Null when absent. */
  readonly fingerprint: string | null;
  /** Only page-audit findings carry a stored severity. */
  readonly severity: AuditSeverity | null;
  /** Set when a change request was already drafted from this recommendation. */
  readonly linkedChangeId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type QueueItem = QueueSource & {
  readonly queueState: QueueState;
  readonly urgency: UrgencyRank;
  readonly urgencyLabel: string;
  readonly tone: UrgencyTone;
  readonly canRestore: boolean;
  readonly canIgnore: boolean;
};

export type Queue = {
  readonly open: readonly QueueItem[];
  readonly ignored: readonly QueueItem[];
  readonly done: readonly QueueItem[];
  /** `open`, ranked, capped at {@link WEEKLY_VISIBLE_CAP}. */
  readonly visible: readonly QueueItem[];
};

const OPEN_STATES = new Set(["draft", "proposed", "under_review", "observed"]);
const IGNORED_STATES = new Set(["rejected"]);
const DONE_STATES = new Set(["applied", "verified"]);

/**
 * Which tab a row belongs in, or `null` when it is not queue work at all.
 *
 * `scheduled`, `failed` and `rolled_back` are real states but they are not
 * decisions waiting on the operator, so they stay out of the queue rather than
 * being forced into a tab.
 */
export function queueStateFor(source: QueueSource): QueueState | null {
  if (source.linkedChangeId !== null) return null;
  if (OPEN_STATES.has(source.storedState)) return "open";
  if (IGNORED_STATES.has(source.storedState)) return "ignored";
  if (DONE_STATES.has(source.storedState)) return "done";
  return null;
}

function elapsedDays(from: string, now: string): number {
  return Math.floor((Date.parse(now) - Date.parse(from)) / DAY_MS);
}

const SEVERITY_RANK: Record<AuditSeverity, UrgencyRank> = {
  critical: "fix_now",
  warning: "worth_doing",
  advice: "nice_to_have",
};

/**
 * A stored severity wins, because the check that raised it already judged it.
 * Everything else escalates by how long it has genuinely been waiting.
 */
export function urgencyFor(source: QueueSource, now: string): UrgencyRank {
  if (source.severity !== null) return SEVERITY_RANK[source.severity];
  const days = elapsedDays(source.createdAt, now);
  if (days >= FIX_NOW_AFTER_DAYS) return "fix_now";
  if (days >= WORTH_DOING_AFTER_DAYS) return "worth_doing";
  return "nice_to_have";
}

/** Urgency written as time, because the stored field is a timestamp. */
export function urgencyLabel(source: QueueSource, now: string): string {
  const days = elapsedDays(source.createdAt, now);
  if (days <= 0) return "waiting since today";
  if (days === 1) return "waiting 1 day";
  return `waiting ${days} days`;
}

const URGENCY_TONE: Record<UrgencyRank, UrgencyTone> = {
  fix_now: "danger",
  worth_doing: "warning",
  nice_to_have: "info",
};

/**
 * Rank drives colour: Fix now red, Worth doing yellow, Nice to have blue, per
 * the palette the spec assigns.
 */
export function toneForUrgency(urgency: UrgencyRank): UrgencyTone {
  return URGENCY_TONE[urgency];
}

/** A rejected change request is terminal, so restoring it is not offered. */
function canRestoreSource(source: QueueSource): boolean {
  return source.kind !== "change";
}

/** Ignoring needs somewhere to store the suppression. Audit findings have none yet. */
function canIgnoreSource(source: QueueSource): boolean {
  return source.kind !== "audit";
}

/**
 * Collapses repeats of the same finding.
 *
 * Duplicates are matched on `(kind, fingerprint)` so a recommendation and the
 * change request drafted from it are never merged, and the earliest row wins so
 * "waiting 14 days" keeps telling the truth. Rows without a fingerprint are
 * never collapsed, because nothing proves they are the same finding.
 */
export function dedupeSources(sources: readonly QueueSource[]): readonly QueueSource[] {
  const byFingerprint = new Map<string, QueueSource>();
  const unkeyed: QueueSource[] = [];

  for (const source of sources) {
    if (source.fingerprint === null) {
      unkeyed.push(source);
      continue;
    }
    const key = `${source.kind}:${source.fingerprint}`;
    const held = byFingerprint.get(key);
    if (held === undefined || Date.parse(source.createdAt) < Date.parse(held.createdAt)) {
      byFingerprint.set(key, source);
    }
  }

  return [...byFingerprint.values(), ...unkeyed];
}

const RANK_ORDER: Record<UrgencyRank, number> = {
  fix_now: 0,
  worth_doing: 1,
  nice_to_have: 2,
};

/** Highest urgency first, then the longest wait, then id so the order is stable. */
export function compareQueueItems(a: QueueItem, b: QueueItem): number {
  const byRank = RANK_ORDER[a.urgency] - RANK_ORDER[b.urgency];
  if (byRank !== 0) return byRank;
  const byAge = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byAge !== 0) return byAge;
  return a.id.localeCompare(b.id);
}

function toItem(source: QueueSource, queueState: QueueState, now: string): QueueItem {
  const urgency = urgencyFor(source, now);
  return {
    ...source,
    queueState,
    urgency,
    urgencyLabel: urgencyLabel(source, now),
    tone: toneForUrgency(urgency),
    canRestore: canRestoreSource(source),
    canIgnore: canIgnoreSource(source),
  };
}

/**
 * The whole queue for one surface.
 *
 * `visible` is what a page renders; `open` stays complete, so a count never
 * claims that seven is all there is.
 */
export function buildQueue(sources: readonly QueueSource[], now: string): Queue {
  const open: QueueItem[] = [];
  const ignored: QueueItem[] = [];
  const done: QueueItem[] = [];

  for (const source of dedupeSources(sources)) {
    const queueState = queueStateFor(source);
    if (queueState === null) continue;
    const item = toItem(source, queueState, now);
    if (queueState === "open") open.push(item);
    else if (queueState === "ignored") ignored.push(item);
    else done.push(item);
  }

  const ranked = [...open].sort(compareQueueItems);

  return {
    open: ranked,
    ignored,
    done,
    visible: ranked.slice(0, WEEKLY_VISIBLE_CAP),
  };
}

export type WeeklyProgress = { readonly handled: number; readonly total: number };

/**
 * "4 of 7 handled this week". Handling means the decision was made, so an
 * ignore counts exactly as much as an approval.
 */
export function weeklyProgress(queue: Queue, now: string): WeeklyProgress {
  const handled = [...queue.ignored, ...queue.done].filter(
    (item) => elapsedDays(item.updatedAt, now) < WEEK_DAYS,
  ).length;
  return { handled, total: handled + queue.open.length };
}
