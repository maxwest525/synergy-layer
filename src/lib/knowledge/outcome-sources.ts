import { createHash } from "node:crypto";

import type { GradedOutcome } from "../site-health";
import type { KnowledgeSourceInput } from "./runtime.server";

/**
 * Composes the outcome-history knowledge source: what this system changed,
 * and what actually happened, written for retrieval.
 *
 * The measurement pipeline already grades every stored reading
 * (`site-health.ts :: gradeOutcomes`), and `SOURCE_ROLES` already names
 * `knowledge` a devils_advocate source — but nothing ever wrote outcomes
 * back into the governed store, so proposal drafting retrieves playbooks
 * while staying blind to this site's own history. This module closes that
 * loop as one governed source, versioned and content-addressed like every
 * other, so an unchanged history is deduplicated instead of re-embedded.
 *
 * Only concluded verdicts are remembered. A reading graded `not_yet`,
 * `too_early` or `unmeasurable`, or one the grader refused to judge at all,
 * is not an outcome — writing it into retrieval would let a proposal cite a
 * verdict that never existed, which is the exact fabrication the grader
 * refuses to produce.
 */

/** The verdicts that are history rather than status. */
const CONCLUDED = new Set(["success", "neutral", "failure"]);

export const OUTCOME_MEMORY_STABLE_KEY = "outcome-history";

type ConcludedOutcome = GradedOutcome & { verdict: "success" | "neutral" | "failure" };

function isConcluded(outcome: GradedOutcome): outcome is ConcludedOutcome {
  return outcome.verdict !== null && CONCLUDED.has(outcome.verdict);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Deterministic order: page, then change, then window — never insertion order. */
function compare(a: ConcludedOutcome, b: ConcludedOutcome): number {
  return (
    (a.targetUrl ?? "").localeCompare(b.targetUrl ?? "") ||
    a.changeId.localeCompare(b.changeId) ||
    a.windowDays - b.windowDays
  );
}

/**
 * The outcome-history source, or null when no reading has concluded — an
 * empty history is stated by absence, never ingested as an empty document.
 */
export function composeOutcomeMemorySource(
  graded: readonly GradedOutcome[],
): KnowledgeSourceInput | null {
  const concluded = graded.filter(isConcluded).sort(compare);
  if (concluded.length === 0) return null;

  const byChange = new Map<string, ConcludedOutcome[]>();
  for (const outcome of concluded) {
    const group = byChange.get(outcome.changeId) ?? [];
    group.push(outcome);
    byChange.set(outcome.changeId, group);
  }

  const sections = [...byChange.values()].map((group) => {
    const head = group[0] as ConcludedOutcome;
    const lines = group.map(
      (outcome) => `- ${outcome.windowDays}-day window: ${outcome.verdict}. ${outcome.reason}`,
    );
    const where = head.targetUrl === null ? "" : `: ${head.targetUrl}`;
    return `## ${head.title}${where}\n\n${lines.join("\n")}`;
  });

  const content = [
    "# Outcome history",
    "",
    "What this system changed on this site, and what the stored measurements " +
      "concluded. Guidance for drafting, in the devils_advocate role: the " +
      "evidence for any new claim remains the live page and the stored " +
      "provider rows, never this summary.",
    "",
    ...sections,
  ].join("\n");

  return {
    stableKey: OUTCOME_MEMORY_STABLE_KEY,
    title: "Outcome history",
    description:
      "Concluded verdicts from this site's own applied changes, graded by the measurement pipeline.",
    sourceType: "research",
    sourceRef: "aoos://outcomes/change-measurements",
    versionLabel: `outcomes-${concluded.length}-${sha256(content).slice(0, 8)}`,
    content,
    metadata: {
      concludedReadings: concluded.length,
      changes: byChange.size,
    },
  };
}
