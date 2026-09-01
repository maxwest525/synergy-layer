import type { NextActionFacts, NextActionRoute } from "./next-actions";
import { TAXONOMY_GROUPS, type TaxonomyGroup, type TaxonomyGroupKey } from "./os-taxonomy";

/**
 * The optimization loop, expressed the same way for every taxonomy group:
 * evidence is stored, a decision is proposed, it is approved, work runs, and
 * the outcome is measured. Each stage carries a real count from stored rows,
 * so the strip shows where the loop actually stops turning.
 */
export type LoopStage = {
  key: string;
  label: string;
  count: number;
  unit: string;
  to: NextActionRoute;
};

export type LoopState = {
  group: TaxonomyGroup;
  stages: LoopStage[];
  /**
   * The stage the loop has genuinely never turned past: the first empty stage
   * with nothing recorded after it. An empty stage with later stages filled is
   * a gap, not a stall - the counts to its right prove the loop reached them.
   */
  stalledStageKey: string | null;
  stallReason: string | null;
  /** Empty stages the loop demonstrably moved past. Real, but not blocking. */
  gapStageKeys: string[];
};

function stall(stages: LoopStage[]): string | null {
  // A stage only blocks the loop if everything after it is also empty.
  // "Proposed: 0" beside "Approved: 5" is not a stall - the five approvals
  // could only exist by passing through the proposal stage.
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i];
    if (!stage || stage.count > 0) continue;
    if (stages.slice(i + 1).every((later) => later.count === 0)) return stage.key;
  }
  return null;
}

function loopFor(group: TaxonomyGroup, facts: NextActionFacts): LoopState {
  const stages = STAGE_BUILDERS[group.key](facts);
  const stalledStageKey = stall(stages);
  const stalled = stages.find((stage) => stage.key === stalledStageKey) ?? null;
  const gapStageKeys = stages
    .filter((stage) => stage.count === 0 && stage.key !== stalledStageKey)
    .map((stage) => stage.key);
  const stalledIsLast = stalled ? stages[stages.length - 1]?.key === stalled.key : false;
  return {
    group,
    stages,
    stalledStageKey,
    stallReason: stalled
      ? stalledIsLast
        ? `Nothing is recorded at "${stalled.label}", so the loop has never completed a full turn.`
        : `Nothing is recorded at "${stalled.label}" or after it, so the loop stops there.`
      : null,
    gapStageKeys,
  };
}

const STAGE_BUILDERS: Record<TaxonomyGroupKey, (facts: NextActionFacts) => LoopStage[]> = {
  decisions: (facts) => [
    {
      key: "evidence",
      label: "Evidence stored",
      count: facts.gsc.snapshots,
      unit: "snapshot",
      to: "/search/tools",
    },
    {
      // Counts change_requests only. Labelled by what it counts, because
      // "Decision proposed: 0" beside "58 recommendations proposed" elsewhere
      // on the page read as the platform contradicting itself.
      key: "proposed",
      label: "Page change proposed",
      count: facts.changes.proposed,
      unit: "waiting",
      to: "/changes",
    },
    {
      key: "approved",
      label: "Approved",
      count: facts.changes.approved,
      unit: "approved",
      to: "/changes",
    },
    {
      key: "executed",
      label: "Run work executed",
      count: facts.changes.executing,
      unit: "in flight",
      to: "/changes",
    },
    {
      key: "measured",
      label: "Outcome measured",
      count: facts.changes.verified,
      unit: "verified",
      to: "/changes",
    },
  ],
  evidence: (facts) => [
    {
      key: "search",
      label: "Search stored",
      count: facts.gsc.snapshots,
      unit: "snapshot",
      to: "/search/tools",
    },
    {
      key: "analytics",
      label: "Analytics stored",
      count: facts.ga4.snapshots,
      unit: "snapshot",
      to: "/ga4",
    },
    {
      key: "speed",
      label: "Speed measured",
      count: facts.pagespeed.snapshots,
      unit: "measurement",
      to: "/measurement/tools",
    },
    {
      key: "candidates",
      label: "Turned into candidates",
      count: facts.keywords.pendingCandidates + facts.keywords.tracked,
      unit: "keyword",
      to: "/keywords",
    },
    {
      key: "proposals",
      label: "Turned into proposals",
      count: facts.changes.total,
      unit: "change",
      to: "/changes",
    },
  ],
  run_work: (facts) => [
    {
      key: "registered",
      label: "Workflows registered",
      count: facts.workflows.registered,
      unit: "workflow",
      to: "/workflows",
    },
    {
      key: "scheduled",
      label: "Scheduled",
      count: facts.workflows.scheduled,
      unit: "schedule",
      to: "/scheduler",
    },
    { key: "ran", label: "Runs recorded", count: facts.runs.total, unit: "run", to: "/workflows" },
    {
      key: "produced",
      label: "Produced evidence",
      count: facts.gsc.snapshots + facts.ga4.snapshots + facts.pagespeed.snapshots,
      unit: "snapshot",
      to: "/search/tools",
    },
    {
      key: "applied",
      label: "Applied a change",
      count: facts.changes.verified + facts.changes.executing,
      unit: "change",
      to: "/changes",
    },
  ],
  system_health: (facts) => [
    {
      key: "catalogued",
      label: "Systems catalogued",
      count: facts.systems.total,
      unit: "system",
      to: "/capabilities/systems",
    },
    {
      key: "configured",
      label: "Credentials recorded",
      count: facts.systems.configuredOnly + facts.systems.proven,
      unit: "system",
      to: "/capabilities/systems",
    },
    {
      key: "proven",
      label: "Proven by a real read",
      count: facts.systems.proven,
      unit: "system",
      to: "/capabilities/systems",
    },
    {
      key: "feeding",
      label: "Feeding evidence",
      count: facts.gsc.snapshots + facts.ga4.snapshots + facts.umami.snapshots,
      unit: "snapshot",
      to: "/search/tools",
    },
    { key: "cost", label: "Spend recorded", count: facts.runs.total, unit: "run", to: "/spend" },
  ],
};

/** One loop per taxonomy group, in the taxonomy's own order. */
export function buildLoopStates(facts: NextActionFacts): LoopState[] {
  return TAXONOMY_GROUPS.map((group) => loopFor(group, facts));
}
