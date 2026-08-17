import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Client workspaces the signed-in operator may work in, plus the active one. */
export const getTenantContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listTenants, resolveTenantId } = await import("./tenant.server");
    const [tenants, activeTenantId] = await Promise.all([
      listTenants(context.supabase),
      resolveTenantId(context.supabase),
    ]);
    return { tenants, activeTenantId };
  });

export const switchTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ tenantId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { setActiveTenant, listTenants } = await import("./tenant.server");
    await setActiveTenant(context.supabase, context.userId, data.tenantId);
    return { tenants: await listTenants(context.supabase), activeTenantId: data.tenantId };
  });

/** Creates a new client workspace and makes the creator a member of it. */
export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().min(2).max(80),
        slug: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
        description: z.string().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { createTenantWorkspace } = await import("./tenant-admin.server");
    return createTenantWorkspace(context.supabase, context.userId, data);
  });
