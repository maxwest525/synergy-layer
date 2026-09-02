import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  fetchUmamiMetrics,
  fetchUmamiPageviews,
  fetchUmamiStats,
  listUmamiWebsites,
  umamiAuthHeaders,
  umamiHeartbeat,
  UmamiFailure,
  type UmamiWebsite,
} from "./client.server";

type Client = SupabaseClient<Database>;

export type UmamiObservationResult = {
  runId: string;
  websiteId: string;
  websiteName: string;
  written: number;
  unchanged: number;
  periodStart: string;
  periodEnd: string;
  /** Recommendations filed by evaluateUmamiSnapshots against the reading just taken. */
  findingsFiled: number;
  /** Set when the rules could not be evaluated; the observation itself still succeeded. */
  findingsError: string | null;
};

/** The site AOOS owns decides which Umami property is read. */
async function pickWebsite(
  db: Client,
  tenantId: string,
  websites: UmamiWebsite[],
): Promise<{ website: UmamiWebsite; matchedOwnedAsset: boolean }> {
  if (websites.length === 0) {
    throw new UmamiFailure("api_error", "Umami returned no websites for these credentials.");
  }
  const { data } = await db
    .from("assets")
    .select("external_ref")
    .eq("tenant_id", tenantId)
    .eq("kind", "website");
  const owned = new Set<string>();
  for (const row of data ?? []) {
    if (!row.external_ref) continue;
    try {
      owned.add(new URL(row.external_ref).hostname.replace(/^www\./, ""));
    } catch {
      // A malformed stored asset is skipped rather than silently trusted.
    }
  }
  const match = websites.find(
    (site) => site.domain && owned.has(site.domain.replace(/^www\./, "")),
  );
  return { website: match ?? websites[0]!, matchedOwnedAsset: Boolean(match) };
}

/**
 * One observation run: heartbeat, authenticate, read the window, and store each
 * metric as an immutable snapshot. A window already stored is a successful
 * no-change outcome, never a rewrite.
 */
export async function observeUmami(
  db: Client,
  admin: Client,
  input: { tenantId: string; actorId: string | null; days?: number },
): Promise<UmamiObservationResult> {
  const days = Math.min(Math.max(input.days ?? 28, 1), 180);
  const endAt = Date.now();
  const startAt = endAt - days * 24 * 60 * 60 * 1000;
  const baseUrl = (process.env["UMAMI_BASE_URL"] ?? "").replace(/\/+$/, "");
  const started = Date.now();

  const { data: run, error: runError } = await admin
    .from("measurement_runs")
    .insert({
      tenant_id: input.tenantId,
      provider: "umami",
      target: baseUrl || "umami",
      actor_id: input.actorId,
      status: "running",
    })
    .select("id")
    .single();
  if (runError) throw new UmamiFailure("api_error", `Could not open a run: ${runError.message}`);
  const runId = run.id;

  const close = async (
    status: "succeeded" | "failed",
    error: string | null,
    http: number | null,
  ) => {
    await admin
      .from("measurement_runs")
      .update({
        status,
        error,
        http_status: http,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        quota: { authenticationSucceeded: status === "succeeded" },
      })
      .eq("id", runId);
  };

  try {
    if (!(await umamiHeartbeat())) {
      throw new UmamiFailure("unreachable", "The Umami instance did not answer its heartbeat.");
    }

    const headers = await umamiAuthHeaders();
    const websites = await listUmamiWebsites(headers);
    const { website, matchedOwnedAsset } = await pickWebsite(db, input.tenantId, websites);

    const [stats, series, pages, referrers] = await Promise.all([
      fetchUmamiStats(headers, website.id, startAt, endAt),
      fetchUmamiPageviews(headers, website.id, startAt, endAt),
      fetchUmamiMetrics(headers, website.id, "path", startAt, endAt),
      fetchUmamiMetrics(headers, website.id, "referrer", startAt, endAt),
    ]);

    const periodStart = new Date(startAt).toISOString();
    const periodEnd = new Date(endAt).toISOString();
    const provenance = {
      baseUrl,
      websiteId: website.id,
      requestWindow: { startAt, endAt },
      fetchedAt: new Date().toISOString(),
      // Whether `website` matched a tenant-owned asset (vs. pickWebsite's
      // fallback to the first Umami property). The rule engine reads this to
      // decide whether it can honestly say "your" Umami instance on screen.
      matchedOwnedAsset,
    };

    const rows = [
      {
        metric: "stats" as const,
        totals: stats,
        payload: { stats },
        count: Object.keys(stats).length,
      },
      { metric: "pageviews" as const, totals: {}, payload: { series }, count: series.length },
      { metric: "pages" as const, totals: {}, payload: { rows: pages }, count: pages.length },
      {
        metric: "referrers" as const,
        totals: {},
        payload: { rows: referrers },
        count: referrers.length,
      },
    ];

    let written = 0;
    let unchanged = 0;
    for (const row of rows) {
      const { error } = await admin.from("umami_snapshots").insert({
        tenant_id: input.tenantId,
        run_id: runId,
        base_url: baseUrl,
        website_id: website.id,
        website_name: website.name,
        metric: row.metric,
        period_start: periodStart,
        period_end: periodEnd,
        totals: row.totals as never,
        payload: row.payload as never,
        returned_row_count: row.count,
        provenance: provenance as never,
      });
      if (!error) {
        written += 1;
        continue;
      }
      if (error.code === "23505") {
        unchanged += 1;
        continue;
      }
      throw new UmamiFailure("api_error", `Could not store the snapshot: ${error.message}`);
    }

    await close("succeeded", null, 200);

    // A stored reading that nothing reads is the stage-three failure this
    // product exists to name, so the rules run on the reading just taken. A
    // failure here must not fail the observation: the snapshot is stored and
    // immutable either way, and the finding can be filed by the next run.
    // Mirrors measurement/pagespeed.server.ts's identical inline evaluation.
    let findingsFiled = 0;
    let findingsError: string | null = null;
    try {
      const { evaluateUmamiSnapshots } = await import("../umami-rules.server");
      findingsFiled = (await evaluateUmamiSnapshots(admin, input.tenantId)).recommendations;
    } catch (error) {
      findingsError = error instanceof Error ? error.message : "the rules could not be evaluated";
    }

    return {
      runId,
      websiteId: website.id,
      websiteName: website.name,
      written,
      unchanged,
      periodStart,
      periodEnd,
      findingsFiled,
      findingsError,
    };
  } catch (error) {
    const failure =
      error instanceof UmamiFailure
        ? error
        : new UmamiFailure("api_error", `Umami observation failed: ${String(error)}`);
    await close("failed", failure.message, failure.httpStatus);
    throw failure;
  }
}
