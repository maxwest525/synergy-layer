import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * One row per attempt in `measurement_runs`, opened before the provider is
 * touched and closed with what happened. GA4, Umami, PageSpeed and Google
 * Ads already keep this ledger inline; Search Console did not, so its
 * failures could not reach the cadence card or the Command center's status
 * line (CODE-54). The ledger is written with service credentials: the table
 * has no insert policy for a session, by design.
 */

type LedgerClient = SupabaseClient<Database>;

export type MeasurementRunInput = {
  tenantId: string;
  provider: string;
  target: string;
  strategy?: string | null;
  actorId?: string | null;
};

export type OpenMeasurementRun = {
  id: string;
  close(status: "succeeded" | "failed" | "partial", error?: string | null): Promise<void>;
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(error);
}

export async function openMeasurementRun(
  admin: LedgerClient,
  input: MeasurementRunInput,
  now: () => number = Date.now,
): Promise<OpenMeasurementRun> {
  const startedAt = now();
  const { data, error } = await admin
    .from("measurement_runs")
    .insert({
      tenant_id: input.tenantId,
      provider: input.provider,
      target: input.target,
      strategy: input.strategy ?? null,
      actor_id: input.actorId ?? null,
      status: "running",
      cost_usd: 0,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Could not open a ${input.provider} measurement run: ${messageOf(error)}`);
  }
  const id = data.id;
  return {
    id,
    async close(status, closeError = null) {
      const { error: updateError } = await admin
        .from("measurement_runs")
        .update({
          status,
          error: closeError,
          finished_at: new Date(now()).toISOString(),
          duration_ms: now() - startedAt,
        })
        .eq("id", id);
      if (updateError) {
        throw new Error(
          `Could not close the ${input.provider} measurement run: ${messageOf(updateError)}`,
        );
      }
    },
  };
}

/** Runs `work` inside a ledgered attempt; a throw closes the run as failed and is rethrown. */
export async function withMeasurementRun<T>(
  admin: LedgerClient,
  input: MeasurementRunInput,
  work: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const run = await openMeasurementRun(admin, input, now);
  try {
    const result = await work();
    await run.close("succeeded");
    return result;
  } catch (error) {
    await run.close("failed", messageOf(error));
    throw error;
  }
}
