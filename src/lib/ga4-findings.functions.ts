import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Ga4FindingEntry = {
  id: string;
  rule: string;
  target: string;
  periodEnd: string;
  createdAt: string;
  recommendationId: string | null;
  recommendationTitle: string | null;
  recommendationState: string | null;
};

export type Ga4FindingsSummary = {
  findings: Ga4FindingEntry[];
  countsByRule: Record<string, number>;
};

/**
 * What the GA4 rules engine found, for the operator-facing findings panel on
 * /ga4. Reads stored rows only.
 */
export const getGa4Findings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Ga4FindingsSummary> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const client = context.supabase;

    const { data, error } = await client
      .from("ga4_observations")
      .select(
        "id, rule, target, period_end, created_at, recommendation_id, recommendations(id, title, state)",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      throw new Error(`GA4 rule findings could not be read: ${error.message}`);
    }

    const findings: Ga4FindingEntry[] = (data ?? []).map((row) => {
      const recommendation = Array.isArray(row.recommendations)
        ? (row.recommendations[0] ?? null)
        : (row.recommendations ?? null);
      return {
        id: row.id,
        rule: row.rule,
        target: row.target,
        periodEnd: row.period_end,
        createdAt: row.created_at,
        recommendationId: row.recommendation_id,
        recommendationTitle: recommendation?.title ?? null,
        recommendationState: recommendation?.state ?? null,
      };
    });

    const countsByRule: Record<string, number> = {};
    for (const finding of findings) {
      countsByRule[finding.rule] = (countsByRule[finding.rule] ?? 0) + 1;
    }

    return { findings, countsByRule };
  });
