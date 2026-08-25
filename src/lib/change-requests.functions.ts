import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isChangeState } from "./change-request-state";
import {
  parseBulkChangeDecisionInput,
  parseChangeTransitionInput,
  parseUuidInput,
} from "./server-input";

export const getChangeRequest = createServerFn({ method: "GET" })
  .inputValidator(parseUuidInput)
  .handler(async ({ data }) => {
    const { createRequestClient, resolveTenantId } = await import("./tenant.server");
    const { fetchChangeRequest } = await import("./change-requests.server");
    const { db, authenticated } = createRequestClient();
    if (!authenticated)
      return {
        changeRequest: null,
        originSeoRun: null,
        postChangeRows: [],
        versions: [],
        measurement: { cycle: null, windows: [], observations: [], revisions: [] },
      };
    const tenantId = await resolveTenantId(db);
    if (!tenantId)
      return {
        changeRequest: null,
        originSeoRun: null,
        postChangeRows: [],
        versions: [],
        measurement: { cycle: null, windows: [], observations: [], revisions: [] },
      };
    return fetchChangeRequest(db, tenantId, data.id);
  });

async function runTransition(
  supabase: Parameters<typeof import("./change-requests.server").transitionChangeRequest>[0],
  userId: string,
  action: "approve" | "reject" | "mark_applied" | "verify" | "roll_back",
  data: { id: string; notes?: string | null | undefined; revision?: string | null | undefined },
) {
  const { assertOperator } = await import("./os-admin.server");
  await assertOperator(supabase, userId);
  const { transitionChangeRequest } = await import("./change-requests.server");
  const result = await transitionChangeRequest(supabase, {
    id: data.id,
    action,
    userId,
    notes: data.notes ?? null,
    revision: data.revision ?? null,
  });
  const state = result.changeRequest.state;
  if (isChangeState(state) && state !== "proposed") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordSeoRunChangeTransition } = await import("./seo-runs/execution.server");
    await recordSeoRunChangeTransition(
      supabaseAdmin,
      result.changeRequest.tenant_id,
      result.changeRequest.id,
      userId,
      state,
    );
  }
  return result;
}

export const approveChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseChangeTransitionInput)
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "approve", data),
  );

export const rejectChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseChangeTransitionInput)
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "reject", data),
  );

// Uncalled from the UI, unlike its four siblings, but keep it: it wraps the
// `transition_change_request` RPC, which is granted to `authenticated` and
// enforces the state machine in Postgres. The transition is reachable without
// this wrapper -- rows already exist in applied and rolled_back -- so "nothing
// calls it" is not evidence the path is dead.
export const markChangeRequestApplied = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseChangeTransitionInput)
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "mark_applied", data),
  );

export const verifyChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseChangeTransitionInput)
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "verify", data),
  );

export const rollBackChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseChangeTransitionInput)
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "roll_back", data),
  );

export type BulkDecisionOutcome = {
  id: string;
  ok: boolean;
  state: string | null;
  error: string | null;
};

export type BulkDecisionResult = {
  decision: "approve" | "reject";
  succeeded: number;
  failed: number;
  outcomes: BulkDecisionOutcome[];
};

/**
 * Decide several proposed change requests in one operator action. Each row is
 * transitioned individually through the same guarded RPC as a single decision,
 * so a failure on one item never silently applies to the others.
 */
export const decideChangeRequestsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseBulkChangeDecisionInput)
  .handler(async ({ data, context }): Promise<BulkDecisionResult> => {
    const outcomes: BulkDecisionOutcome[] = [];
    for (const item of data.items) {
      try {
        const result = await runTransition(context.supabase, context.userId, data.decision, {
          id: item.id,
          notes: item.notes ?? null,
        });
        outcomes.push({ id: item.id, ok: true, state: result.changeRequest.state, error: null });
      } catch (error: unknown) {
        outcomes.push({
          id: item.id,
          ok: false,
          state: null,
          error: error instanceof Error ? error.message : "The decision could not be recorded.",
        });
      }
    }
    return {
      decision: data.decision,
      succeeded: outcomes.filter((outcome) => outcome.ok).length,
      failed: outcomes.filter((outcome) => !outcome.ok).length,
      outcomes,
    };
  });
