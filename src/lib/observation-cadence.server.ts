import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  OBSERVATION_SOURCES,
  deriveCadenceStatus,
  type CadenceFacts,
  type CadenceSourceKey,
  type CadenceStatus,
} from "./observation-cadence";

type Client = SupabaseClient<Database>;

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

/**
 * One tenant-scoped read of every observation source and its cadence row,
 * through the caller's own client so row policies decide what is visible.
 *
 * The cadence page, the next-action rules and the Command center's status
 * line all read this one derivation, so "overdue" has a single definition.
 * Before this, a cadence whose pg_cron target had silently stopped read
 * "Cadence on" everywhere but the cadence card itself (MEAS-10).
 */
export async function readObservationCadences(
  db: Client,
  tenantId: string,
): Promise<CadenceStatus[]> {
  const [schedules, runs, gsc, ga4, umami] = await Promise.all([
    db
      .from("schedules")
      .select("key, enabled, cron, next_run_at, last_run_at, last_duration_ms, last_state")
      .eq("tenant_id", tenantId)
      .in(
        "key",
        OBSERVATION_SOURCES.map((source) => source.scheduleKey),
      ),
    db
      .from("measurement_runs")
      .select("provider, status, error, started_at, finished_at, duration_ms")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(200),
    db
      .from("search_console_snapshots")
      .select("collected_at, returned_row_count", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("collected_at", { ascending: false })
      .limit(1),
    db
      .from("ga4_snapshots")
      .select("collected_at, metrics", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("collected_at", { ascending: false })
      .limit(1),
    db
      .from("umami_snapshots")
      .select("collected_at, returned_row_count", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("collected_at", { ascending: false })
      .limit(1),
  ]);

  for (const [label, result] of [
    ["observation schedules", schedules],
    ["measurement runs", runs],
    ["Search Console snapshots", gsc],
    ["GA4 snapshots", ga4],
    ["Umami snapshots", umami],
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

  return cadences;
}
