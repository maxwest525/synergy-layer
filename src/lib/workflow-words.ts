/**
 * Words for a workflow's steps and runs. Lived in workflow-detail.tsx, where a
 * non-component export costs the screen a full reload on hot refresh (CQ-10);
 * nothing about them needs React.
 */

const ACTIVE_RUN_STATES = new Set(["queued", "running", "awaiting_approval"]);

/** The run still moving, if any: queued, running, or waiting on an approval. */
export function findActiveRun<T extends { state: string }>(runs: readonly T[]): T | null {
  return runs.find((run) => ACTIVE_RUN_STATES.has(run.state)) ?? null;
}

/** "collect_snapshots" / "dfs.labs" become readable step names. */
export function humanize(value: string): string {
  const words = value.replaceAll(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const kindLabels: Record<string, string> = {
  capability: "Tool step",
  agent: "Agent step",
  approval: "Approval gate",
  condition: "Condition",
};
