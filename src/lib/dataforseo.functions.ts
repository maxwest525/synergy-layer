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

/**
 * Metered. One DataForSEO Labs task per approved competitor, fired only by an
 * explicit operator click with the estimate shown on the button. Results are
 * filed as pending keyword candidates and go through the existing approval
 * gate; nothing is tracked here.
 */
export const runCompetitorKeywordGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { getSelectedProperty } = await import("./search-console.server");
    const property = await getSelectedProperty(context.supabase);
    const ownDomain = (property ?? "")
      .replace(/^sc-domain:/, "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (!ownDomain) throw new Error("No owned property is selected to compare against.");

    const { runKeywordGap } = await import("./dataforseo/keyword-gap.server");
    const result = await runKeywordGap(context.supabase, tenantId, ownDomain);

    const { logActivity } = await import("./os.server");
    await logActivity(context.supabase, {
      tenantId,
      actorKind: "user",
      actorId: context.userId,
      verb: "keyword.gap.collected",
      subjectKind: "capability",
      summary: `Compared the site against ${result.competitors} approved competitors and filed ${result.filed} keyword candidates for review${result.unparsed > 0 ? ` (${result.unparsed} items skipped: unrecognized response shape)` : ""}.`,
      payload: { ...result },
    });

    return result;
  });

/**
 * Metered: two DataForSEO Labs tasks over the whole pending queue, fired only
 * by an explicit operator click. Writes scores onto the candidates and changes
 * no review state.
 */
export const runKeywordEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { enrichPendingCandidates } = await import("./dataforseo/keyword-enrichment.server");
    return enrichPendingCandidates(context.supabase, tenantId);
  });
