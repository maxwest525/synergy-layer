export type ActionCenterLane =
  "needs_attention" | "pending_approval" | "in_progress" | "scheduled" | "completed" | "fyi";

export type ActionCenterFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type ActionCenterChange = {
  state: string;
  changes: unknown;
  source_commit_sha: string | null;
  published_proof_at: string | null;
};

/**
 * Change requests stay actionable until they are rejected, verified, or rolled
 * back. Stored inbox state is only a fallback because older approvals were
 * incorrectly closed as soon as the operator approved them.
 */
export function actionCenterLane(
  storedLane: string,
  change: ActionCenterChange | null,
): ActionCenterLane {
  if (!change) return isActionCenterLane(storedLane) ? storedLane : "needs_attention";

  if (change.state === "proposed") return "pending_approval";
  if (change.state === "approved" || change.state === "applied") return "in_progress";
  if (["rejected", "verified", "rolled_back"].includes(change.state)) return "completed";
  return isActionCenterLane(storedLane) ? storedLane : "needs_attention";
}

export function actionCenterStage(change: ActionCenterChange): string {
  if (change.state === "proposed") return "Approval requested";
  if (change.state === "approved" && !change.source_commit_sha)
    return "Approved — ready to execute";
  if (change.state === "approved") return "Source committed — publish and check next";
  if (change.state === "applied" && change.published_proof_at)
    return "Proven live — tracking outcome";
  if (change.state === "applied") return "Applied — tracking outcome";
  if (change.state === "verified") return "Outcome verified";
  if (change.state === "rejected") return "Ignored";
  if (change.state === "rolled_back") return "Rolled back";
  return change.state.replaceAll("_", " ");
}

export function actionCenterFieldChanges(value: unknown): ActionCenterFieldChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (
      typeof row["field"] !== "string" ||
      typeof row["before"] !== "string" ||
      typeof row["after"] !== "string"
    ) {
      return [];
    }
    return [
      {
        field: row["field"],
        label: typeof row["label"] === "string" ? row["label"] : row["field"],
        before: row["before"],
        after: row["after"],
      },
    ];
  });
}

function isActionCenterLane(value: string): value is ActionCenterLane {
  return [
    "needs_attention",
    "pending_approval",
    "in_progress",
    "scheduled",
    "completed",
    "fyi",
  ].includes(value);
}
