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
  /** Who owns this concern, exactly as an operator stored it. */
  ownerName: string | null;
  /** ISO date the operator committed to, or null when nobody set one. */
  targetDate: string | null;
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

/** Ownership tally used for the Coverage strip and the Today instructions. */
export type CoverageOwnership = {
  total: number;
  owned: number;
  unowned: number;
  overdue: number;
  dueSoon: number;
  nextDue: { task: string; targetDate: string } | null;
};

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Ownership is a stored fact, never inferred. A concern with no target date is
 * counted as unowned rather than quietly treated as on time.
 */
export function summarizeOwnership(
  concerns: CoverageConcern[],
  today = new Date(),
): CoverageOwnership {
  const todayIso = isoDay(today);
  const soonIso = isoDay(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));
  let owned = 0;
  let overdue = 0;
  let dueSoon = 0;
  let nextDue: { task: string; targetDate: string } | null = null;

  for (const concern of concerns) {
    if (concern.ownerName && concern.targetDate) owned += 1;
    const due = concern.targetDate;
    if (!due) continue;
    if (concernStatus(concern) === "working") continue;
    if (due < todayIso) overdue += 1;
    else if (due <= soonIso) dueSoon += 1;
    if (!nextDue || due < nextDue.targetDate) nextDue = { task: concern.task, targetDate: due };
  }

  return {
    total: concerns.length,
    owned,
    unowned: concerns.length - owned,
    overdue,
    dueSoon,
    nextDue,
  };
}

/** True when an open concern passed its stored target date. */
export function isOverdue(concern: CoverageConcern, today = new Date()): boolean {
  if (!concern.targetDate) return false;
  if (concernStatus(concern) === "working") return false;
  return concern.targetDate < isoDay(today);
}
