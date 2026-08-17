import type { Tone } from "@/components/os/primitives";

/**
 * The four-word coverage vocabulary. Every word is derived from stored
 * evidence: a concern is never "working" because a credential exists.
 */
export type CoverageStatus = "working" | "unproven" | "broken" | "cannot_measure" | "not_evaluated";

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  working: "Working",
  unproven: "Set up, never proven",
  broken: "Broken",
  cannot_measure: "Cannot measure yet",
  not_evaluated: "Not evaluated yet",
};

export const COVERAGE_TONE: Record<CoverageStatus, Tone> = {
  working: "positive",
  unproven: "warning",
  broken: "danger",
  cannot_measure: "neutral",
  not_evaluated: "neutral",
};


export type CoverageEvaluation = {
  status: Exclude<CoverageStatus, "not_evaluated">;
  summary: string;
  limitation: string | null;
  evaluatedAt: string;
};

export type CoverageConcern = {
  id: string;
  key: string;
  phase: string;
  task: string;
  description: string;
  priority: number;
  origin: string;
  evidenceSource: string | null;
  latest: CoverageEvaluation | null;
};

/** A concern with no stored evaluation is honestly unknown, never "working". */
export function concernStatus(concern: CoverageConcern): CoverageStatus {
  return concern.latest?.status ?? "not_evaluated";
}

export type CoveragePhase = {
  phase: string;
  concerns: CoverageConcern[];
  counts: Record<CoverageStatus, number>;
};

function emptyCounts(): Record<CoverageStatus, number> {
  return { working: 0, unproven: 0, broken: 0, cannot_measure: 0, not_evaluated: 0 };
}

/** Groups concerns by framework phase, preserving the stored order. */
export function groupByPhase(concerns: CoverageConcern[]): CoveragePhase[] {
  const phases: CoveragePhase[] = [];
  const index = new Map<string, CoveragePhase>();
  for (const concern of concerns) {
    let bucket = index.get(concern.phase);
    if (!bucket) {
      bucket = { phase: concern.phase, concerns: [], counts: emptyCounts() };
      index.set(concern.phase, bucket);
      phases.push(bucket);
    }
    bucket.concerns.push(concern);
    bucket.counts[concernStatus(concern)] += 1;
  }
  return phases;
}

/** Whole-workspace tally used for the Coverage summary strip. */
export function summarizeCoverage(concerns: CoverageConcern[]): Record<CoverageStatus, number> {
  const counts = emptyCounts();
  for (const concern of concerns) counts[concernStatus(concern)] += 1;
  return counts;
}
