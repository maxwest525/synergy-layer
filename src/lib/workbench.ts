/**
 * One bench, and an honest account of what can actually be worked.
 *
 * The platform had produced 111 findings and drafted a change from 2 of them.
 * The missing screen was never a list of findings -- there are eight of those,
 * one per category -- but a single place that says which findings can move,
 * which are already moving, and which cannot move at all and why.
 *
 * The third group is the point. 109 of those 111 had no governed lane, because
 * every lane replaces copy that already exists and almost none of the findings
 * are that: 47 want a page written, 45 want an investigation, 6 want a
 * competitive answer. A bench that offered a Draft button on all of them would
 * be lying in a new place. This one groups them by the reason they are stuck,
 * in the words the rule already carries (`whyNoFixLane`), so the gap is visible
 * as a gap rather than as an empty queue nobody can explain.
 */

import { type ChangeState, humanState } from "./change-request-state";
import { hasGovernedFixPath, whyNoFixLane } from "./finding-fix-target";

/** One finding, as the bench needs it. */
export type BenchFinding = {
  id: string;
  title: string;
  /** The rule that raised it, or null when the row records none. */
  rule: string | null;
  sourceModule: string | null;
  createdAt: string;
};

/** One change request already drafted from a finding. */
export type BenchChange = {
  id: string;
  recommendationId: string | null;
  title: string;
  state: ChangeState;
  /** Set once the executor has committed to the governed repository. */
  committedSha: string | null;
  /** Set once a rendered page has been proven to carry the approved wording. */
  provenAt: string | null;
  updatedAt: string;
};

/**
 * Where a change has stopped, named as a state of the work rather than of the
 * row. `approved` alone does not say whether the executor has run, and that is
 * exactly the difference between "waiting on the operator" and "waiting on
 * nothing at all" -- four changes sat committed and unproven for a fortnight
 * because the row said `approved` in both cases.
 */
export type StuckAt =
  "waiting_for_approval" | "approved_not_committed" | "committed_not_proven" | "done" | "closed";

export type BenchInFlight = BenchChange & { stuckAt: StuckAt; stuckLabel: string };

/** Findings sharing one reason for having no governed fix. */
export type BlockedGroup = {
  reason: string;
  rules: string[];
  findings: BenchFinding[];
};

export type Bench = {
  /** A governed lane owns the rule, and nothing has been drafted yet. */
  ready: BenchFinding[];
  /** Something has been drafted. Ordered by how far from done it is. */
  inFlight: BenchInFlight[];
  /** No lane owns the rule. Grouped by the reason, largest group first. */
  blocked: BlockedGroup[];
  /** Findings with no rule recorded, which no lane can be looked up for. */
  unattributed: BenchFinding[];
};

export function stuckAtFor(change: BenchChange): StuckAt {
  if (change.state === "rejected" || change.state === "rolled_back") return "closed";
  if (change.state === "verified" || change.provenAt !== null) return "done";
  if (change.state === "proposed") return "waiting_for_approval";
  // `applied` is only reachable through a rendered proof, so a row that says
  // applied and carries no proof timestamp is a row written before that rule
  // existed, not a live change (CODE-7).
  if (change.committedSha === null) return "approved_not_committed";
  return "committed_not_proven";
}

const STUCK_LABEL: Record<StuckAt, string> = {
  waiting_for_approval: "Waiting for you to approve it",
  approved_not_committed: "Approved, and the executor has not committed it yet",
  committed_not_proven: "Committed to the site, and not yet proven live",
  done: "Proven live",
  closed: "Closed",
};

/** How far each state is from done, so the bench leads with what is stuck. */
const STUCK_ORDER: Record<StuckAt, number> = {
  committed_not_proven: 0,
  approved_not_committed: 1,
  waiting_for_approval: 2,
  done: 3,
  closed: 4,
};

export function describeStuck(change: BenchChange): BenchInFlight {
  const stuckAt = stuckAtFor(change);
  return {
    ...change,
    stuckAt,
    // The row's own word is kept alongside the plainer sentence: an operator
    // reading the change page next sees the same state named the same way.
    stuckLabel: `${STUCK_LABEL[stuckAt]} (${humanState(change.state)})`,
  };
}

export function buildBench(input: {
  findings: readonly BenchFinding[];
  changes: readonly BenchChange[];
}): Bench {
  const drafted = new Set(
    input.changes
      .map((change) => change.recommendationId)
      .filter((id): id is string => id !== null),
  );

  const ready: BenchFinding[] = [];
  const unattributed: BenchFinding[] = [];
  const byReason = new Map<string, { rules: Set<string>; findings: BenchFinding[] }>();

  for (const finding of input.findings) {
    if (drafted.has(finding.id)) continue;
    if (finding.rule === null || finding.rule === "") {
      unattributed.push(finding);
      continue;
    }
    if (hasGovernedFixPath(finding.rule)) {
      ready.push(finding);
      continue;
    }
    const reason = whyNoFixLane(finding.rule);
    if (reason === null) {
      // `whyNoFixLane` returns null only for a rule that has a lane, which the
      // branch above already took. Reaching here means the two disagree, and
      // guessing which is right would put a button on a finding nothing can
      // draft. Treated as ready so the disagreement surfaces as a failed draft
      // rather than as a silently hidden finding.
      ready.push(finding);
      continue;
    }
    const group = byReason.get(reason) ?? { rules: new Set<string>(), findings: [] };
    group.rules.add(finding.rule);
    group.findings.push(finding);
    byReason.set(reason, group);
  }

  const blocked: BlockedGroup[] = [...byReason.entries()]
    .map(([reason, group]) => ({
      reason,
      rules: [...group.rules].sort(),
      findings: group.findings,
    }))
    .sort((a, b) => b.findings.length - a.findings.length || a.reason.localeCompare(b.reason));

  const inFlight = input.changes
    .map(describeStuck)
    .sort(
      (a, b) =>
        STUCK_ORDER[a.stuckAt] - STUCK_ORDER[b.stuckAt] || b.updatedAt.localeCompare(a.updatedAt),
    );

  return { ready, inFlight, blocked, unattributed };
}

/**
 * The one number the bench exists to move: how many findings the platform can
 * act on itself, against how many it has raised.
 */
export function benchCoverage(bench: Bench): {
  actionable: number;
  total: number;
  blockedCount: number;
} {
  const blockedCount = bench.blocked.reduce((sum, group) => sum + group.findings.length, 0);
  const actionable = bench.ready.length + bench.inFlight.length;
  return {
    actionable,
    total: actionable + blockedCount + bench.unattributed.length,
    blockedCount,
  };
}
