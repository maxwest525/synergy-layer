/**
 * Which graded outcomes deserve an operator's attention.
 *
 * `outcome-verdict.ts` can grade a change a failure, and until now that verdict
 * travelled no further than a coloured label on Site health. Nothing filed it
 * anywhere an operator actually works, so a failed change could sit graded and
 * unread while its rollback verb waited one click away on `/changes/$id`.
 *
 * This module only selects; it invents no threshold and computes no verdict.
 * The failure it forwards is exactly the one `outcome-verdict.ts` produced,
 * reason and all.
 */

import type { GradedOutcome } from "./site-health";

export type FailureAlert = {
  readonly changeId: string;
  readonly title: string;
  readonly targetUrl: string | null;
  /** The window whose reading failed. The longest one, when several did. */
  readonly windowDays: number;
  /** The verdict's own reason, verbatim, naming the numbers it rests on. */
  readonly reason: string;
};

/**
 * One alert per change whose verdict resolved to failure. When more than one
 * window failed, the longest is named: it is the most settled evidence, and one
 * change is one problem however many windows agree about it.
 */
export function failureAlerts(graded: readonly GradedOutcome[]): FailureAlert[] {
  const byChange = new Map<string, GradedOutcome>();
  for (const outcome of graded) {
    if (outcome.verdict !== "failure") continue;
    const seen = byChange.get(outcome.changeId);
    if (!seen || outcome.windowDays > seen.windowDays) byChange.set(outcome.changeId, outcome);
  }
  return [...byChange.values()].map((outcome) => ({
    changeId: outcome.changeId,
    title: outcome.title,
    targetUrl: outcome.targetUrl,
    windowDays: outcome.windowDays,
    reason: outcome.reason,
  }));
}
