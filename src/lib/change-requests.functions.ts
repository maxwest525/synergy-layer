import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isChangeState } from "./change-request-state";
import { parseChangeTransitionInput, parseUuidInput } from "./server-input";

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
