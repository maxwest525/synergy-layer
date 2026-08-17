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
      .select("id, key, phase, task, description, priority, origin, evidence_source")
      .eq("tenant_id", tenantId)
      .is("retired_at", null)
      .order("sort_order", { ascending: true });
    if (concerns.error) throw new Error(`Coverage concerns: ${concerns.error.message}`);

    const evaluations = await db
      .from("essential_concern_evaluations")
      .select("concern_id, status, summary, limitation, evaluated_at")
      .eq("tenant_id", tenantId)
      .order("evaluated_at", { ascending: false });
    if (evaluations.error)
      throw new Error(`Coverage evaluations: ${evaluations.error.message}`);

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
        latest: latest.get(row.id) ?? null,
      })),
    };
  });
