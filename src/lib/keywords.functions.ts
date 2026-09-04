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
      .object({
        reviewState: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      })
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

/**
 * Whether the free targeting pass ran after a decision, and what it found.
 * `ran: false` always carries the reason, so the screen never has to guess
 * between "no findings" and "it never ran".
 */
export type KeywordDecisionTargeting =
  { ran: true; observations: number; recommendations: number } | { ran: false; reason: string };

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

    const { approveKeywords, rejectKeywords, reconcileKeywordInbox } =
      await import("./dataforseo/keywords.server");
    const { logActivity } = await import("./os.server");

    let count = 0;
    // Non-zero when the metrics snapshot could not be written, which today means
    // migration 20260903020000 is not applied on this host. The approval still
    // stands; the snapshot is simply absent, and the screen says so rather than
    // implying every approval kept what it was given (CODE-95).
    let metricsNotStored = 0;
    // Spellings an already-approved target covers. They leave the queue as
    // approved and do not become tracked targets of their own, because SERP
    // observation buys one paid task per tracked keyword (CODE-98).
    let folded = 0;
    if (data.decision === "approve") {
      const result = await approveKeywords(
        context.supabase,
        tenantId,
        data.keywords,
        context.userId,
      );
      count = result.approved;
      metricsNotStored = result.metricsNotStored;
      folded = result.folded;
    } else {
      count = (await rejectKeywords(context.supabase, tenantId, data.keywords, context.userId))
        .rejected;
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

    // An approval used to end here. The only workflow that reads the approved
    // set is `dfs-targeting-pass`, registered `triggerKind: "manual"` with no
    // cron and no hook, so fifty approved keywords produced nothing at all
    // until someone independently opened /workflows and pressed a button.
    //
    // The pass is free: it calls no provider and reads only rows already
    // stored, so running it on the operator's own click breaks no spend rule.
    // A rejection changes the approved set too (a keyword can be rejected
    // after approval), so both decisions re-run it.
    let targeting: KeywordDecisionTargeting = { ran: false, reason: "nothing was decided" };
    if (count > 0) {
      const { runTargetingPass } = await import("./dataforseo/targeting-rules.server");
      try {
        const result = await runTargetingPass(context.supabase, tenantId);
        targeting = { ran: true, ...result };
      } catch (error) {
        // The decision is already stored and must not be rolled back because
        // the pass failed. The failure is recorded rather than swallowed: a
        // pass that silently did nothing is the failure this project exists
        // to catch.
        const reason = error instanceof Error ? error.message : "the targeting pass failed";
        targeting = { ran: false, reason };
        await logActivity(context.supabase, {
          tenantId,
          actorKind: "user",
          actorId: context.userId,
          verb: "keyword.targeting_failed",
          subjectKind: "keyword_candidate",
          summary: `The targeting pass did not run after the decision: ${reason}`,
          payload: {},
        });
      }
    }

    const inbox = await reconcileKeywordInbox(context.supabase, tenantId);
    return { count, metricsNotStored, folded, targeting, ...inbox };
  });
