import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


/** Client-safe mirror of the stored page observation shape. */
type PageEvidenceView = {
  domain: string;
  keyword: string;
  url: string;
  position: number;
  fetched: boolean;
  pageType: string;
  intentMatch: string;
  wordCount: number;
  headingCounts: { h1: number; h2: number; h3: number };
  headingSamples: string[];
  topicalCoverage: string[];
  schemaTypes: string[];
  internalLinks: number;
  externalLinks: number;
  hasPhoneCta: boolean;
  hasQuoteForm: boolean;
  hasReviewSignals: boolean;
  hasFaqBlock: boolean;
  observedAt: string;
};

/**
 * The human review gate for competitor intelligence. The shortlist is evidence,
 * not a decision: nothing becomes a tracked competitor until an operator says so.
 */
export const listCompetitorShortlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { data, error } = await context.supabase
      .from("competitor_candidates")
      .select("id, domain, domain_class, review_state, metrics, discovered_at")
      .eq("tenant_id", tenantId)
      .order("discovered_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: tracked } = await context.supabase
      .from("tracked_competitors")
      .select("domain, active, approved_at")
      .eq("tenant_id", tenantId);

    const rows = (data ?? []).map((row) => {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      const pass = (metrics["intelligence_pass"] ?? null) as Record<string, unknown> | null;
      const page = (metrics["page_evidence"] ?? null) as PageEvidenceView | null;
      return {
        id: row.id,
        domain: row.domain,
        domainClass: row.domain_class,
        reviewState: row.review_state,
        shortlisted: Boolean(pass?.["shortlisted"]),
        significanceScore: Number(pass?.["significance_score"] ?? 0),
        serpsPresent: Number(pass?.["serps_present"] ?? 0),
        serpsAnalysed: Number(pass?.["serps_analysed"] ?? 0),
        serpShare: Number(pass?.["serp_share"] ?? 0),
        medianPosition: Number(pass?.["median_position"] ?? 0),
        averagePosition: Number(pass?.["average_position"] ?? 0),
        bestPosition: Number(pass?.["best_position"] ?? 0),
        outranksOwned: ((pass?.["outranks_owned"] ?? []) as { keyword: string }[]).length,
        ownedOutranks: ((pass?.["owned_outranks"] ?? []) as { keyword: string }[]).length,
        confidence: Number(pass?.["confidence"] ?? 0),
        confidenceBasis: (pass?.["confidence_basis"] ?? []) as string[],
        shortlistReason: (pass?.["shortlist_reason"] as string | null) ?? null,
        serpFeatures: (pass?.["serp_features"] ?? []) as string[],
        keywords: (pass?.["keywords"] ?? []) as string[],
        pageEvidence: page,
      };
    });

    const shortlist = rows
      .filter((row) => row.shortlisted)
      .sort((a, b) => b.significanceScore - a.significanceScore);
    const observed = rows
      .filter((row) => !row.shortlisted)
      .sort((a, b) => b.significanceScore - a.significanceScore);

    return {
      shortlist,
      observed,
      tracked: tracked ?? [],
      serpsAnalysed: rows.reduce((max, row) => Math.max(max, row.serpsAnalysed), 0),
    };
  });

export const decideCompetitorCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        domains: z.array(z.string().min(1)).min(1).max(100),
        decision: z.enum(["approve", "reject"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const { logActivity } = await import("./os.server");

    const now = new Date().toISOString();
    const reviewState = data.decision === "approve" ? "approved" : "rejected";

    const { data: updated, error } = await context.supabase
      .from("competitor_candidates")
      .update({ review_state: reviewState, reviewed_by: context.userId, reviewed_at: now })
      .eq("tenant_id", tenantId)
      .in("domain", data.domains)
      .select("id, domain");
    if (error) throw new Error(error.message);

    let tracked = 0;
    if (data.decision === "approve") {
      for (const row of updated ?? []) {
        const { error: trackError } = await context.supabase.from("tracked_competitors").upsert(
          {
            tenant_id: tenantId,
            domain: row.domain,
            candidate_id: row.id,
            approved_by: context.userId,
            approved_at: now,
            active: true,
          },
          { onConflict: "tenant_id,domain", ignoreDuplicates: false },
        );
        if (trackError) throw new Error(trackError.message);
        tracked += 1;
      }
    }

    await logActivity(context.supabase, {
      tenantId,
      actorKind: "user",
      actorId: context.userId,
      verb: `competitor.${reviewState}`,
      subjectKind: "competitor_candidate",
      summary: `Operator ${reviewState} ${(updated ?? []).length} competitor candidate${(updated ?? []).length === 1 ? "" : "s"}.`,
      payload: { domains: data.domains.slice(0, 50) },
    });

    // Once nothing shortlisted is still pending, the review is finished.
    const { data: pending } = await context.supabase
      .from("competitor_candidates")
      .select("id, metrics")
      .eq("tenant_id", tenantId)
      .not("review_state", "in", "(approved,rejected)");
    const pendingShortlisted = (pending ?? []).filter((row) => {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      const pass = metrics["intelligence_pass"] as Record<string, unknown> | undefined;
      return Boolean(pass?.["shortlisted"]);
    }).length;

    let inboxResolved = false;
    if (pendingShortlisted === 0) {
      const { data: item } = await context.supabase
        .from("inbox_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("source_module", "competitor-intelligence")
        .is("resolved_at", null)
        .maybeSingle();
      if (item) {
        await context.supabase.from("inbox_items").update({ resolved_at: now }).eq("id", item.id);
        inboxResolved = true;
      }
    }

    return { count: (updated ?? []).length, tracked, pendingShortlisted, inboxResolved };
  });
