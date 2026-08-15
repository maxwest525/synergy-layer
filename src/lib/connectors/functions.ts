import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type OperatorContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function checkConnectorReadinessForOperator(context: OperatorContext) {
  const { assertOperator } = await import("../os-admin.server");
  const { requireTenantId } = await import("../tenant.server");
  const { syncConnectorReadiness } = await import("./connections.server");
  await assertOperator(context.supabase, context.userId);
  const tenantId = await requireTenantId(context.supabase);
  const connections = await syncConnectorReadiness(context.supabase, tenantId);
  return {
    connections,
    checkedCount: connections.length,
    healthyCount: connections.filter((row) => row.health === "healthy").length,
  };
}

export const getConnectorReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { fetchConnectorReadiness } = await import("./connections.server");
    return fetchConnectorReadiness();
  });

export const checkConnectorReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => checkConnectorReadinessForOperator(context));
