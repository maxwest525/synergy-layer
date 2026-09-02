import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cadenceSource, type CadenceStatus } from "./observation-cadence";
import { readObservationCadences } from "./observation-cadence.server";

export type ObservationCadenceState = {
  isOperator: boolean;
  cadences: CadenceStatus[];
};

/** One tenant-scoped read of every observation source and its cadence row. */
export const getObservationCadences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ObservationCadenceState> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const [roles, cadences] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      readObservationCadences(context.supabase, tenantId),
    ]);
    if (roles.error) throw new Error(`Could not read roles: ${roles.error.message}`);

    return {
      isOperator: (roles.data ?? []).some((row) => row.role === "admin" || row.role === "operator"),
      cadences,
    };
  });

/** Operator switch. Enabling is refused unless the source already stored a row. */
export const setObservationCadence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        source: z.enum(["gsc", "ga4", "umami"]),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const { assertCadenceMayEnable } = await import("./observation-cadence");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tenantId = await requireTenantId(context.supabase);
    const source = cadenceSource(data.source);

    if (data.enabled) {
      const countRows = async () => {
        const options = { count: "exact", head: true } as const;
        switch (data.source) {
          case "gsc":
            return context.supabase
              .from("search_console_snapshots")
              .select("id", options)
              .eq("tenant_id", tenantId);
          case "ga4":
            return context.supabase
              .from("ga4_snapshots")
              .select("id", options)
              .eq("tenant_id", tenantId);
          case "umami":
            return context.supabase
              .from("umami_snapshots")
              .select("id", options)
              .eq("tenant_id", tenantId);
        }
      };
      const { count, error } = await countRows();
      if (error) throw new Error(`Could not confirm stored rows: ${error.message}`);
      assertCadenceMayEnable(source, count ?? 0);
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("schedules")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("key", source.scheduleKey)
      .maybeSingle();
    if (readError) throw new Error(`Could not read the cadence: ${readError.message}`);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("schedules")
        .update({ enabled: data.enabled })
        .eq("id", existing.id);
      if (error) throw new Error(`Could not update the cadence: ${error.message}`);
    } else {
      // The cadence must point at the workflow that actually performs the read,
      // otherwise a tick would report success without observing anything.
      const { data: workflow, error: workflowError } = await supabaseAdmin
        .from("workflows")
        .select("id")
        .eq("key", source.scheduleKey)
        .maybeSingle();
      if (workflowError) throw new Error(`Could not read the workflow: ${workflowError.message}`);
      if (!workflow) {
        throw new Error(
          `No workflow named "${source.scheduleKey}" exists, so the cadence cannot run.`,
        );
      }

      const { error } = await supabaseAdmin.from("schedules").insert({
        tenant_id: tenantId,
        key: source.scheduleKey,
        target_id: workflow.id,
        name: `${source.label} daily observation`,
        description: `Read-only daily ${source.label} observation. Stores an immutable snapshot per run.`,
        cron: source.defaultCron,
        enabled: data.enabled,
        target_kind: "workflow",
      });
      if (error) throw new Error(`Could not create the cadence: ${error.message}`);
    }

    return { source: data.source, enabled: data.enabled };
  });
