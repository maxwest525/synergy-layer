export type ActionCenterLane =
  "needs_attention" | "pending_approval" | "in_progress" | "scheduled" | "completed" | "fyi";

export const ACTION_CENTER_PRESENTATION_LANES = [
  {
    key: "pending_approval",
    label: "Decisions waiting on you",
    hint: "Nothing here happens until you approve it.",
  },
  {
    key: "in_progress",
    label: "Approved and in flight",
    hint: "You said yes. These are still being applied or proven live.",
  },
  {
    key: "needs_attention",
    label: "Needs a look",
    hint: "Drifting or blocked work that is not yet a decision.",
  },
] as const satisfies ReadonlyArray<{
  key: ActionCenterLane;
  label: string;
  hint: string;
}>;

/**
 * Work that is live and sitting inside its measurement cycle. Nothing can be
 * decided about it until the window closes, so it is shown as something to
 * watch rather than something to do.
 */
export const ACTION_CENTER_MEASUREMENT_LANE = {
  key: "fyi",
  label: "In measurement",
  hint: "Live and being measured. Nothing is asked of you until the window closes.",
} as const satisfies { key: ActionCenterLane; label: string; hint: string };

/**
 * A failed observation is a system health problem, not a marketing decision.
 * It is shown in its own strip so the decision lanes stay decisions.
 */
export function isSystemFailure(item: {
  metadata: unknown;
  changeRequest: unknown | null;
}): boolean {
  if (item.changeRequest) return false;
  if (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)) {
    return false;
  }
  return (item.metadata as Record<string, unknown>)["category"] === "failure";
}

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
 * incorrectly closed as soon as the operator approved them. An applied change
 * is already inside its measurement cycle, so it becomes something to watch
 * rather than an action.
 */
export function actionCenterLane(
  storedLane: string,
  change: ActionCenterChange | null,
): ActionCenterLane {
  if (!change) return isActionCenterLane(storedLane) ? storedLane : "needs_attention";

  if (change.state === "proposed") return "pending_approval";
  if (change.state === "approved") return "in_progress";
  if (change.state === "applied") return "fyi";
  if (["rejected", "verified", "rolled_back"].includes(change.state)) return "completed";

  return isActionCenterLane(storedLane) ? storedLane : "needs_attention";
}

export function actionCenterStage(change: ActionCenterChange): string {
  if (change.state === "proposed") return "Approval requested";
  if (change.state === "approved" && !change.source_commit_sha) return "Approved, ready to execute";
  if (change.state === "approved") return "Source committed, publish and check next";
  if (change.state === "applied" && change.published_proof_at)
    return "Proven live, tracking outcome";
  if (change.state === "applied") return "Applied, tracking outcome";
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

export type ActionCenterScopedItem = {
  resolved_at: string | null;
  lane: string;
  subject_kind: string | null;
  metadata: unknown;
  changeRequest: ActionCenterChange | null;
};

/**
 * The Action Center is an action surface, not a feed. It contains only active
 * executable change requests and failures explicitly classified by producers.
 */
export function isActionCenterItem(item: ActionCenterScopedItem): boolean {
  if (item.resolved_at !== null) return false;

  if (item.subject_kind === "change_request") {
    return Boolean(
      item.changeRequest && ["proposed", "approved", "applied"].includes(item.changeRequest.state),
    );
  }

  if (item.lane !== "needs_attention") return false;
  if (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)) {
    return false;
  }
  return (item.metadata as Record<string, unknown>)["category"] === "failure";
}
