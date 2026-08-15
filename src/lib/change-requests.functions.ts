import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const notes = z.string().max(2000).optional().nullable();

export const getChangeRequest = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createRequestClient, resolveTenantId } = await import("./tenant.server");
    const { fetchChangeRequest } = await import("./change-requests.server");
    const { db, authenticated } = createRequestClient();
    if (!authenticated)
      return {
        changeRequest: null,
        postChangeRows: [],
        versions: [],
        measurement: { cycle: null, windows: [], observations: [], revisions: [] },
      };
    const tenantId = await resolveTenantId(db);
    if (!tenantId)
      return {
        changeRequest: null,
        postChangeRows: [],
        versions: [],
        measurement: { cycle: null, windows: [], observations: [], revisions: [] },
      };
    return fetchChangeRequest(db, tenantId, data.id);
  });

const transitionInput = z.object({
  id: z.string().uuid(),
  notes: notes,
  revision: z.string().max(200).optional().nullable(),
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
  return transitionChangeRequest(supabase, {
    id: data.id,
    action,
    userId,
    notes: data.notes ?? null,
    revision: data.revision ?? null,
  });
}

export const approveChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transitionInput.parse(data))
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "approve", data),
  );

export const rejectChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transitionInput.parse(data))
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "reject", data),
  );

export const markChangeRequestApplied = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transitionInput.parse(data))
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "mark_applied", data),
  );

export const verifyChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transitionInput.parse(data))
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "verify", data),
  );

export const rollBackChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transitionInput.parse(data))
  .handler(async ({ data, context }) =>
    runTransition(context.supabase, context.userId, "roll_back", data),
  );
