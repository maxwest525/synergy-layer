import { createServerFn } from "@tanstack/react-start";

import { parseLinkIntersect } from "./dataforseo/link-intersect";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OWNERSHIP_REVIEW_DECISIONS, OWNERSHIP_RULE_LABELS } from "./dataforseo/ownership-review";
import { COMPANY_CLASSIFICATIONS, setCompanyClassification } from "./company-classification.server";

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
      .select(
        "id, domain, domain_class, review_state, metrics, discovered_at, company_classification, classification_updated_at",
      )
      .eq("tenant_id", tenantId)
      .order("discovered_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: tracked } = await context.supabase
      .from("tracked_competitors")
      .select("domain, active, approved_at")
      .eq("tenant_id", tenantId);

    // The newest competitor link intersect, if an operator has run one (LINK-4).
    const { data: intersectRows, error: intersectError } = await context.supabase
      .from("dataforseo_snapshots")
      .select("payload, request_params, collected_at, possibly_truncated, returned_row_count")
      .eq("tenant_id", tenantId)
      .eq("kind", "backlinks_domain_intersection")
      .order("collected_at", { ascending: false })
      .limit(1);
    if (intersectError) throw new Error(intersectError.message);
    const intersectSnapshot = (intersectRows ?? [])[0] ?? null;
    let linkIntersect: {
      collectedAt: string;
      competitors: string[];
      rows: ReturnType<typeof parseLinkIntersect>["rows"];
      unparsed: number;
      possiblyTruncated: boolean;
    } | null = null;
    if (intersectSnapshot) {
      const params = (intersectSnapshot.request_params ?? {}) as { targets?: unknown };
      const targets =
        params.targets && typeof params.targets === "object"
          ? (params.targets as Record<string, string>)
          : {};
      const items = (intersectSnapshot.payload as { rows?: unknown[] } | null)?.rows ?? [];
      const parsed = parseLinkIntersect(items, targets);
      linkIntersect = {
        collectedAt: intersectSnapshot.collected_at,
        competitors: Object.values(targets),
        rows: parsed.rows,
        unparsed: parsed.unparsed,
        possiblyTruncated: intersectSnapshot.possibly_truncated,
      };
    }

    // The newest registration read and every ownership candidate the two
    // discovery rules have filed, so the operator can decide them here (CODE-27).
    const [whoisRows, candidateRows] = await Promise.all([
      context.supabase
        .from("dataforseo_snapshots")
        .select("collected_at, returned_row_count, request_params")
        .eq("tenant_id", tenantId)
        .eq("kind", "whois_overview")
        .order("collected_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("domain_ownership_candidates")
        .select(
          "id, rule, domain_a, domain_b, matched_fields, review_state, created_at, reviewed_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (whoisRows.error) throw new Error(whoisRows.error.message);
    if (candidateRows.error) throw new Error(candidateRows.error.message);
    const whoisSnapshot = (whoisRows.data ?? [])[0] ?? null;
    const whoisParams = (whoisSnapshot?.request_params ?? null) as {
      filters?: unknown;
    } | null;
    const whoisDomains = Array.isArray(whoisParams?.filters)
      ? (whoisParams.filters as unknown[]).flatMap((filter) =>
          Array.isArray(filter) && filter[0] === "domain" && Array.isArray(filter[2])
            ? (filter[2] as unknown[]).filter((d): d is string => typeof d === "string")
            : [],
        )
      : [];
    const whoisRead = whoisSnapshot
      ? {
          collectedAt: whoisSnapshot.collected_at,
          records: whoisSnapshot.returned_row_count,
          domains: whoisDomains,
        }
      : null;
    const ownershipCandidates = (candidateRows.data ?? []).map((row) => ({
      id: row.id,
      rule: row.rule,
      domainA: row.domain_a,
      domainB: row.domain_b,
      matchedFields: row.matched_fields,
      reviewState: row.review_state,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    }));

    const rows = (data ?? []).map((row) => {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      const pass = (metrics["intelligence_pass"] ?? null) as Record<string, unknown> | null;
      const page = (metrics["page_evidence"] ?? null) as PageEvidenceView | null;
      return {
        id: row.id,
        domain: row.domain,
        domainClass: row.domain_class,
        companyClassification: row.company_classification,
        classificationUpdatedAt: row.classification_updated_at,
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
      linkIntersect,
      whoisRead,
      ownershipCandidates,
    };
  });

/**
 * The operator's decision on an ownership candidate. The two discovery rules
 * file a question, never an assertion; this is the answer, recorded with who
 * gave it and when (CODE-27).
 */
export const reviewOwnershipCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ id: z.string().uuid(), decision: z.enum(OWNERSHIP_REVIEW_DECISIONS) }).parse(value),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { data: updated, error } = await context.supabase
      .from("domain_ownership_candidates")
      .update({
        review_state: data.decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("tenant_id", tenantId)
      .eq("id", data.id)
      .eq("review_state", "pending")
      .select("id, rule, domain_a, domain_b")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      throw new Error("That candidate is not waiting on a decision any more. Refresh the page.");
    }

    const { logActivity } = await import("./os.server");
    await logActivity(context.supabase, {
      tenantId,
      actorKind: "user",
      actorId: context.userId,
      verb: `domain_ownership.${data.decision}`,
      subjectKind: "capability",
      summary: `${updated.domain_a} and ${updated.domain_b}: ${data.decision} as one owner on the ${OWNERSHIP_RULE_LABELS[updated.rule] ?? updated.rule} candidate.`,
      payload: { candidateId: updated.id, rule: updated.rule, decision: data.decision },
    });

    return { id: updated.id, reviewState: data.decision };
  });

export const updateCompanyClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        candidateId: z.string().uuid(),
        classification: z.enum(COMPANY_CLASSIFICATIONS),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    return setCompanyClassification({
      client: context.supabase,
      tenantId,
      actorId: context.userId,
      candidateId: data.candidateId,
      classification: data.classification,
    });
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

    const domains = [...new Set(data.domains.map((domain) => domain.trim().toLowerCase()))];
    const { data: candidates, error: candidateError } = await context.supabase
      .from("competitor_candidates")
      .select("id, domain, metrics")
      .eq("tenant_id", tenantId)
      .eq("review_state", "pending")
      .in("domain", domains);
    if (candidateError) throw new Error(candidateError.message);

    const eligible = (candidates ?? []).filter((row) => {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      const pass = metrics["intelligence_pass"] as Record<string, unknown> | undefined;
      return pass?.["shortlisted"] === true;
    });
    if (eligible.length === 0 || eligible.length !== domains.length) {
      throw new Error(
        "Every selected competitor must be shortlisted and pending for the active tenant.",
      );
    }

    const now = new Date().toISOString();
    const reviewState = data.decision === "approve" ? "approved" : "rejected";

    const { data: updated, error } = await context.supabase
      .from("competitor_candidates")
      .update({ review_state: reviewState, reviewed_by: context.userId, reviewed_at: now })
      .eq("tenant_id", tenantId)
      .eq("review_state", "pending")
      .in(
        "id",
        eligible.map((row) => row.id),
      )
      .select("id, domain");
    if (error) throw new Error(error.message);
    if ((updated ?? []).length !== eligible.length) {
      throw new Error("The competitor selection changed during review. Refresh and try again.");
    }

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
      payload: { domains: domains.slice(0, 50) },
    });

    // Once nothing shortlisted is still pending, the review is finished.
    const { data: pending } = await context.supabase
      .from("competitor_candidates")
      .select("id, metrics")
      .eq("tenant_id", tenantId)
      .eq("review_state", "pending");
    const pendingShortlisted = (pending ?? []).filter((row) => {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      const pass = metrics["intelligence_pass"] as Record<string, unknown> | undefined;
      return Boolean(pass?.["shortlisted"]);
    }).length;

    let inboxResolved = false;
    if (pendingShortlisted === 0) {
      const { data: items } = await context.supabase
        .from("inbox_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("source_module", "competitor-intelligence")
        .is("resolved_at", null);
      const ids = (items ?? []).map((item) => item.id);
      if (ids.length > 0) {
        await context.supabase
          .from("inbox_items")
          .update({ lane: "completed", resolved_at: now })
          .in("id", ids);
        inboxResolved = true;
      }
    } else {
      await context.supabase
        .from("inbox_items")
        .update({
          lane: "pending_approval",
          title: `${pendingShortlisted} competitors shortlisted for review`,
          summary: `${pendingShortlisted} shortlisted competitor candidates are still awaiting an operator decision.`,
          actions: [{ kind: "review", href: "/competitors" }] as never,
        })
        .eq("tenant_id", tenantId)
        .eq("source_module", "competitor-intelligence")
        .is("resolved_at", null);
    }

    return { count: (updated ?? []).length, tracked, pendingShortlisted, inboxResolved };
  });
