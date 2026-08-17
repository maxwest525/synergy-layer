import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UmamiSnapshotView = {
  id: string;
  metric: string;
  websiteId: string;
  websiteName: string | null;
  periodStart: string;
  periodEnd: string;
  totals: Record<string, { value: number; prev: number }>;
  rows: { label: string; count: number }[];
  returnedRowCount: number;
  collectedAt: string;
};

export type UmamiRunView = {
  id: string;
  status: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type UmamiState = {
  isOperator: boolean;
  configured: boolean;
  /** Only a stored snapshot proves the instance actually answered. */
  connected: boolean;
  requirements: string[];
  snapshots: UmamiSnapshotView[];
  runs: UmamiRunView[];
};

function readRows(payload: unknown): { label: string; count: number }[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as Record<string, unknown>)["rows"];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const count = Number(record["count"]);
    return typeof record["label"] === "string" && Number.isFinite(count)
      ? [{ label: record["label"], count }]
      : [];
  });
}

function readTotals(totals: unknown): Record<string, { value: number; prev: number }> {
  if (!totals || typeof totals !== "object") return {};
  const out: Record<string, { value: number; prev: number }> = {};
  for (const [key, entry] of Object.entries(totals as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const value = Number(record["value"]);
    if (!Number.isFinite(value)) continue;
    const prev = Number(record["prev"]);
    out[key] = { value, prev: Number.isFinite(prev) ? prev : 0 };
  }
  return out;
}

export const getUmamiState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UmamiState> => {
    const { requireTenantId } = await import("./tenant.server");
    const { isUmamiConfigured, readUmamiEnvPresence } = await import("./umami/client.server");
    const tenantId = await requireTenantId(context.supabase);

    const [roles, snapshots, runs] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase
        .from("umami_snapshots")
        .select(
          "id, metric, website_id, website_name, period_start, period_end, totals, payload, returned_row_count, collected_at",
        )
        .eq("tenant_id", tenantId)
        .order("period_end", { ascending: false })
        .limit(24),
      context.supabase
        .from("measurement_runs")
        .select("id, status, error, started_at, finished_at")
        .eq("tenant_id", tenantId)
        .eq("provider", "umami")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

    for (const [label, result] of [
      ["roles", roles],
      ["Umami snapshots", snapshots],
      ["Umami runs", runs],
    ] as const) {
      if (result.error) throw new Error(`Could not read ${label}: ${result.error.message}`);
    }

    const presence = readUmamiEnvPresence(process.env);
    const configured = isUmamiConfigured(presence);
    const requirements: string[] = [];
    if (!presence.baseUrl) requirements.push("UMAMI_BASE_URL is not set on the server.");
    if (!presence.apiKey && !(presence.username && presence.password)) {
      requirements.push("No Umami API key or username and password are set on the server.");
    }

    return {
      isOperator: (roles.data ?? []).some((row) => row.role === "admin" || row.role === "operator"),
      configured,
      connected: (snapshots.data ?? []).length > 0,
      requirements,
      snapshots: (snapshots.data ?? []).map((row) => ({
        id: row.id,
        metric: row.metric,
        websiteId: row.website_id,
        websiteName: row.website_name,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        totals: readTotals(row.totals),
        rows: readRows(row.payload),
        returnedRowCount: row.returned_row_count,
        collectedAt: row.collected_at,
      })),
      runs: (runs.data ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        error: row.error,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
    };
  });

/** One operator click, one authenticated read of the instance. */
export const refreshUmami = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(180) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { observeUmami } = await import("./umami/observe.server");

    return observeUmami(context.supabase, supabaseAdmin, {
      tenantId,
      actorId: context.userId,
      days: data.days,
    });
  });
