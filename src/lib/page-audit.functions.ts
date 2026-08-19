import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PageAuditView } from "./page-audit";

export type { PageAuditView, DuplicateGroup, PageMetadataObservation } from "./page-audit";

export const getPageAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PageAuditView> => {
    const { requireTenantId } = await import("./tenant.server");
    const { readPageAudit } = await import("./page-audit.server");
    const tenantId = await requireTenantId(context.supabase);
    return readPageAudit(context.supabase, tenantId);
  });

export const runPageWordingAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PageAuditView> => {
    const { requireTenantId } = await import("./tenant.server");
    const { runPageAudit } = await import("./page-audit.server");
    const tenantId = await requireTenantId(context.supabase);
    return runPageAudit(context.supabase, tenantId, context.userId);
  });
