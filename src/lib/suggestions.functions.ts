import { createServerFn } from "@tanstack/react-start";

/**
 * Compact propose -> approve -> execute pipeline used by the global
 * Suggestions panel. Every row is stored state; nothing is inferred.
 */

export type PipelineStage = "propose" | "approve" | "execute" | "measure";

export type SuggestionItem = {
  id: string;
  kind: "change" | "suggestion";
  title: string;
  targetUrl: string | null;
  state: string;
  stage: PipelineStage;
  /** Stages already completed, in order. */
  done: PipelineStage[];
  blocked: boolean;
  statusLine: string;
  instruction: string;
  actionLabel: string;
  actionTo: "/approvals" | "/changes/$id" | "/recommendations/$id" | "/measurement";
  actionId: string | null;
  updatedAt: string;
};

export type SuggestionPipelineView = {
  authenticated: boolean;
  items: SuggestionItem[];
  counts: { propose: number; approve: number; execute: number; measure: number };
  fetchedAt: string;
};

const empty: SuggestionPipelineView = {
  authenticated: false,
  items: [],
  counts: { propose: 0, approve: 0, execute: 0, measure: 0 },
  fetchedAt: new Date(0).toISOString(),
};

export const listSuggestionPipeline = createServerFn({ method: "GET" }).handler(
  async (): Promise<SuggestionPipelineView> => {
    const { createRequestClient, resolveTenantId } = await import("./tenant.server");
    const { db, authenticated } = createRequestClient();
    if (!authenticated) return { ...empty, fetchedAt: new Date().toISOString() };
    const tenantId = await resolveTenantId(db);
    if (!tenantId) return { ...empty, authenticated: true, fetchedAt: new Date().toISOString() };

    const [changesResult, recsResult, execsResult] = await Promise.all([
      db
        .from("change_requests")
        .select(
          "id, title, target_url, state, recommendation_id, proposed_at, approved_at, applied_at, rejected_at, rolled_back_at, live_at, published_proof_at, implementation_method",
        )
        .eq("tenant_id", tenantId)
        .order("proposed_at", { ascending: false })
        .limit(50),
      db
        .from("recommendations")
        .select("id, title, state, created_at, source_module")
        .eq("tenant_id", tenantId)
        .in("state", ["draft", "proposed", "under_review", "approved"])
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("change_request_executions")
        .select("change_request_id, kind, status, error, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(300),
    ]);

    const changes = changesResult.data ?? [];
    const recommendations = recsResult.data ?? [];
    const executions = execsResult.data ?? [];

    const linkedRecIds = new Set(
      changes.map((change) => change.recommendation_id).filter((id): id is string => Boolean(id)),
    );

    const items: SuggestionItem[] = [];

    for (const change of changes) {
      const steps = executions.filter((step) => step.change_request_id === change.id);
      const lastStep = steps[steps.length - 1];
      const failedStep = [...steps].reverse().find((step) => step.status === "failed");

      let stage: PipelineStage = "propose";
      let done: PipelineStage[] = [];
      let statusLine = "Waiting on an operator decision";
      let blocked = false;

      if (change.rejected_at) {
        stage = "approve";
        done = ["propose"];
        statusLine = "Rejected, no page was touched";
      } else if (change.rolled_back_at) {
        stage = "execute";
        done = ["propose", "approve"];
        blocked = true;
        statusLine = "Rolled back to the previous revision";
      } else if (change.published_proof_at || change.live_at) {
        stage = "measure";
        done = ["propose", "approve", "execute"];
        statusLine = "Live and verified, measurement window open";
      } else if (change.applied_at) {
        stage = "measure";
        done = ["propose", "approve", "execute"];
        statusLine = "Applied to the site source, waiting on live proof";
      } else if (change.approved_at) {
        stage = "execute";
        done = ["propose", "approve"];
        blocked = Boolean(failedStep);
        statusLine = failedStep
          ? `Deployment step ${failedStep.kind} failed: ${failedStep.error ?? "no reason stored"}`
          : lastStep
            ? `Running ${lastStep.kind}, status ${lastStep.status}`
            : `Approved, ready to run by ${change.implementation_method}`;
      }

      const instruction =
        stage === "propose"
          ? "Approve or reject this change to move it forward"
          : blocked
            ? "Open this change and resolve the failed step"
            : stage === "execute"
              ? "Execute this approved change so it reaches the site"
              : stage === "measure"
                ? "Wait for the measurement window, then read the outcome"
                : "Open the full trail for this change";

      const actionTo =
        stage === "propose" && !change.rejected_at
          ? ("/approvals" as const)
          : stage === "measure" && !blocked
            ? ("/measurement" as const)
            : ("/changes/$id" as const);

      items.push({
        id: change.id,
        kind: "change",
        title: change.title,
        targetUrl: change.target_url,
        state: change.state,
        stage,
        done,
        blocked,
        statusLine,
        instruction,
        actionLabel:
          actionTo === "/approvals"
            ? "Decide now"
            : actionTo === "/measurement"
              ? "See measurement"
              : "Open change",
        actionTo,
        actionId: actionTo === "/changes/$id" ? change.id : null,
        updatedAt:
          change.rolled_back_at ??
          change.published_proof_at ??
          change.applied_at ??
          change.rejected_at ??
          change.approved_at ??
          change.proposed_at,
      });
    }

    for (const rec of recommendations) {
      if (linkedRecIds.has(rec.id)) continue;
      items.push({
        id: rec.id,
        kind: "suggestion",
        title: rec.title,
        targetUrl: null,
        state: rec.state,
        stage: "propose",
        done: [],
        blocked: false,
        statusLine: `Raised by ${rec.source_module}, not yet turned into a page change`,
        instruction: "Turn this suggestion into a concrete page change",
        actionLabel: "Open suggestion",
        actionTo: "/recommendations/$id",
        actionId: rec.id,
        updatedAt: rec.created_at,
      });
    }

    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const counts = { propose: 0, approve: 0, execute: 0, measure: 0 };
    for (const item of items) counts[item.stage] += 1;

    return { authenticated: true, items, counts, fetchedAt: new Date().toISOString() };
  },
);
