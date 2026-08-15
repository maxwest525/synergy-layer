import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ChangeState } from "../change-request-state";
import { deriveSeoRunSourceExecutionState, type SourceExecutionStatus } from "./types";

type AdminClient = SupabaseClient<Database>;
type TransitionState = Exclude<ChangeState, "proposed">;

const transitionEvent: Record<
  TransitionState,
  {
    state: "approved" | "executed" | "verified" | "rejected" | "rolled_back";
    summary: string;
  }
> = {
  approved: {
    state: "approved",
    summary: "An operator approved the exact proposal. No source execution has started.",
  },
  applied: {
    state: "executed",
    summary:
      "The approved change is marked applied. Rendered proof and verification remain separate.",
  },
  verified: {
    state: "verified",
    summary: "An operator verified the change using the required post-change evidence.",
  },
  rejected: {
    state: "rejected",
    summary: "An operator rejected the proposal. No execution was authorized.",
  },
  rolled_back: {
    state: "rolled_back",
    summary: "An operator recorded the applied change as rolled back.",
  },
};

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

export async function recordSeoRunChangeTransition(
  admin: AdminClient,
  tenantId: string,
  changeRequestId: string,
  actorId: string,
  changeState: TransitionState,
): Promise<void> {
  const run = await linkedRun(admin, tenantId, changeRequestId);
  if (!run) return;

  const event = transitionEvent[changeState];
  const { error } = await admin.from("seo_run_events").upsert(
    {
      tenant_id: tenantId,
      run_id: run.id,
      event_key: `change_state:${changeRequestId}:${changeState}`,
      state: event.state,
      summary: event.summary,
      payload: { change_request_id: changeRequestId, change_request_state: changeState },
      actor_id: actorId,
    },
    { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function recordSeoRunRenderedProof(
  admin: AdminClient,
  tenantId: string,
  changeRequestId: string,
  actorId: string,
  finalUrl: string,
): Promise<void> {
  const run = await linkedRun(admin, tenantId, changeRequestId);
  if (!run) return;

  const { error } = await admin.from("seo_run_events").upsert(
    {
      tenant_id: tenantId,
      run_id: run.id,
      event_key: `rendered_proof:${changeRequestId}`,
      state: "executed",
      summary:
        "The rendered public page serves the approved title and H1. Outcome verification remains separate.",
      payload: { change_request_id: changeRequestId, final_url: finalUrl },
      actor_id: actorId,
    },
    { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
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

  const { error: eventError } = await admin.from("seo_run_events").upsert(
    {
      tenant_id: tenantId,
      run_id: run.id,
      event_key: `execution_started:${changeRequestId}`,
      state: "executing",
      summary: "An operator started the approved source execution. No live-page proof exists yet.",
      actor_id: actorId,
    },
    { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
  );
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

  const { error: eventError } = await admin.from("seo_run_events").upsert(
    {
      tenant_id: tenantId,
      run_id: run.id,
      event_key: `source_execution:${changeRequestId}:${state}`,
      state,
      summary,
      payload: { status, change_request_id: changeRequestId },
      actor_id: actorId,
    },
    { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
  );
  if (eventError) throw new Error(eventError.message);
}
