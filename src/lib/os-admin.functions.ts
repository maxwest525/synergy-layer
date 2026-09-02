import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((row) => row.role);
    return {
      userId: context.userId,
      roles,
      canOperate: roles.some((role) => role === "admin" || role === "operator"),
    };
  });

export const runWorkflowNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ workflowId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { runWorkflow } = await import("./workflow-runner.server");
    return runWorkflow(context.supabase, data.workflowId, "manual", context.userId);
  });

/** Creates a run parked before step 1. Nothing executes until you advance it. */
export const startWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ workflowId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { startRun } = await import("./workflow-runner.server");
    return startRun(context.supabase, data.workflowId, "manual", context.userId, "manual");
  });

export const advanceWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ runId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { advanceRun } = await import("./workflow-runner.server");
    return advanceRun(context.supabase, data.runId, context.userId);
  });

export const cancelWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ runId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { cancelRun } = await import("./workflow-runner.server");
    return cancelRun(context.supabase, data.runId, context.userId);
  });

export const decideRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator, decide } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    return decide(context.supabase, data.id, data.decision, context.userId);
  });

/**
 * Set a suggestion aside, or take it back. Reversible, records nothing as
 * approved, and runs nothing — so it carries no cost and no site effect.
 */
export const setRecommendationQueueState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), verb: z.enum(["ignore", "restore"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator, setQueueState } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    return setQueueState(context.supabase, data.id, data.verb, context.userId);
  });

export const resolveInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator, resolveItem } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    return resolveItem(context.supabase, data.id);
  });

export const reopenInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator, reopenItem } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    return reopenItem(context.supabase, data.id);
  });

export const runSchedulerTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { tickScheduler } = await import("./scheduler.server");
    return tickScheduler(context.supabase, new Date(), {
      onlyKeys: ["gsc-daily-observe"],
      collectSerpBacklog: false,
      firedBy: "operator",
    });
  });

export const runReferenceAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ agentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { runAgent } = await import("./agent-runtime.server");
    return runAgent(context.supabase, data.agentId, context.userId);
  });

export const syncRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { syncRegistryDefinitions } = await import("@/registry/sync.server");
    // Code-defined rows are written by the service role, behind the operator
    // check above; an operator reads the registry and never writes it, and
    // the policies on `agents` and `agent_capabilities` now say so (CODE-20).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return syncRegistryDefinitions(supabaseAdmin);
  });
