import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const invocationSchema = z.object({
  toolName: z.string().trim().min(1).max(128),
  arguments: z.record(z.string(), z.unknown()),
  confirmed: z.boolean(),
});

export function parseOpenSeoInvocation(data: unknown) {
  return invocationSchema.parse(data);
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

export const getOpenSeoWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOpenSeoWorkspaceForOperator } = await import("./runtime.server");
    return asJson(await getOpenSeoWorkspaceForOperator(context));
  });

export const invokeOpenSeoTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseOpenSeoInvocation)
  .handler(async ({ data, context }) => {
    const { invokeOpenSeoToolForOperator } = await import("./runtime.server");
    return asJson(await invokeOpenSeoToolForOperator(context, data));
  });
