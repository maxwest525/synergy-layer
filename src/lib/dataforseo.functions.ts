import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Operator-visible DataForSEO state: budget consumption, the per-request cost
 * ledger, and the immutable snapshots each request produced. Spend that only
 * exists in the database is spend nobody can govern.
 */
export const getDataForSeoState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { getBudget } = await import("./dataforseo/budget.server");
    const budget = await getBudget(context.supabase, tenantId);

    const { data: requests } = await context.supabase
      .from("dataforseo_requests")
      .select(
        "id, capability_key, family, endpoint, mode, outcome, cost_usd, returned_row_count, created_at, error",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: snapshots } = await context.supabase
      .from("dataforseo_snapshots")
      .select(
        "id, kind, target, endpoint, returned_row_count, provider_cost_usd, reporting_date, collected_at",
      )
      .eq("tenant_id", tenantId)
      .order("collected_at", { ascending: false })
      .limit(12);

    const { data: candidates } = await context.supabase
      .from("keyword_candidates")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("review_state", "pending");

    return {
      budget,
      requests: requests ?? [],
      snapshots: snapshots ?? [],
      pendingKeywordCandidates: (candidates ?? []).length,
    };
  });
