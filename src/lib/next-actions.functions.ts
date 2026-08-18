import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NextActionFacts } from "./next-actions";

/**
 * One tenant-scoped read of the facts the next-action rules are allowed to
 * see. Every field is a count of stored rows: no provider is called, nothing
 * is written, and a failed read never becomes a zero.
 */
export const getNextActionFacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NextActionFacts> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead } = await import("./essentials");
    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const [
      properties,
      gscSnapshots,
      ga4Snapshots,
      ga4Runs,
      psRuns,
      psSnapshots,
      umami,
      trackedKeywords,
      keywordCandidates,
      trackedCompetitors,
      competitorCandidates,
      changes,
      inbox,
      runs,
      workflows,
      schedules,
      recommendations,
      systems,
      concerns,
      concernEvaluations,
      measurementFailures,
    ] = await Promise.all([
      db
        .from("search_console_properties")
        .select("site_url, selected, last_observed_at")
        .eq("tenant_id", tenantId),
      db
        .from("search_console_snapshots")
        .select("kind, period_end_pt")
        .eq("tenant_id", tenantId)
        .order("period_end_pt", { ascending: false })
        .limit(500),
      db
        .from("ga4_snapshots")
        .select("collected_at")
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(200),
      db
        .from("measurement_runs")
        .select("status, error, started_at")
        .eq("tenant_id", tenantId)
        .eq("provider", "ga4")
        .order("started_at", { ascending: false })
        .limit(50),
      db
        .from("measurement_runs")
        .select("status, error, started_at")
        .eq("tenant_id", tenantId)
        .eq("provider", "pagespeed")
        .order("started_at", { ascending: false })
        .limit(200),
      db.from("pagespeed_snapshots").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      db
        .from("umami_snapshots")
        .select("collected_at")
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(50),
      db
        .from("tracked_keywords")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("active", true),
      db
        .from("keyword_candidates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("review_state", "pending"),
      db.from("tracked_competitors").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      db
        .from("competitor_candidates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("review_state", "pending"),
      db
        .from("change_requests")
        .select("id, state, proposed_at")
        .eq("tenant_id", tenantId)
        .order("proposed_at", { ascending: false })
        .limit(200),
      db.from("inbox_items").select("lane").eq("tenant_id", tenantId).limit(200),
      db
        .from("workflow_runs")
        .select("state, error, started_at")
        .eq("tenant_id", tenantId)
        .order("started_at", { ascending: false })
        .limit(200),
      db.from("workflows").select("id", { count: "exact", head: true }),
      db
        .from("schedules")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("enabled", true),
      db.from("recommendations").select("state").eq("tenant_id", tenantId).limit(400),
      db
        .from("tool_systems")
        .select("credential_state, aoos_connection_state, implemented_state, verification_state")
        .eq("tenant_id", tenantId)
        .eq("visible_in_aoos", true),
      db
        .from("essential_concerns")
        .select("id, task, owner_name, target_date")
        .eq("tenant_id", tenantId)
        .is("retired_at", null),
      db
        .from("essential_concern_evaluations")
        .select("concern_id, status, evaluated_at")
        .eq("tenant_id", tenantId)
        .order("evaluated_at", { ascending: false })
        .limit(500),
      db
        .from("measurement_runs")
        .select("provider, status, error, started_at")
        .eq("tenant_id", tenantId)
        .neq("status", "succeeded")
        .order("started_at", { ascending: false })
        .limit(200),
    ]);

    assertRead("Search Console properties", properties);
    assertRead("Search Console snapshots", gscSnapshots);
    assertRead("Analytics snapshots", ga4Snapshots);
    assertRead("Analytics runs", ga4Runs);
    assertRead("PageSpeed runs", psRuns);
    assertRead("PageSpeed snapshots", psSnapshots);
    assertRead("Self hosted traffic snapshots", umami);
    assertRead("Tracked keywords", trackedKeywords);
    assertRead("Keyword candidates", keywordCandidates);
    assertRead("Tracked competitors", trackedCompetitors);
    assertRead("Competitor candidates", competitorCandidates);
    assertRead("Change requests", changes);
    assertRead("Inbox items", inbox);
    assertRead("Workflow runs", runs);
    assertRead("Workflows", workflows);
    assertRead("Schedules", schedules);
    assertRead("Recommendations", recommendations);
    assertRead("Tool systems catalog", systems);
    assertRead("Coverage concerns", concerns);
    assertRead("Coverage evaluations", concernEvaluations);
    assertRead("Measurement runs", measurementFailures);

    const propertyRows = properties.data ?? [];
    const selected = propertyRows.find((row) => row.selected) ?? propertyRows[0] ?? null;
    const snapshotRows = gscSnapshots.data ?? [];
    const totalsDays = new Set(
      snapshotRows.filter((row) => row.kind === "property_totals").map((row) => row.period_end_pt),
    ).size;

    const ga4RunRows = ga4Runs.data ?? [];
    const ga4Failure = ga4RunRows.find((row) => row.status !== "succeeded") ?? null;
    const psRunRows = psRuns.data ?? [];
    const psFailures = psRunRows.filter((row) => row.status !== "succeeded");

    const changeRows = changes.data ?? [];
    const countState = (state: string) => changeRows.filter((row) => row.state === state).length;
    const inboxRows = inbox.data ?? [];
    const runRows = runs.data ?? [];
    const recommendationRows = recommendations.data ?? [];
    const systemRows = systems.data ?? [];

    const proven = systemRows.filter(
      (row) => row.aoos_connection_state === "callable" && row.implemented_state !== "not_implemented",
    ).length;
    const configuredOnly = systemRows.filter(
      (row) =>
        row.aoos_connection_state !== "callable" &&
        (row.credential_state === "configured" || row.credential_state === "encrypted_not_enumerated"),
    ).length;
    const broken = systemRows.filter((row) => row.verification_state === "failed").length;

    const latestConcernStatus = new Map<string, string>();
    for (const row of concernEvaluations.data ?? []) {
      if (!latestConcernStatus.has(row.concern_id)) latestConcernStatus.set(row.concern_id, row.status);
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    const concernRows = concerns.data ?? [];
    let unowned = 0;
    let overdue = 0;
    let nextDue: { task: string; targetDate: string } | null = null;
    for (const row of concernRows) {
      if (!row.owner_name || !row.target_date) unowned += 1;
      if (!row.target_date) continue;
      if (latestConcernStatus.get(row.id) === "working") continue;
      if (row.target_date < todayIso) overdue += 1;
      if (!nextDue || row.target_date < nextDue.targetDate)
        nextDue = { task: row.task, targetDate: row.target_date };
    }
    const measurementRows = measurementFailures.data ?? [];

    return {
      property: selected
        ? { siteUrl: selected.site_url, lastObservedAt: selected.last_observed_at }
        : null,
      gsc: {
        snapshots: snapshotRows.length,
        latestDate: snapshotRows[0]?.period_end_pt ?? null,
        totalsDays,
      },
      ga4: {
        snapshots: (ga4Snapshots.data ?? []).length,
        latestAt: ga4Snapshots.data?.[0]?.collected_at ?? null,
        lastError: ga4Failure?.error ?? null,
        configured: ga4RunRows.length > 0 || (ga4Snapshots.data ?? []).length > 0,
      },
      pagespeed: {
        attempts: psRunRows.length,
        failures: psFailures.length,
        snapshots: psSnapshots.count ?? 0,
        latestError: psFailures[0]?.error ?? null,
      },
      umami: {
        snapshots: (umami.data ?? []).length,
        latestAt: umami.data?.[0]?.collected_at ?? null,
      },
      keywords: {
        tracked: trackedKeywords.count ?? 0,
        pendingCandidates: keywordCandidates.count ?? 0,
      },
      competitors: {
        tracked: trackedCompetitors.count ?? 0,
        pendingCandidates: competitorCandidates.count ?? 0,
      },
      changes: {
        total: changeRows.length,
        proposed: countState("proposed"),
        approved: countState("approved"),
        executing: countState("applied"),
        verified: countState("verified"),
        latestProposedId: changeRows.find((row) => row.state === "proposed")?.id ?? null,
      },
      inbox: {
        pendingApproval: inboxRows.filter((row) => row.lane === "pending_approval").length,
        needsAttention: inboxRows.filter((row) => row.lane === "needs_attention").length,
      },
      runs: {
        total: runRows.length,
        failed: runRows.filter((row) => row.state === "failed").length,
        queued: runRows.filter((row) => row.state === "queued").length,
        awaitingApproval: runRows.filter((row) => row.state === "awaiting_approval").length,
        latestFailure: runRows.find((row) => row.state === "failed")?.error ?? null,
      },
      workflows: { registered: workflows.count ?? 0, scheduled: schedules.count ?? 0 },
      recommendations: {
        proposed: recommendationRows.filter((row) => row.state === "proposed").length,
        observed: recommendationRows.filter((row) => row.state === "observed").length,
      },
      systems: { total: systemRows.length, proven, configuredOnly, broken },
      coverage: { total: concernRows.length, unowned, overdue, nextDue },
      measurement: {
        failedRuns: measurementRows.length,
        latestProvider: measurementRows[0]?.provider ?? null,
        latestError: measurementRows[0]?.error ?? null,
      },
    };
  });

/**
 * Optional agent re-ranking of the deterministic actions. The agent may only
 * choose among ids that were generated from stored evidence.
 */
export const prioritizeNextActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { actions: import("./next-actions").NextAction[] }) => data)
  .handler(async ({ data }) => {
    const { prioritizeActions } = await import("./next-actions.server");
    return prioritizeActions(data.actions);
  });
