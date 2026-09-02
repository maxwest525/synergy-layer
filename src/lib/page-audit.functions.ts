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
    // Renders up to a hundred pages, through a metered fallback when the
    // self-hosted renderer is down: an operator's click, never a member's.
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const { runPageAudit } = await import("./page-audit.server");
    const tenantId = await requireTenantId(context.supabase);
    return runPageAudit(context.supabase, tenantId, context.userId);
  });
