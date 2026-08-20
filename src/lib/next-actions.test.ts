import { describe, expect, it } from "vitest";

import { buildLoopStates } from "./loop-state";
import { buildMissingReasons, buildNextActions, type NextActionFacts } from "./next-actions";

const empty: NextActionFacts = {
  property: null,
  gsc: { snapshots: 0, latestDate: null, totalsDays: 0 },
  ga4: { snapshots: 0, latestAt: null, lastError: null, configured: false },
  pagespeed: { attempts: 0, failures: 0, snapshots: 0, latestError: null },
  umami: { snapshots: 0, latestAt: null },
  keywords: { tracked: 0, pendingCandidates: 0 },
  competitors: { tracked: 0, pendingCandidates: 0 },
  changes: {
    total: 0,
    proposed: 0,
    approved: 0,
    executing: 0,
    verified: 0,
    latestProposedId: null,
  },
  inbox: { pendingApproval: 0, needsAttention: 0 },
  runs: { total: 0, failed: 0, queued: 0, awaitingApproval: 0, latestFailure: null },
  workflows: { registered: 0, scheduled: 0 },
  recommendations: { proposed: 0, observed: 0 },
  systems: { total: 0, proven: 0, configuredOnly: 0, broken: 0 },
  coverage: { total: 0, unowned: 0, overdue: 0, nextDue: null },
  measurement: { failedRuns: 0, latestProvider: null, latestError: null },
};

describe("next actions", () => {
  it("instructs the operator to clear overdue concerns before assigning owners", () => {
    const actions = buildNextActions({
      ...empty,
      coverage: {
        total: 54,
        unowned: 40,
        overdue: 3,
        nextDue: { task: "Fix indexing", targetDate: "2026-08-01" },
      },
    });
    const overdue = actions.findIndex((action) => action.id === "coverage-overdue");
    const unowned = actions.findIndex((action) => action.id === "coverage-unowned");
    expect(overdue).toBeGreaterThanOrEqual(0);
    expect(overdue).toBeLessThan(unowned);
  });

  it("surfaces a failed measurement run as a retry instruction", () => {
    const actions = buildNextActions({
      ...empty,
      measurement: { failedRuns: 13, latestProvider: "pagespeed", latestError: "Quota exceeded" },
    });
    expect(actions.some((action) => action.id === "run-measurement-failures")).toBe(true);
  });

  it("ranks a broken connection above optional reads", () => {
    const actions = buildNextActions({
      ...empty,
      systems: { total: 4, proven: 1, configuredOnly: 2, broken: 1 },
    });
    expect(actions[0]?.id).toBe("health-broken");
  });

  it("ranks a waiting decision above evidence depth", () => {
    const actions = buildNextActions({
      ...empty,
      gsc: { snapshots: 40, latestDate: "2026-08-16", totalsDays: 10 },
      changes: { ...empty.changes, total: 3, proposed: 2 },
    });
    expect(actions[0]?.id).toBe("decide-page-changes");
  });

  it("explains an empty keyword list instead of showing zero", () => {
    const reasons = buildMissingReasons(empty);
    expect(reasons.some((reason) => reason.id === "missing-keywords")).toBe(true);
  });

  it("marks each loop stalled at its first empty stage", () => {
    const loops = buildLoopStates(empty);
    expect(loops).toHaveLength(4);
    expect(loops.every((loop) => loop.stalledStageKey !== null)).toBe(true);
    expect(loops[0]?.stalledStageKey).toBe("evidence");
  });
});
