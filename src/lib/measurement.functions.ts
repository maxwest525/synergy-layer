import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PageSpeedOpportunity } from "./measurement/pagespeed";
import type { Ga4ConnectionState } from "./measurement/ga4";

export type MeasurementRunView = {
  id: string;
  provider: string;
  target: string;
  strategy: string | null;
  status: string;
  error: string | null;
  httpStatus: number | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  authenticationSucceeded: boolean | null;
};

export type PageSpeedSnapshotView = {
  id: string;
  runId: string;
  url: string;
  finalUrl: string | null;
  strategy: string;
  lighthouseVersion: string | null;
  performanceScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  opportunities: PageSpeedOpportunity[];
  collectedAt: string;
};

/** Mirrors the stored JSON column, but stays serializable across the RPC boundary. */
export type Ga4MetricValue =
  string | number | boolean | null | Ga4MetricValue[] | { [key: string]: Ga4MetricValue };

export type Ga4SnapshotView = {
  id: string;
  property: string;
  startDate: string;
  endDate: string;
  metrics: Record<string, Ga4MetricValue>;
  collectedAt: string;
};

export type MeasurementState = {
  isOperator: boolean;
  defaultUrl: string;
  ownedUrls: string[];
  runs: MeasurementRunView[];
  snapshots: PageSpeedSnapshotView[];
  ga4: {
    property: string | null;
    connection: Ga4ConnectionState;
    latest: Ga4SnapshotView | null;
    runs: MeasurementRunView[];
  };
};

/** Tenant members read. Running a refresh is a separate, operator-only call. */
export const getMeasurementState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MeasurementState> => {
    const { requireTenantId } = await import("./tenant.server");
    const { describeGa4Connection, ga4PropertyForSearchConsoleProperty, readGa4EnvPresence } =
      await import("./measurement/ga4");
    const tenantId = await requireTenantId(context.supabase);

    const [roles, assets, runs, snapshots, ga4Rows, selectedProperty] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase
        .from("assets")
        .select("external_ref")
        .eq("tenant_id", tenantId)
        .eq("kind", "website"),
      context.supabase
        .from("measurement_runs")
        .select(
          "id, provider, target, strategy, status, error, http_status, started_at, finished_at, duration_ms, quota",
        )
        .eq("tenant_id", tenantId)
        .order("started_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("pagespeed_snapshots")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("ga4_snapshots")
        .select("id, property, start_date, end_date, metrics, collected_at")
        .eq("tenant_id", tenantId)
        .order("collected_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("search_console_properties")
        .select("site_url")
        .eq("tenant_id", tenantId)
        .eq("selected", true)
        .maybeSingle(),
    ]);

    // A failed read must never read as "nothing measured yet".
    for (const [label, result] of [
      ["roles", roles],
      ["website assets", assets],
      ["measurement runs", runs],
      ["PageSpeed snapshots", snapshots],
      ["GA4 snapshots", ga4Rows],
      ["selected Search Console property", selectedProperty],
    ] as const) {
      if (result.error) throw new Error(`Could not read ${label}: ${result.error.message}`);
    }

    const ownedUrls = (assets.data ?? [])
      .map((row) => row.external_ref)
      .filter((value): value is string => Boolean(value));

    const mapRun = (row: {
      id: string;
      provider: string;
      target: string;
      strategy: string | null;
      status: string;
      error: string | null;
      http_status: number | null;
      started_at: string;
      finished_at: string | null;
      duration_ms: number | null;
      quota: unknown;
    }): MeasurementRunView => {
      const quota =
        row.quota && typeof row.quota === "object" && !Array.isArray(row.quota)
          ? (row.quota as Record<string, unknown>)
          : {};
      return {
        id: row.id,
        provider: row.provider,
        target: row.target,
        strategy: row.strategy,
        status: row.status,
        error: row.error,
        httpStatus: row.http_status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: row.duration_ms,
        authenticationSucceeded:
          typeof quota["authenticationSucceeded"] === "boolean"
            ? (quota["authenticationSucceeded"] as boolean)
            : null,
      };
    };

    const allRuns = (runs.data ?? []).map(mapRun);
    const ga4Property = ga4PropertyForSearchConsoleProperty(
      selectedProperty.data?.site_url ?? null,
    );
    const ga4Row = (ga4Rows.data ?? []).find((row) => row.property === ga4Property) ?? null;
    const ga4AuthenticationProven = allRuns.some(
      (row) =>
        row.provider === "ga4" &&
        row.target === ga4Property &&
        row.authenticationSucceeded === true,
    );

    return {
      isOperator: (roles.data ?? []).some((row) => row.role === "admin" || row.role === "operator"),
      defaultUrl: ownedUrls[0] ?? "https://trumoveinc.com",
      ownedUrls,
      runs: allRuns.filter((row) => row.provider === "pagespeed"),
      snapshots: (snapshots.data ?? []).map((row) => ({
        id: row.id,
        runId: row.run_id,
        url: row.url,
        finalUrl: row.final_url,
        strategy: row.strategy,
        lighthouseVersion: row.lighthouse_version,
        performanceScore: row.performance_score,
        seoScore: row.seo_score,
        lcpMs: row.lcp_ms === null ? null : Number(row.lcp_ms),
        cls: row.cls === null ? null : Number(row.cls),
        tbtMs: row.tbt_ms === null ? null : Number(row.tbt_ms),
        fcpMs: row.fcp_ms === null ? null : Number(row.fcp_ms),
        speedIndexMs: row.speed_index_ms === null ? null : Number(row.speed_index_ms),
        opportunities: (row.opportunities ?? []) as unknown as PageSpeedOpportunity[],
        collectedAt: row.collected_at,
      })),
      ga4: {
        property: ga4Property,
        connection: describeGa4Connection(
          readGa4EnvPresence(process.env),
          ga4Property,
          Boolean(ga4Row),
          ga4AuthenticationProven,
        ),
        latest: ga4Row
          ? {
              id: ga4Row.id,
              property: ga4Row.property,
              startDate: ga4Row.start_date,
              endDate: ga4Row.end_date,
              metrics: (ga4Row.metrics ?? {}) as Record<string, Ga4MetricValue>,
              collectedAt: ga4Row.collected_at,
            }
          : null,
        runs: allRuns.filter((row) => row.provider === "ga4"),
      },
    };
  });

/** One operator click means exactly one PageSpeed request. No reruns. */
export const runPageSpeedCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        url: z.string().url().max(2000),
        strategy: z.enum(["mobile", "desktop"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runPageSpeed } = await import("./measurement/pagespeed.server");

    const result = await runPageSpeed(context.supabase, supabaseAdmin, {
      tenantId,
      url: data.url,
      strategy: data.strategy,
      actorId: context.userId,
    });

    return {
      runId: result.runId,
      status: result.status,
      performanceScore: result.snapshot.performanceScore,
      seoScore: result.snapshot.seoScore,
      missing: result.snapshot.missing,
    };
  });

/**
 * GA4 refresh. Until a real server credential exists this refuses honestly
 * rather than seeding numbers or claiming the property is wired.
 */
export const refreshGa4 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const { describeGa4Connection, ga4PropertyForSearchConsoleProperty, readGa4EnvPresence } =
      await import("./measurement/ga4");
    const { data: selectedProperty, error: selectedPropertyError } = await context.supabase
      .from("search_console_properties")
      .select("site_url")
      .eq("tenant_id", tenantId)
      .eq("selected", true)
      .maybeSingle();
    if (selectedPropertyError) {
      throw new Error(
        `Could not read the tenant's selected Search Console property: ${selectedPropertyError.message}`,
      );
    }
    const property = ga4PropertyForSearchConsoleProperty(selectedProperty?.site_url ?? null);
    const connection = describeGa4Connection(readGa4EnvPresence(process.env), property);
    if (!connection.configured || !property) {
      throw new Error(
        `GA4 is not configured for this tenant, so no request was made. ${connection.requirements.join(" ")}`.trim(),
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runGa4Inventory } = await import("./measurement/ga4.server");
    return runGa4Inventory(supabaseAdmin, {
      tenantId,
      actorId: context.userId,
      property,
    });
  });
