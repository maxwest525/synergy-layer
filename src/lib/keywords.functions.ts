import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The human approval gate for keyword discovery. Labs proposes, an operator
 * decides here, and only approved keywords ever reach SERP observation.
 */
export const listKeywordCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ reviewState: z.enum(["pending", "approved", "rejected", "all"]).default("pending") })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    let query = context.supabase
      .from("keyword_candidates")
      .select(
        "id, keyword, source, seed, location_code, language_code, metrics, review_state, reviewed_at, snapshot_id, created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.reviewState !== "all") query = query.eq("review_state", data.reviewState);

    const { data: candidates, error } = await query;
    if (error) throw new Error(error.message);

    const { data: tracked } = await context.supabase
      .from("tracked_keywords")
      .select("keyword, active, approved_at")
      .eq("tenant_id", tenantId);

    const { data: pending } = await context.supabase
      .from("keyword_candidates")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("review_state", "pending");

    return {
      candidates: candidates ?? [],
      tracked: tracked ?? [],
      pendingCount: (pending ?? []).length,
    };
  });

export const decideKeywordCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        keywords: z.array(z.string().min(1)).min(1).max(500),
        decision: z.enum(["approve", "reject"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { approveKeywords, rejectKeywords, reconcileKeywordInbox } = await import(
      "./dataforseo/keywords.server"
    );
    const { logActivity } = await import("./os.server");

    let count = 0;
    if (data.decision === "approve") {
      count = (await approveKeywords(context.supabase, tenantId, data.keywords, context.userId)).approved;
    } else {
      count = (await rejectKeywords(context.supabase, tenantId, data.keywords, context.userId)).rejected;
    }

    await logActivity(context.supabase, {
      tenantId,
      actorKind: "user",
      actorId: context.userId,
      verb: `keyword.${data.decision === "approve" ? "approved" : "rejected"}`,
      subjectKind: "keyword_candidate",
      summary: `Operator ${data.decision === "approve" ? "approved" : "rejected"} ${count} keyword${count === 1 ? "" : "s"}.`,
      payload: { keywords: data.keywords.slice(0, 100) },
    });

    const inbox = await reconcileKeywordInbox(context.supabase, tenantId);
    return { count, ...inbox };
  });
