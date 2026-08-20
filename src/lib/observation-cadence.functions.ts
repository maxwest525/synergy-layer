import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  OBSERVATION_SOURCES,
  cadenceSource,
  deriveCadenceStatus,
  type CadenceFacts,
  type CadenceSourceKey,
  type CadenceStatus,
} from "./observation-cadence";

export type ObservationCadenceState = {
  isOperator: boolean;
  cadences: CadenceStatus[];
};

type RunRow = {
  status: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
};

type ScheduleRow = {
  key: string;
  enabled: boolean;
  cron: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_duration_ms: number | null;
  last_state: string | null;
};

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One tenant-scoped read of every observation source and its cadence row. */
export const getObservationCadences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ObservationCadenceState> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const [roles, schedules, runs, gsc, ga4, umami, pagespeed] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase
        .from("schedules")
        .select("key, enabled, cron, next_run_at, last_run_at, last_duration_ms, last_state")
        .eq("tenant_id", tenantId)
        .in(
          "key",
          OBSERVATION_SOURCES.map((source) => source.scheduleKey),
        ),
      context.supabase
        .from("measurement_runs")
        .select("provider, status, error, started_at, finished_at, duration_ms")
        .eq("tenant_id", tenantId)
        .order("started_at", { ascending: false })
        .limit(200),
      context.supabase
        .from("search_console_snapshots")
        .select("collected_at, returned_row_count", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("ga4_snapshots")
        .select("collected_at, metrics", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("umami_snapshots")
        .select("collected_at, returned_row_count", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("pagespeed_snapshots")
        .select("collected_at", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(1),
    ]);

    for (const [label, result] of [
      ["roles", roles],
      ["observation schedules", schedules],
      ["measurement runs", runs],
      ["Search Console snapshots", gsc],
      ["GA4 snapshots", ga4],
      ["Umami snapshots", umami],
      ["PageSpeed snapshots", pagespeed],
    ] as const) {
      if (result.error) throw new Error(`Could not read ${label}: ${result.error.message}`);
    }

    const scheduleByKey = new Map<string, ScheduleRow>(
      ((schedules.data ?? []) as ScheduleRow[]).map((row) => [row.key, row]),
    );
    const runRows = (runs.data ?? []) as (RunRow & { provider: string })[];

    const ga4Metrics = (ga4.data?.[0]?.metrics ?? null) as Record<string, unknown> | null;
    const stored: Record<
      CadenceSourceKey,
      { count: number; at: string | null; rows: number | null }
    > = {
      gsc: {
        count: gsc.count ?? 0,
        at: gsc.data?.[0]?.collected_at ?? null,
        rows: numberFrom(gsc.data?.[0]?.returned_row_count),
      },
      ga4: {
        count: ga4.count ?? 0,
        at: ga4.data?.[0]?.collected_at ?? null,
        rows: numberFrom(ga4Metrics?.["rowCount"]),
      },
      umami: {
        count: umami.count ?? 0,
        at: umami.data?.[0]?.collected_at ?? null,
        rows: numberFrom(umami.data?.[0]?.returned_row_count),
      },
      pagespeed: {
        count: pagespeed.count ?? 0,
        at: pagespeed.data?.[0]?.collected_at ?? null,
        rows: pagespeed.count ? 1 : null,
      },
    };

    const cadences = OBSERVATION_SOURCES.map((source) => {
      const schedule = scheduleByKey.get(source.scheduleKey) ?? null;
      const providerRuns = source.provider
        ? runRows.filter((row) => row.provider === source.provider)
        : [];
      const lastRun = providerRuns[0] ?? null;
      const lastFailure = providerRuns.find((row) => row.status === "failed") ?? null;
      const lastSuccess = providerRuns.find((row) => row.status === "succeeded") ?? null;
      // A failure only counts as "the last error" while it is the newest run.
      const lastError =
        lastFailure && (!lastSuccess || lastFailure.started_at >= lastSuccess.started_at)
          ? lastFailure.error
          : null;

      const facts: CadenceFacts = {
        storedRowCount: stored[source.key].count,
        lastStoredAt: stored[source.key].at,
        lastRunRowCount: stored[source.key].rows,
        scheduleExists: Boolean(schedule),
        scheduleEnabled: schedule?.enabled ?? false,
        cron: schedule?.cron ?? source.defaultCron,
        nextRunAt: schedule?.next_run_at ?? null,
        lastRunAt: lastRun?.started_at ?? schedule?.last_run_at ?? null,
        lastDurationMs: lastRun?.duration_ms ?? schedule?.last_duration_ms ?? null,
        lastRunStatus: lastRun?.status ?? schedule?.last_state ?? null,
        lastError,
        lastErrorAt: lastError ? (lastFailure?.started_at ?? null) : null,
      };

      return deriveCadenceStatus(source, facts);
    });

    return {
      isOperator: (roles.data ?? []).some((row) => row.role === "admin" || row.role === "operator"),
      cadences,
    };
  });

/** Operator switch. Enabling is refused unless the source already stored a row. */
export const setObservationCadence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        source: z.enum(["gsc", "ga4", "umami", "pagespeed"]),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const { assertCadenceMayEnable } = await import("./observation-cadence");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tenantId = await requireTenantId(context.supabase);
    const source = cadenceSource(data.source);

    if (data.enabled) {
      const countRows = async () => {
        const options = { count: "exact", head: true } as const;
        switch (data.source) {
          case "gsc":
            return context.supabase
              .from("search_console_snapshots")
              .select("id", options)
              .eq("tenant_id", tenantId);
          case "ga4":
            return context.supabase
              .from("ga4_snapshots")
              .select("id", options)
              .eq("tenant_id", tenantId);
          case "umami":
            return context.supabase
              .from("umami_snapshots")
              .select("id", options)
              .eq("tenant_id", tenantId);
          case "pagespeed":
            return context.supabase
              .from("pagespeed_snapshots")
              .select("id", options)
              .eq("tenant_id", tenantId);
        }
      };
      const { count, error } = await countRows();
      if (error) throw new Error(`Could not confirm stored rows: ${error.message}`);
      assertCadenceMayEnable(source, count ?? 0);
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("schedules")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("key", source.scheduleKey)
      .maybeSingle();
    if (readError) throw new Error(`Could not read the cadence: ${readError.message}`);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("schedules")
        .update({ enabled: data.enabled })
        .eq("id", existing.id);
      if (error) throw new Error(`Could not update the cadence: ${error.message}`);
    } else {
      // The cadence must point at the workflow that actually performs the read,
      // otherwise a tick would report success without observing anything.
      const { data: workflow, error: workflowError } = await supabaseAdmin
        .from("workflows")
        .select("id")
        .eq("key", source.scheduleKey)
        .maybeSingle();
      if (workflowError) throw new Error(`Could not read the workflow: ${workflowError.message}`);
      if (!workflow) {
        throw new Error(
          `No workflow named "${source.scheduleKey}" exists, so the cadence cannot run.`,
        );
      }

      const { error } = await supabaseAdmin.from("schedules").insert({
        tenant_id: tenantId,
        key: source.scheduleKey,
        target_id: workflow.id,
        name: `${source.label} daily observation`,
        description: `Read-only daily ${source.label} observation. Stores an immutable snapshot per run.`,
        cron: source.defaultCron,
        enabled: data.enabled,
        target_kind: "workflow",
      });
      if (error) throw new Error(`Could not create the cadence: ${error.message}`);
    }

    return { source: data.source, enabled: data.enabled };
  });
