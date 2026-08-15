import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { deriveSeoRunSourceExecutionState, type SourceExecutionStatus } from "./types";

type AdminClient = SupabaseClient<Database>;

async function linkedRun(
  admin: AdminClient,
  tenantId: string,
  changeRequestId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from("seo_runs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("change_request_id", changeRequestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function recordSeoRunExecutionStarted(
  admin: AdminClient,
  tenantId: string,
  changeRequestId: string,
  actorId: string,
): Promise<void> {
  const run = await linkedRun(admin, tenantId, changeRequestId);
  if (!run) return;

  const { error: updateError } = await admin
    .from("seo_runs")
    .update({ state: "executing", failure_reason: null })
    .eq("tenant_id", tenantId)
    .eq("id", run.id);
  if (updateError) throw new Error(updateError.message);

  const { error: eventError } = await admin.from("seo_run_events").insert({
    tenant_id: tenantId,
    run_id: run.id,
    event_key: `execution_started:${crypto.randomUUID()}`,
    state: "executing",
    summary: "An operator started the approved source execution. No live-page proof exists yet.",
    actor_id: actorId,
  });
  if (eventError) throw new Error(eventError.message);
}

export async function recordSeoRunSourceExecutionResult(
  admin: AdminClient,
  tenantId: string,
  changeRequestId: string,
  actorId: string,
  status: SourceExecutionStatus,
): Promise<void> {
  const run = await linkedRun(admin, tenantId, changeRequestId);
  if (!run) return;

  const state = deriveSeoRunSourceExecutionState(status);
  const failed = state === "failed";
  const summary = failed
    ? "Source execution did not complete. The proposal remains separate and may be retried after review."
    : "The approved source change is committed. Rendered live-page proof is still required.";
  const { error: updateError } = await admin
    .from("seo_runs")
    .update({
      state,
      failure_reason: failed ? summary : null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", run.id);
  if (updateError) throw new Error(updateError.message);

  const { error: eventError } = await admin.from("seo_run_events").insert({
    tenant_id: tenantId,
    run_id: run.id,
    event_key: `source_execution:${crypto.randomUUID()}`,
    state,
    summary,
    payload: { status, change_request_id: changeRequestId },
    actor_id: actorId,
  });
  if (eventError) throw new Error(eventError.message);
}
