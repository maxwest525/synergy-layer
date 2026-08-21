import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Setting a page check aside, and putting it back.
 *
 * Page-audit findings are recomputed on every read, so there is no row to mark.
 * The fingerprint the queue builds is the key, and restoring deletes the row
 * rather than writing a second state. Neither call touches the site or spends
 * anything.
 */
const input = z.object({ fingerprint: z.string().min(1).max(200) });

export const ignoreAuditFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { error } = await context.supabase
      .from("suggestion_suppressions")
      .upsert(
        { tenant_id: tenantId, fingerprint: data.fingerprint, suppressed_by: context.userId },
        { onConflict: "tenant_id,fingerprint" },
      );
    if (error) throw new Error(`That check could not be set aside: ${error.message}`);
    return { fingerprint: data.fingerprint, suppressed: true };
  });

export const restoreAuditFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { error } = await context.supabase
      .from("suggestion_suppressions")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("fingerprint", data.fingerprint);
    if (error) throw new Error(`That check could not be put back: ${error.message}`);
    return { fingerprint: data.fingerprint, suppressed: false };
  });
