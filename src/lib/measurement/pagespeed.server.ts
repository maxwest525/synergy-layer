import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  assertOwnedTarget,
  normalizePageSpeed,
  PageSpeedError,
  runStatusFor,
  type PageSpeedNormalized,
} from "./pagespeed";

type Client = SupabaseClient<Database>;
type AdminClient = SupabaseClient<Database>;

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** Owned hosts come from stored website assets, never from the browser. */
export async function ownedHosts(db: Client, tenantId: string): Promise<string[]> {
  const { data, error } = await db
    .from("assets")
    .select("external_ref")
    .eq("tenant_id", tenantId)
    .eq("kind", "website");
  if (error) throw new Error(`Could not read owned website assets: ${error.message}`);
  const hosts: string[] = [];
  for (const row of data ?? []) {
    if (!row.external_ref) continue;
    try {
      hosts.push(new URL(row.external_ref).hostname);
    } catch {
      // A malformed stored asset is skipped rather than silently trusted.
    }
  }
  return hosts;
}

export type PageSpeedRunResult = {
  runId: string;
  status: "succeeded" | "partial";
  snapshot: PageSpeedNormalized;
  /** New findings filed from this reading; the rules run on what was stored. */
  findingsFiled: number;
  /** Set when the rules could not run. The snapshot is stored regardless. */
  findingsError: string | null;
};

/**
 * One click, one provider request. The run row is written before the call so a
 * failure is still visible history, and it is closed out with the real outcome.
 * Writes go through the service role because operators hold read-only grants on
 * these tables; the operator check happens in the calling server function.
 */
export async function runPageSpeed(
  db: Client,
  admin: AdminClient,
  input: { tenantId: string; url: string; strategy: "mobile" | "desktop"; actorId: string },
): Promise<PageSpeedRunResult> {
  const hosts = await ownedHosts(db, input.tenantId);
  const target = assertOwnedTarget(input.url, hosts);

  const { data: run, error: runError } = await admin
    .from("measurement_runs")
    .insert({
      tenant_id: input.tenantId,
      provider: "pagespeed",
      target,
      strategy: input.strategy,
      actor_id: input.actorId,
      status: "running",
      cost_usd: 0,
    })
    .select("id, started_at")
    .single();
  if (runError || !run)
    throw new Error(`Could not open a measurement run: ${runError?.message ?? "no row"}`);

  const startedAt = Date.now();
  const finish = async (patch: Record<string, unknown>) => {
    const { error } = await admin
      .from("measurement_runs")
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        ...patch,
      })
      .eq("id", run.id);
    if (error) throw new Error(`Could not close the measurement run: ${error.message}`);
  };

  const params = new URLSearchParams({ url: target, strategy: input.strategy });
  params.append("category", "PERFORMANCE");
  params.append("category", "SEO");
  // Only used when the operator has already configured one. Never surfaced.
  const key = process.env["PAGESPEED_API_KEY"];
  if (key && key.trim().length > 0) params.set("key", key);

  let httpStatus: number | null = null;
  let payload: unknown;
  try {
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { accept: "application/json" },
    });
    httpStatus = response.status;
    const body = await response.text();
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      throw new PageSpeedError(
        `PageSpeed returned a non JSON response (HTTP ${response.status}).`,
        response.status,
      );
    }
    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } })?.error?.message ??
        `PageSpeed request failed with HTTP ${response.status}.`;
      throw new PageSpeedError(message, response.status);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ status: "failed", error: message, http_status: httpStatus });
    throw new Error(message);
  }

  let snapshot: PageSpeedNormalized;
  try {
    snapshot = normalizePageSpeed(payload, { url: target, strategy: input.strategy });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ status: "failed", error: message, http_status: httpStatus });
    throw new Error(message);
  }

  const status = runStatusFor(snapshot);

  const { error: insertError } = await admin.from("pagespeed_snapshots").insert({
    tenant_id: input.tenantId,
    run_id: run.id,
    url: snapshot.url,
    final_url: snapshot.finalUrl,
    strategy: snapshot.strategy,
    lighthouse_version: snapshot.lighthouseVersion,
    analysis_timestamp: snapshot.analysisTimestamp,
    performance_score: snapshot.performanceScore,
    seo_score: snapshot.seoScore,
    lcp_ms: snapshot.lcpMs,
    cls: snapshot.clsValue,
    tbt_ms: snapshot.tbtMs,
    fcp_ms: snapshot.fcpMs,
    speed_index_ms: snapshot.speedIndexMs,
    opportunities: snapshot.opportunities,
    provenance: {
      endpoint: ENDPOINT,
      keyed: Boolean(key),
      categories: ["PERFORMANCE", "SEO"],
      missing: snapshot.missing,
      requested_url: target,
    },
  });
  if (insertError) {
    await finish({ status: "failed", error: insertError.message, http_status: httpStatus });
    throw new Error(
      `PageSpeed responded but the snapshot could not be stored: ${insertError.message}`,
    );
  }

  await finish({
    status,
    http_status: httpStatus,
    ...(snapshot.missing.length > 0
      ? { error: `Provider omitted: ${snapshot.missing.join(", ")}.` }
      : {}),
  });

  // A stored reading that nothing reads is the stage-three failure this
  // product exists to name, so the rules run on the reading just taken. A
  // failure here must not fail the measurement: the snapshot is stored and
  // immutable either way, and the finding can be filed by the next run.
  let findingsFiled = 0;
  let findingsError: string | null = null;
  try {
    const { evaluatePageSpeedReadings } = await import("../pagespeed-rules.server");
    findingsFiled = (await evaluatePageSpeedReadings(admin, input.tenantId)).recommendations;
  } catch (error) {
    findingsError = error instanceof Error ? error.message : "the rules could not be evaluated";
  }

  return { runId: run.id, status, snapshot, findingsFiled, findingsError };
}
