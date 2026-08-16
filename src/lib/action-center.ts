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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function titleH1ProposalView(change: {
  state: string;
  proposal_kind?: unknown;
  proposal_payload?: unknown;
}) {
  if (change.proposal_kind !== "title_h1") return null;
  const payload = record(change.proposal_payload);
  const before = record(payload?.["before"]);
  const after = record(payload?.["after"]);
  const draft = record(payload?.["draft"]);
  const evidence = record(payload?.["evidence"]);
  const live = record(evidence?.["live"]);
  const gsc = record(evidence?.["gsc"]);
  const competitors = Array.isArray(evidence?.["competitors"])
    ? evidence["competitors"]
        .map(record)
        .filter((row): row is Record<string, unknown> => row !== null)
    : [];
  const url = text(payload?.["targetUrl"]);
  const currentTitle = text(before?.["title"]);
  const currentH1 = text(before?.["h1"]);
  const proposedTitle = text(after?.["title"]);
  const proposedH1 = text(after?.["h1"]);
  if (!url || !currentTitle || !currentH1 || !proposedTitle || !proposedH1) return null;

  const sourceDates = [
    text(live?.["observedAt"])
      ? { source: "live" as const, observedAt: text(live?.["observedAt"])! }
      : null,
    text(gsc?.["observedAt"])
      ? { source: "gsc" as const, observedAt: text(gsc?.["observedAt"])! }
      : null,
    ...competitors.flatMap((row) => {
      const observedAt = text(row["observedAt"]);
      return observedAt ? [{ source: "dataforseo" as const, observedAt }] : [];
    }),
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  const limitations: string[] = [];
  if (!gsc?.["comparisonPeriod"]) limitations.push("No GSC comparison period is stored.");
  if (!evidence?.["ga4"]) {
    limitations.push("GA4 is not connected for later outcome measurement.");
  }
  if (competitors.some((row) => !text(row["h1"]))) {
    limitations.push("Some competitor pages have no stored H1.");
  }

  return {
    url,
    version: typeof payload?.["versionNumber"] === "number" ? payload["versionNumber"] : 0,
    current: { title: currentTitle, h1: currentH1 },
    proposed: { title: proposedTitle, h1: proposedH1 },
    reason: text(draft?.["rationale"]) ?? "No rationale was stored.",
    expectedMetric: text(draft?.["expectedMetric"]) ?? "not specified",
    confidence: typeof payload?.["confidence"] === "number" ? payload["confidence"] : 0,
    verification: text(draft?.["verification"]) ?? "No verification plan was stored.",
    reversal: text(draft?.["reversal"]) ?? "No reversal plan was stored.",
    sourceDates,
    limitations,
    actions:
      change.state === "proposed"
        ? (["approve", "edit", "regenerate", "ignore"] as const)
        : ([] as const),
  };
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
