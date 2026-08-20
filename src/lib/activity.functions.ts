import { createServerFn } from "@tanstack/react-start";

/**
 * End to end activity feed: every suggestion stitched to the change it became,
 * the workflow runs that touched it, and the deployment and measurement events
 * that followed. Every entry is a stored row; nothing is inferred.
 */

export type ActivityStage = "suggested" | "decided" | "run" | "deployed" | "measured";

export type ActivityEvent = {
  id: string;
  stage: ActivityStage;
  at: string;
  title: string;
  detail: string;
  state: string;
  linkTo: "/recommendations/$id" | "/changes/$id" | "/workflows/$id" | "/seo-runs/$id" | null;
  linkId: string | null;
  externalUrl: string | null;
};

export type ActivityThread = {
  id: string;
  title: string;
  targetUrl: string;
  state: string;
  startedAt: string;
  lastEventAt: string;
  suggestionId: string | null;
  suggestionTitle: string | null;
  instruction: string;
  actionLabel: string;
  actionTo: "/approvals" | "/changes/$id" | "/measurement";
  events: ActivityEvent[];
};

export type ActivityFeedView = {
  authenticated: boolean;
  threads: ActivityThread[];
  orphanSuggestions: { id: string; title: string; state: string; createdAt: string }[];
};

const empty: ActivityFeedView = { authenticated: false, threads: [], orphanSuggestions: [] };

function pick(record: unknown, key: string): string | null {
  if (!record || typeof record !== "object") return null;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export const listActivityFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActivityFeedView> => {
    const { createRequestClient, resolveTenantId } = await import("./tenant.server");
    const { db, authenticated } = createRequestClient();
    if (!authenticated) return empty;
    const tenantId = await resolveTenantId(db);
    if (!tenantId) return { ...empty, authenticated: true };

    const [changesResult, recsResult, execsResult, cyclesResult, seoRunsResult, runsResult] =
      await Promise.all([
        db
          .from("change_requests")
          .select(
            "id, title, target_url, state, proposal_type, recommendation_id, proposed_at, approved_at, applied_at, rejected_at, rolled_back_at, live_at, published_proof_at, implementation_method, source_commit_url, source_commit_sha, revision_count, applied_notes, rollback_notes",
          )
          .eq("tenant_id", tenantId)
          .order("proposed_at", { ascending: false })
          .limit(60),
        db
          .from("recommendations")
          .select("id, title, state, created_at, approved_at, source_module")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(80),
        db
          .from("change_request_executions")
          .select("id, change_request_id, kind, status, error, commit_url, commit_sha, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .limit(300),
        db
          .from("change_measurement_cycles")
          .select("id, change_request_id, approved_at, baseline_frozen_at, live_at, target_url")
          .eq("tenant_id", tenantId)
          .limit(200),
        db
          .from("seo_runs")
          .select("id, change_request_id, state, change_type, target_url, created_at, completed_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .limit(200),
        db
          .from("workflow_runs")
          .select("id, workflow_id, state, trigger_source, context, created_at, finished_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    const changes = changesResult.data ?? [];
    const recommendations = recsResult.data ?? [];
    const executions = execsResult.data ?? [];
    const cycles = cyclesResult.data ?? [];
    const seoRuns = seoRunsResult.data ?? [];
    const workflowRuns = runsResult.data ?? [];

    const windowsByCycle = new Map<string, { availableAfter: string; days: number }[]>();
    if (cycles.length > 0) {
      const { data: windows } = await db
        .from("change_measurement_windows")
        .select("cycle_id, window_days, available_after_pt")
        .eq("tenant_id", tenantId)
        .in(
          "cycle_id",
          cycles.map((cycle) => cycle.id),
        );
      for (const row of windows ?? []) {
        const list = windowsByCycle.get(row.cycle_id) ?? [];
        list.push({ availableAfter: row.available_after_pt, days: row.window_days });
        windowsByCycle.set(row.cycle_id, list);
      }
    }

    const recById = new Map(recommendations.map((rec) => [rec.id, rec]));
    const linkedRecIds = new Set<string>();

    const threads: ActivityThread[] = changes.map((change) => {
      const events: ActivityEvent[] = [];
      const rec = change.recommendation_id ? recById.get(change.recommendation_id) : undefined;
      if (rec) {
        linkedRecIds.add(rec.id);
        events.push({
          id: `rec-${rec.id}`,
          stage: "suggested",
          at: rec.created_at,
          title: `Suggested: ${rec.title}`,
          detail: `Raised by ${rec.source_module}`,
          state: rec.state,
          linkTo: "/recommendations/$id",
          linkId: rec.id,
          externalUrl: null,
        });
      }

      events.push({
        id: `proposed-${change.id}`,
        stage: "suggested",
        at: change.proposed_at,
        title: "Change proposed",
        detail: `${change.proposal_type} on ${change.target_url ?? "an unset target"}${
          change.revision_count > 0 ? ` after ${change.revision_count} revision(s)` : ""
        }`,
        state: "proposed",
        linkTo: "/changes/$id",
        linkId: change.id,
        externalUrl: null,
      });

      if (change.approved_at) {
        events.push({
          id: `approved-${change.id}`,
          stage: "decided",
          at: change.approved_at,
          title: "Approved by an operator",
          detail: `Will be applied by ${change.implementation_method}`,
          state: "approved",
          linkTo: "/changes/$id",
          linkId: change.id,
          externalUrl: null,
        });
      }
      if (change.rejected_at) {
        events.push({
          id: `rejected-${change.id}`,
          stage: "decided",
          at: change.rejected_at,
          title: "Rejected by an operator",
          detail: "No page was touched",
          state: "rejected",
          linkTo: "/changes/$id",
          linkId: change.id,
          externalUrl: null,
        });
      }

      for (const run of seoRuns) {
        if (run.change_request_id !== change.id) continue;
        events.push({
          id: `seorun-${run.id}`,
          stage: "run",
          at: run.completed_at ?? run.created_at,
          title: `SEO run ${run.state}`,
          detail: `${run.change_type} on ${run.target_url}`,
          state: run.state,
          linkTo: "/seo-runs/$id",
          linkId: run.id,
          externalUrl: null,
        });
      }
      for (const run of workflowRuns) {
        const linkedChange = pick(run.context, "change_request_id");
        if (linkedChange !== change.id) continue;
        events.push({
          id: `wfrun-${run.id}`,
          stage: "run",
          at: run.finished_at ?? run.created_at,
          title: `Workflow run ${run.state}`,
          detail: `Triggered by ${run.trigger_source}`,
          state: run.state,
          linkTo: "/workflows/$id",
          linkId: run.workflow_id,
          externalUrl: null,
        });
      }

      for (const execution of executions) {
        if (execution.change_request_id !== change.id) continue;
        events.push({
          id: `exec-${execution.id}`,
          stage: "deployed",
          at: execution.created_at,
          title: `Deployment step: ${execution.kind}`,
          detail: execution.error ?? execution.commit_sha ?? `Status ${execution.status}`,
          state: execution.status,
          linkTo: "/changes/$id",
          linkId: change.id,
          externalUrl: execution.commit_url,
        });
      }

      if (change.applied_at) {
        events.push({
          id: `applied-${change.id}`,
          stage: "deployed",
          at: change.applied_at,
          title: "Applied to the site source",
          detail: change.applied_notes ?? `Applied by ${change.implementation_method}`,
          state: "applied",
          linkTo: "/changes/$id",
          linkId: change.id,
          externalUrl: change.source_commit_url,
        });
      }
      if (change.published_proof_at) {
        events.push({
          id: `published-${change.id}`,
          stage: "deployed",
          at: change.published_proof_at,
          title: "Verified live on the published page",
          detail: "Rendered proof stored",
          state: "verified",
          linkTo: "/changes/$id",
          linkId: change.id,
          externalUrl: null,
        });
      }
      if (change.rolled_back_at) {
        events.push({
          id: `rolledback-${change.id}`,
          stage: "deployed",
          at: change.rolled_back_at,
          title: "Rolled back",
          detail: change.rollback_notes ?? "Reverted to the previous revision",
          state: "rolled_back",
          linkTo: "/changes/$id",
          linkId: change.id,
          externalUrl: null,
        });
      }

      for (const cycle of cycles) {
        if (cycle.change_request_id !== change.id) continue;
        const windows = windowsByCycle.get(cycle.id) ?? [];
        const next = [...windows].sort((a, b) =>
          a.availableAfter.localeCompare(b.availableAfter),
        )[0];
        events.push({
          id: `cycle-${cycle.id}`,
          stage: "measured",
          at: cycle.live_at ?? cycle.baseline_frozen_at,
          title: "Measurement cycle open",
          detail: next
            ? next.days > 0
              ? `First ${next.days} day window reads on ${next.availableAfter}`
              : `Baseline window reads on ${next.availableAfter}`
            : "Baseline frozen, no window scheduled yet",
          state: "measuring",
          linkTo: null,
          linkId: null,
          externalUrl: null,
        });
      }

      events.sort((a, b) => a.at.localeCompare(b.at));
      const lastEventAt = events.length > 0 ? events[events.length - 1]!.at : change.proposed_at;

      const instruction =
        change.state === "proposed"
          ? "Approve or reject this change to move it forward"
          : change.state === "approved"
            ? "Execute this approved change so it reaches the site"
            : change.state === "applied"
              ? "Wait for the measurement window, then read the outcome"
              : "Review the full trail for this change";
      const actionTo =
        change.state === "proposed"
          ? ("/approvals" as const)
          : change.state === "applied"
            ? ("/measurement" as const)
            : ("/changes/$id" as const);
      const actionLabel =
        change.state === "proposed"
          ? "Decide now"
          : change.state === "applied"
            ? "See measurement"
            : "Open change";

      return {
        id: change.id,
        title: change.title,
        targetUrl: change.target_url ?? "Not set",
        state: change.state,
        startedAt: rec?.created_at ?? change.proposed_at,
        lastEventAt,
        suggestionId: rec?.id ?? null,
        suggestionTitle: rec?.title ?? null,
        instruction,
        actionLabel,
        actionTo,
        events,
      };
    });

    threads.sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));

    const orphanSuggestions = recommendations
      .filter((rec) => !linkedRecIds.has(rec.id))
      .slice(0, 25)
      .map((rec) => ({
        id: rec.id,
        title: rec.title,
        state: rec.state,
        createdAt: rec.created_at,
      }));

    return { authenticated: true, threads, orphanSuggestions };
  },
);
