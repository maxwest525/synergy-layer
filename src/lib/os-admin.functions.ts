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
    return syncRegistryDefinitions(context.supabase);
  });
