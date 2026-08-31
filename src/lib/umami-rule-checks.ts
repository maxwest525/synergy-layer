import type { Database } from "@/integrations/supabase/types";
import { MIN_BASELINE, confidenceInCountChange } from "./confidence";

/**
 * Pure rule checks over already-stored Umami snapshots. Kept out of the
 * .server module so they test without mocks, matching ga4-rule-checks.ts and
 * pagespeed-rule-checks.ts. Nothing here reads a network or a database; the
 * .server caller supplies rows (already read defensively from jsonb) and
 * persists results.
 *
 * `cap.umami` is real and `umami_snapshots` rows exist, but until this module
 * nothing read them, so the `visitors` category had no Umami finding.
 *
 * Two rules were proposed and killed by the adversarial review that produced
 * this file's design: `umami_page_traffic_shift` (a per-page threshold this
 * property's traffic cannot support) and `umami_recording_stopped` (asserted
 * a wiring conclusion the evidence cannot carry). The three rules here are
 * narrower than either kill and must stay that way:
 *
 * - `umami_zero_recorded` states a measured zero, never that tracking broke.
 * - `umami_site_traffic_shift` is the pooled, site-wide version of the killed
 *   per-page shift rule.
 * - `umami_referrer_source_stopped` reports a single source going silent, not
 *   a ranking or visibility claim — Umami has no search dimension at all.
 *
 * Analytics findings never assert SEO or ranking causation. A traffic drop is
 * a traffic drop.
 */

export type UmamiCheckRule =
  "umami_zero_recorded" | "umami_site_traffic_shift" | "umami_referrer_source_stopped";

export type UmamiObservationDraft = {
  rule: UmamiCheckRule;
  /** A website id for the pooled rules, `"{websiteId} :: {referrer}"` for the referrer rule. */
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  confidence: number;
};

export const UMAMI_RULE_THRESHOLDS = {
  referrer: {
    /**
     * The slice AOOS itself applies to /metrics?type=referrer
     * (umami/client.server.ts, fetchUmamiMetrics). Exported so the collector
     * and this rule read the same object rather than each hand-copying 25
     * (AGENTS.md: "No threshold value copied by hand").
     */
    appSliceLimit: 25,
    /**
     * Umami's own default page size for GET /api/websites/:id/metrics, when
     * no `limit` query parameter is sent (AOOS sends none). Verified against
     * https://docs.umami.is/docs/api/website-stats on 2026-08-31: "limit
     * (optional, default 500) Number of rows returned." Recorded here, not
     * only in the digest, so the completeness guard compares against the
     * smaller of the two slices rather than trusting `appSliceLimit` alone.
     */
    providerDefaultLimit: 500,
    /**
     * Mirrors GA4_RULE_THRESHOLDS.disappearedEvent.maxFindingsPerRun
     * (ga4-rule-checks.ts): a site-wide collapse must read as one event, not
     * one card per referrer that happened to be in the prior window.
     */
    maxFindingsPerRun: 10,
  },
  windowPairing: {
    /**
     * Stated assumption: one day of tolerance on a 28-day window is at most a
     * 3.6% difference in exposure — about 15 visitors at a baseline of 412 —
     * against a noise floor of roughly sqrt(412 * DISPERSION) ~= 35
     * (confidence.ts), so treating same-length-within-a-day windows as
     * comparable is conservative rather than lenient. What would settle it:
     * requiring exact equality, since the scheduled daily collection always
     * passes the same 28-day default and only an operator-triggered refresh
     * varies the window length.
     */
    lengthToleranceMs: 24 * 60 * 60 * 1000,
  },
  zeroRecorded: {
    /**
     * Stated assumption: medium band (bandOf() in confidence.ts is
     * [0.4, 0.75)), not MAX_CONFIDENCE. "The script is not running" and
     * "nobody visited" are fully coextensive explanations of one measured
     * zero — unlike event_disappeared's 0.9, which rests on a two-window
     * contrast (it fired in the prior window and vanished in this one), this
     * rule has no prior window to rule out the wiring explanation. What would
     * settle it: a fetch of the site confirming the Umami script tag is
     * still present.
     */
    confidence: 0.5,
  },
  siteTrafficShift: {
    /**
     * Stated assumption: "zero or near zero" is read as 0 or 1 recorded
     * visitor. A healthy site with its tracking script removed returns an
     * honest zero the collector cannot distinguish from a real collapse, and
     * that ambiguity does not meaningfully change at a count of one.
     */
    nearZeroAfter: 1,
  },
} as const;

/** Plain words for a stored Umami counter name; never the provider's key on screen. */
const STAT_LABELS: Record<string, string> = {
  pageviews: "pageviews",
  visitors: "visitors",
  visits: "visits",
  bounces: "bounces",
  totaltime: "time on site",
};

function statLabel(key: string): string {
  return STAT_LABELS[key] ?? key;
}

function formatWindowLabel(periodStart: string, periodEnd: string): string {
  const startMs = Date.parse(periodStart);
  const endMs = Date.parse(periodEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "an unreadable window";
  const days = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
  const endLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(endMs));
  return `the ${days} days to ${endLabel}`;
}

function joinWithNo(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return `no ${labels[0]}`;
  return `no ${labels.slice(0, -1).join(", no ")}, no ${labels[labels.length - 1]}`;
}

/**
 * Reads `umami_snapshots.totals` for metric='stats' defensively. Mirrors the
 * shape `fetchUmamiStats` already guarantees at write time
 * (umami/client.server.ts, `statValue`): each entry is `{ value, prev }`. An
 * entry that does not parse is dropped rather than treated as zero, so it
 * never inflates a "recorded nothing" list with a counter that was never
 * actually read, and never silently counts as a healthy non-zero reading
 * either.
 */
export function parseStatsTotals(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const value = Number((entry as Record<string, unknown>)["value"]);
    if (Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export type UmamiReferrerRow = { label: string; count: number };

/**
 * Reads `umami_snapshots.payload` for metric='referrers' defensively. Mirrors
 * `{ rows: referrers }` written by observeUmami, where each row is
 * `{ label, count }` (umami/client.server.ts, `UmamiMetricRow`). A row that
 * does not parse is dropped, never invented.
 */
export function parseReferrerRows(raw: unknown): UmamiReferrerRow[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rows = (raw as Record<string, unknown>)["rows"];
  if (!Array.isArray(rows)) return null;
  const out: UmamiReferrerRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const label = typeof record["label"] === "string" ? record["label"] : null;
    const count = Number(record["count"]);
    if (label === null || !Number.isFinite(count)) continue;
    out.push({ label, count });
  }
  return out;
}

type WithWebsite = { websiteId: string };

function groupByWebsite<T extends WithWebsite>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.websiteId);
    if (list) list.push(row);
    else groups.set(row.websiteId, [row]);
  }
  return groups;
}

function newestPerWebsite<T extends WithWebsite & { periodEnd: string }>(rows: readonly T[]): T[] {
  const newest = new Map<string, T>();
  for (const row of rows) {
    const held = newest.get(row.websiteId);
    if (!held || row.periodEnd > held.periodEnd) newest.set(row.websiteId, row);
  }
  return [...newest.values()];
}

type WindowedReading = WithWebsite & { periodStart: string; periodEnd: string };

/**
 * Pairs the newest reading for a website with the newest strictly
 * non-overlapping, same-length prior reading — "do not diff overlapping
 * windows" (seo-measurement skill), made concrete for a table that stores
 * explicit period bounds rather than GA4's rolling ones. Returns null when no
 * such pair exists yet (a single stored window, or every candidate either
 * overlaps or is a materially different length), which is the honest reading
 * at this property's current volume: one stored run cannot be diffed against
 * itself.
 */
export function pairNonOverlappingWindows<T extends WindowedReading>(
  readingsForOneWebsite: readonly T[],
): { current: T; prior: T } | null {
  if (readingsForOneWebsite.length < 2) return null;
  const sorted = [...readingsForOneWebsite].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const current = sorted[0]!;
  const currentStartMs = Date.parse(current.periodStart);
  const currentEndMs = Date.parse(current.periodEnd);
  if (!Number.isFinite(currentStartMs) || !Number.isFinite(currentEndMs)) return null;
  const currentLengthMs = currentEndMs - currentStartMs;
  const tolerance = UMAMI_RULE_THRESHOLDS.windowPairing.lengthToleranceMs;

  const prior = sorted.slice(1).find((candidate) => {
    const candidateStartMs = Date.parse(candidate.periodStart);
    const candidateEndMs = Date.parse(candidate.periodEnd);
    if (!Number.isFinite(candidateStartMs) || !Number.isFinite(candidateEndMs)) return false;
    if (candidateEndMs > currentStartMs) return false; // must not overlap the current window
    const candidateLengthMs = candidateEndMs - candidateStartMs;
    return Math.abs(candidateLengthMs - currentLengthMs) <= tolerance;
  });

  return prior ? { current, prior } : null;
}

/** One `umami_snapshots` row where `metric = 'stats'`, as read by the .server caller. */
export type UmamiStatsSnapshot = WindowedReading & {
  websiteName: string;
  /** Null when the row's `run_id` is null or names no stored run. */
  runId: string | null;
  /** `measurement_runs.status` joined by `run_id`; null when no run row matched. */
  runStatus: string | null;
  returnedRowCount: number;
  /** Raw `totals` jsonb, parsed defensively via {@link parseStatsTotals}. */
  totals: unknown;
  /** Whether this row's website was matched against a tenant-owned asset (see umami/observe.server.ts, pickWebsite). */
  ownedMatch: boolean;
};

/**
 * A month with nothing recorded reads as clean unless it is named. Fires only
 * when the read itself is trustworthy: the run that produced this snapshot
 * succeeded, the row names that run at all (a null `run_id` — nullable, `on
 * delete set null` — blocks the finding rather than passing as unknown), and
 * Umami actually returned counters that all parsed to zero. `returned_row_count
 * > 0` and `Object.keys(totals).length > 0` are the same test written twice
 * (observeUmami sets `returned_row_count` to `Object.keys(stats).length`), so
 * this checks the parsed keys once rather than presenting two guards as
 * independent.
 */
export function detectZeroRecorded(
  readings: readonly UmamiStatsSnapshot[],
): UmamiObservationDraft[] {
  const drafts: UmamiObservationDraft[] = [];
  for (const reading of newestPerWebsite(readings)) {
    if (reading.runId === null) continue;
    if (reading.runStatus !== "succeeded") continue;
    const parsed = parseStatsTotals(reading.totals);
    if (parsed === null) continue; // malformed jsonb: nothing readable to assert
    const keys = Object.keys(parsed);
    if (keys.length === 0) continue; // an empty read, not a zero read
    if (!keys.every((key) => parsed[key] === 0)) continue;

    const counters = keys.map(statLabel);
    const windowLabel = formatWindowLabel(reading.periodStart, reading.periodEnd);
    const subject = reading.ownedMatch ? "Your" : "The";

    drafts.push({
      rule: "umami_zero_recorded",
      target: reading.websiteId,
      title: `${subject} Umami instance recorded nothing for ${reading.websiteName}`,
      description:
        `${subject} Umami instance answered for ${reading.websiteName} and recorded nothing at all in ${windowLabel}: ${joinWithNo(counters)}. ` +
        `The read itself succeeded and Umami returned its counters, so this is Umami reporting nothing arrived rather than a reading we could not take. ` +
        `Nothing here can tell a tracking script that is not running from a month with no visitors; checking the script is present on the site settles which it is.`,
      evidence: {
        websiteId: reading.websiteId,
        websiteName: reading.websiteName,
        periodStart: reading.periodStart,
        periodEnd: reading.periodEnd,
        recordedCounters: keys,
      },
      businessImpact: "high",
      confidence: UMAMI_RULE_THRESHOLDS.zeroRecorded.confidence,
    });
  }
  return drafts;
}

/** One `umami_snapshots` row where `metric = 'stats'`, reduced to the two counters this rule reads. */
export type UmamiStatsWindowReading = WindowedReading & {
  websiteName: string;
  /** `totals.visitors.value`, parsed; null when absent or unreadable. */
  visitors: number | null;
  /** `totals.pageviews.value`, parsed; carried as evidence only, never a separate finding. */
  pageviews: number | null;
};

/**
 * The pooled, site-wide version of the killed per-page `umami_page_traffic_shift`.
 * Judges the whole property's visitor count between two non-overlapping,
 * same-length stored windows, using `confidence.ts` rather than a hand-picked
 * threshold: `countChangeZ`/`confidenceInCountChange` decide whether the move
 * clears ordinary noise at this volume, exactly as `site_clicks_shift` does
 * for Search Console clicks.
 */
export function detectSiteTrafficShift(
  readings: readonly UmamiStatsWindowReading[],
): UmamiObservationDraft[] {
  const drafts: UmamiObservationDraft[] = [];
  for (const group of groupByWebsite(readings).values()) {
    const paired = pairNonOverlappingWindows(group);
    if (!paired) continue;
    const { current, prior } = paired;
    if (prior.visitors === null || current.visitors === null) continue;

    const before = prior.visitors;
    const after = current.visitors;
    if (before < MIN_BASELINE) continue;
    const confidence = confidenceInCountChange(before, after);
    if (confidence.band === "low") continue;

    const direction = after > before ? "rose" : "fell";
    const priorLabel = formatWindowLabel(prior.periodStart, prior.periodEnd);
    const currentLabel = formatWindowLabel(current.periodStart, current.periodEnd);

    const nearZero = after <= UMAMI_RULE_THRESHOLDS.siteTrafficShift.nearZeroAfter;
    const currentLengthMs = Date.parse(current.periodEnd) - Date.parse(current.periodStart);
    const gapMs = Date.parse(current.periodStart) - Date.parse(prior.periodEnd);
    const lapsed =
      Number.isFinite(gapMs) && Number.isFinite(currentLengthMs) && gapMs > currentLengthMs;

    const nearZeroCaveat = nearZero
      ? " A healthy site whose tracking script stopped running would show exactly this same drop, so this could be a real collapse in visitors or the script no longer being on the site; this reading alone cannot tell you which."
      : "";
    const lapsedCaveat = lapsed
      ? " Collection lapsed for a stretch between these two windows, so part of this gap may be a missed reading rather than a change in visitors."
      : "";

    drafts.push({
      rule: "umami_site_traffic_shift",
      target: current.websiteId,
      title: `Visitors to ${current.websiteName} ${direction} between two recent windows`,
      description:
        `Visitors your own analytics counted ${direction} from ${before} to ${after} between ${priorLabel} and ${currentLabel}. ${confidence.reason}` +
        `${nearZeroCaveat}${lapsedCaveat} ` +
        `Visitors is a deduplicated count, which varies less than raw arrivals, so this reading is if anything cautious rather than trigger-happy. ` +
        `These are Umami's cookieless counts of how many people arrived; they do not say why, and they are not Google Analytics numbers.`,
      evidence: {
        websiteId: current.websiteId,
        websiteName: current.websiteName,
        priorVisitors: before,
        currentVisitors: after,
        priorPageviews: prior.pageviews,
        currentPageviews: current.pageviews,
        priorPeriodStart: prior.periodStart,
        priorPeriodEnd: prior.periodEnd,
        currentPeriodStart: current.periodStart,
        currentPeriodEnd: current.periodEnd,
        confidenceReason: confidence.reason,
        collectionLapsed: lapsed,
      },
      businessImpact: after < before ? "high" : "medium",
      confidence: confidence.value,
    });
  }
  return drafts;
}

/** One `umami_snapshots` row where `metric = 'referrers'`. */
export type UmamiReferrerWindowReading = WindowedReading & {
  websiteName: string;
  returnedRowCount: number;
  /** Parsed via {@link parseReferrerRows}; null when the payload did not parse. */
  rows: readonly UmamiReferrerRow[] | null;
};

/**
 * A referrer that carried real volume in the prior window and is absent from
 * a complete current list. Unlike `event_disappeared`, this is behaviour, not
 * wiring, so it is scored with `confidenceInCountChange(before, 0)` rather
 * than a hand-picked constant — the same library call `umami_site_traffic_shift`
 * uses, applied to the one source rather than the pooled total. Never worded
 * as a change in rankings, visibility, or how the site is found: Umami has no
 * search dimension at all, only the site a visit arrived from.
 */
export function detectReferrerSourceStopped(
  readings: readonly UmamiReferrerWindowReading[],
): UmamiObservationDraft[] {
  const drafts: UmamiObservationDraft[] = [];
  const completenessLimit = Math.min(
    UMAMI_RULE_THRESHOLDS.referrer.appSliceLimit,
    UMAMI_RULE_THRESHOLDS.referrer.providerDefaultLimit,
  );

  for (const group of groupByWebsite(readings).values()) {
    const paired = pairNonOverlappingWindows(group);
    if (!paired) continue;
    const { current, prior } = paired;
    if (current.rows === null || prior.rows === null) continue;

    // A site-wide collapse (tracking removed, site down) is one event, not N
    // independent referrer findings; the pooled site-traffic rule answers it.
    if (current.rows.length === 0) continue;
    // The current list may be cut off before it reached every prior source;
    // only a complete current list can say a source is gone rather than
    // pushed off the end of a longer one.
    if (current.returnedRowCount >= completenessLimit) continue;

    const currentLabels = new Set(current.rows.map((row) => row.label));
    const candidates = prior.rows
      .filter(
        (row) =>
          row.label !== "" &&
          row.label !== "(none)" &&
          row.count >= MIN_BASELINE &&
          !currentLabels.has(row.label),
      )
      .sort((a, b) => b.count - a.count);

    const priorLabel = formatWindowLabel(prior.periodStart, prior.periodEnd);
    const currentLabel = formatWindowLabel(current.periodStart, current.periodEnd);

    for (const candidate of candidates.slice(0, UMAMI_RULE_THRESHOLDS.referrer.maxFindingsPerRun)) {
      const confidence = confidenceInCountChange(candidate.count, 0);
      drafts.push({
        rule: "umami_referrer_source_stopped",
        target: `${current.websiteId} :: ${candidate.label}`,
        title: `Visits from ${candidate.label} stopped arriving at ${current.websiteName}`,
        description:
          `Visits arriving from ${candidate.label} stopped: ${candidate.count} in ${priorLabel} and none in ${currentLabel}. ${confidence.reason} ` +
          `This window's list of sources is complete, so this is a recorded zero and not a source pushed off the end of a longer list. ` +
          `Umami records the site a visit came from and nothing more, so this says those visits stopped, not why they stopped or what it means for how you are found.`,
        evidence: {
          websiteId: current.websiteId,
          websiteName: current.websiteName,
          referrer: candidate.label,
          priorCount: candidate.count,
          currentCount: 0,
          priorPeriodStart: prior.periodStart,
          priorPeriodEnd: prior.periodEnd,
          currentPeriodStart: current.periodStart,
          currentPeriodEnd: current.periodEnd,
          confidenceReason: confidence.reason,
        },
        businessImpact: "medium",
        confidence: confidence.value,
      });
    }
  }
  return drafts;
}
