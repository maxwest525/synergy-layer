/**
 * Which other changes to the same page are still in flight.
 *
 * A page change is measured against the page's own Search Console rows over
 * fixed windows after it goes live (OUTCOME_MEASUREMENT.md). Two changes to one
 * page inside the same window share one set of rows, so neither outcome can be
 * attributed on its own. The queue used to let that happen silently: on
 * 2026-09-01 one page carried two approved title changes and another had a
 * second change approved while the first was still inside its 28-day window,
 * and the operator learned it by asking (BACKLOG.md CODE-31).
 *
 * This module decides, from stored rows only, whether a sibling is in flight.
 * The database enforces the same rule inside `transition_change_request`, so
 * an approval that ignores it cannot be issued from anywhere; this copy exists
 * so the page can say it before the click rather than after.
 *
 * Stated assumption: "in flight" means approved and not yet live, or live with
 * at least one measurement window whose rows are not yet readable. A change
 * that is verified, rolled back, rejected, or still proposed is not in flight.
 * A proposed sibling is a queue question (CODE-32), not a measurement one.
 */

export type SiblingChange = {
  id: string;
  title: string;
  state: string;
  target_url: string;
  approved_at: string | null;
  applied_at: string | null;
};

export type MeasurementWindowRef = {
  change_request_id: string;
  /** Pacific calendar date after which the window's rows are finalized. */
  available_after_pt: string;
};

export type InFlightSibling = {
  id: string;
  title: string;
  state: "approved" | "applied";
  /** When the sibling entered its current state, as stored. */
  since: string | null;
  /** Last Pacific date a measurement window is still waiting on; null when approved. */
  measurementReadableAfter: string | null;
  /** Plain operator words, used verbatim next to the sibling's title. */
  reason: string;
};

export function findInFlightSiblings(input: {
  /** The change being decided, left out of the answer; absent when nothing is being decided. */
  candidateId?: string;
  targetUrl: string;
  siblings: SiblingChange[];
  windows: MeasurementWindowRef[];
  /** Today's Pacific calendar date, YYYY-MM-DD. */
  todayPt: string;
}): InFlightSibling[] {
  const latestWindow = new Map<string, string>();
  for (const window of input.windows) {
    const current = latestWindow.get(window.change_request_id);
    if (!current || window.available_after_pt > current) {
      latestWindow.set(window.change_request_id, window.available_after_pt);
    }
  }

  const found: InFlightSibling[] = [];
  for (const sibling of input.siblings) {
    if (sibling.id === input.candidateId) continue;
    if (sibling.target_url !== input.targetUrl) continue;
    if (sibling.state === "approved") {
      found.push({
        id: sibling.id,
        title: sibling.title,
        state: "approved",
        since: sibling.approved_at,
        measurementReadableAfter: null,
        reason: "approved and waiting to go live",
      });
      continue;
    }
    if (sibling.state === "applied") {
      const readableAfter = latestWindow.get(sibling.id);
      if (readableAfter && readableAfter > input.todayPt) {
        found.push({
          id: sibling.id,
          title: sibling.title,
          state: "applied",
          since: sibling.applied_at,
          measurementReadableAfter: readableAfter,
          reason: `live and still inside its measurement window until ${readableAfter}`,
        });
      }
    }
  }

  return found.sort((a, b) => (b.since ?? "").localeCompare(a.since ?? ""));
}

/**
 * Pages the nightly proposal job must leave alone: one where a change is
 * waiting on a decision (proposed), or where one is in flight by the rule
 * above. Rejected, rolled back, verified and fully measured changes leave the
 * page open to a new proposal. The job used to exclude any page that had ever
 * carried a change, so one rejection silenced a page for good (CODE-73).
 */
export function pagesWithAnOpenChange(input: {
  changes: SiblingChange[];
  windows: MeasurementWindowRef[];
  /** Today's Pacific calendar date, YYYY-MM-DD. */
  todayPt: string;
}): string[] {
  const open = new Set<string>();
  for (const change of input.changes) {
    if (change.state === "proposed") open.add(change.target_url);
  }
  for (const targetUrl of new Set(input.changes.map((change) => change.target_url))) {
    if (open.has(targetUrl)) continue;
    const inFlight = findInFlightSiblings({
      targetUrl,
      siblings: input.changes,
      windows: input.windows,
      todayPt: input.todayPt,
    });
    if (inFlight.length > 0) open.add(targetUrl);
  }
  return [...open];
}

/** The sentence the approval control carries when a sibling is in flight. */
export const IN_FLIGHT_CONSEQUENCE =
  "Approving now means both changes are measured together, and neither outcome can be attributed on its own. Rejecting this one, or waiting until the earlier change has been measured, keeps the outcomes separate.";
