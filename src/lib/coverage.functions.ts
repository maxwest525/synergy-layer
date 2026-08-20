import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CoverageConcern, CoverageEvaluation } from "./coverage";

/**
 * Tenant-scoped read of the Coverage framework: every concern plus its latest
 * stored evaluation. No provider is called and nothing is written.
 */
export const getCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ concerns: CoverageConcern[] }> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const concerns = await db
      .from("essential_concerns")
      .select(
        "id, key, phase, task, description, priority, origin, evidence_source, owner_name, target_date",
      )
      .eq("tenant_id", tenantId)
      .is("retired_at", null)
      .order("sort_order", { ascending: true });
    if (concerns.error) throw new Error(`Coverage concerns: ${concerns.error.message}`);

    const evaluations = await db
      .from("essential_concern_evaluations")
      .select("concern_id, status, summary, limitation, evaluated_at")
      .eq("tenant_id", tenantId)
      .order("evaluated_at", { ascending: false });
    if (evaluations.error) throw new Error(`Coverage evaluations: ${evaluations.error.message}`);

    const latest = new Map<string, CoverageEvaluation>();
    for (const row of evaluations.data ?? []) {
      if (latest.has(row.concern_id)) continue;
      latest.set(row.concern_id, {
        status: row.status as CoverageEvaluation["status"],
        summary: row.summary,
        limitation: row.limitation,
        evaluatedAt: row.evaluated_at,
      });
    }

    return {
      concerns: (concerns.data ?? []).map((row) => ({
        id: row.id,
        key: row.key,
        phase: row.phase,
        task: row.task,
        description: row.description,
        priority: row.priority,
        origin: row.origin,
        evidenceSource: row.evidence_source,
        ownerName: row.owner_name,
        targetDate: row.target_date,
        latest: latest.get(row.id) ?? null,
      })),
    };
  });

/**
 * Records who owns a concern and when it is due. The write goes through one
 * tenant-checked routine, so an operator can never set ownership on a concern
 * that belongs to another workspace.
 */
export const setConcernOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { concernId: string; ownerName: string | null; targetDate: string | null }) => {
      const concernId = typeof data?.concernId === "string" ? data.concernId.trim() : "";
      if (!concernId) throw new Error("A concern id is required.");
      const ownerName =
        typeof data.ownerName === "string" && data.ownerName.trim()
          ? data.ownerName.trim().slice(0, 120)
          : null;
      const targetDate =
        typeof data.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.targetDate)
          ? data.targetDate
          : null;
      return { concernId, ownerName, targetDate };
    },
  )
  .handler(
    async ({ context, data }): Promise<{ ownerName: string | null; targetDate: string | null }> => {
      const result = await context.supabase.rpc("set_concern_ownership", {
        p_concern_id: data.concernId,
        // The routine normalises an empty owner to null; the date column accepts null.
        p_owner_name: data.ownerName ?? "",
        p_target_date: data.targetDate as unknown as string,
      });
      if (result.error) throw new Error(`Concern ownership: ${result.error.message}`);
      const row = result.data as { owner_name: string | null; target_date: string | null } | null;
      return { ownerName: row?.owner_name ?? null, targetDate: row?.target_date ?? null };
    },
  );
