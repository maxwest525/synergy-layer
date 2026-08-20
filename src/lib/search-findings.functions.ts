import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FindingEntry = {
  id: string;
  rule: string;
  target: string;
  periodEndPt: string;
  createdAt: string;
  recommendationId: string | null;
  recommendationTitle: string | null;
  recommendationState: string | null;
};

export type FindingsSummary = {
  findings: FindingEntry[];
  countsByRule: Record<string, number>;
  inspectionCoverage: {
    urlsInspected: number;
    notIndexed: number;
    canonicalMismatch: number;
    staleCrawl: number;
  };
};

/**
 * What the rules engine found and what the inspection sweep knows, for the
 * operator-facing findings panel. Reads stored rows only.
 */
export const getSearchFindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FindingsSummary> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const client = context.supabase;

    const [observationResult, inspectionResult] = await Promise.all([
      client
        .from("search_console_observations")
        .select(
          "id, rule, target, period_end_pt, created_at, recommendation_id, recommendations(id, title, state)",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      client
        .from("search_console_url_inspections")
        .select(
          "inspected_url, verdict, google_canonical, user_canonical, last_crawl_time, inspected_at",
        )
        .eq("tenant_id", tenantId)
        .order("inspected_at", { ascending: false })
        .limit(500),
    ]);
    if (observationResult.error) {
      throw new Error(`Rule findings could not be read: ${observationResult.error.message}`);
    }
    if (inspectionResult.error) {
      throw new Error(`Inspection coverage could not be read: ${inspectionResult.error.message}`);
    }

    const findings: FindingEntry[] = (observationResult.data ?? []).map((row) => {
      const recommendation = Array.isArray(row.recommendations)
        ? (row.recommendations[0] ?? null)
        : (row.recommendations ?? null);
      return {
        id: row.id,
        rule: row.rule,
        target: row.target,
        periodEndPt: row.period_end_pt,
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

    const latestByUrl = new Map<
      string,
      {
        verdict: string;
        googleCanonical: string | null;
        userCanonical: string | null;
        lastCrawlTime: string | null;
      }
    >();
    for (const row of inspectionResult.data ?? []) {
      if (!latestByUrl.has(row.inspected_url)) {
        latestByUrl.set(row.inspected_url, {
          verdict: row.verdict,
          googleCanonical: row.google_canonical,
          userCanonical: row.user_canonical,
          lastCrawlTime: row.last_crawl_time,
        });
      }
    }
    const staleCutoff = Date.now() - 30 * 86_400_000;
    let notIndexed = 0;
    let canonicalMismatch = 0;
    let staleCrawl = 0;
    for (const entry of latestByUrl.values()) {
      if (entry.verdict !== "PASS") notIndexed += 1;
      else if (
        entry.googleCanonical &&
        entry.userCanonical &&
        entry.googleCanonical !== entry.userCanonical
      )
        canonicalMismatch += 1;
      else if (entry.lastCrawlTime && new Date(entry.lastCrawlTime).getTime() < staleCutoff)
        staleCrawl += 1;
    }

    return {
      findings,
      countsByRule,
      inspectionCoverage: {
        urlsInspected: latestByUrl.size,
        notIndexed,
        canonicalMismatch,
        staleCrawl,
      },
    };
  });

const proposeInput = z.object({
  recommendationId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export type FindingFixResult = { changeRequest: { id: string }; changed: boolean };

/**
 * The bridge from a rule finding to the governed execution pipeline: resolve
 * the page the finding points at, run the evidence-gated proposal generator,
 * and link the resulting change request back to the recommendation. The
 * operator still approves on /changes/$id; nothing here writes to the site.
 * Costs one Firecrawl render and one Gemini call per invocation, so it only
 * runs from an explicit operator click.
 */
export const proposeFixFromFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => proposeInput.parse(value))
  .handler(async ({ data, context }): Promise<FindingFixResult> => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    const { deriveFixTarget } = await import("./finding-fix-target");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const client = context.supabase;

    const { data: recommendation, error: recError } = await client
      .from("recommendations")
      .select("id, title, metadata, suggested_action")
      .eq("id", data.recommendationId)
      .single();
    if (recError) throw new Error(`The finding could not be read: ${recError.message}`);

    const action = (recommendation.suggested_action ?? {}) as Record<string, unknown>;
    const metadata = (recommendation.metadata ?? {}) as Record<string, unknown>;
    const rule = typeof action["rule"] === "string" ? (action["rule"] as string) : "";
    const target = typeof action["target"] === "string" ? (action["target"] as string) : "";
    const property =
      typeof metadata["property"] === "string" ? (metadata["property"] as string) : "";
    if (!rule || !target) {
      throw new Error("This recommendation carries no rule finding, so there is nothing to draft.");
    }

    let pageQueryRows: Array<{ keys?: string[]; impressions: number }> = [];
    if (property) {
      const { data: snapshot, error: snapshotError } = await client
        .from("search_console_snapshots")
        .select("payload")
        .eq("property", property)
        .eq("kind", "page_query")
        .order("period_end_pt", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapshotError) {
        throw new Error(`Stored page+query evidence could not be read: ${snapshotError.message}`);
      }
      const payload = (snapshot?.payload ?? {}) as { rows?: typeof pageQueryRows };
      pageQueryRows = payload.rows ?? [];
    }

    const fixTarget = deriveFixTarget(rule, target, pageQueryRows);
    if (!fixTarget.ok) throw new Error(fixTarget.reason);

    const { prepareTitleH1Proposal } = await import("./title-h1-proposals.server");
    const { serviceRpc } = await import("./title-h1-proposals.functions");
    const proposal = await prepareTitleH1Proposal(client, tenantId, fixTarget.url, {
      wordingMode: "gemini",
    });
    const result = await serviceRpc("create_title_h1_proposal", {
      _tenant_id: tenantId,
      _actor: context.userId,
      _idempotency_key: `finding:${data.recommendationId}`,
      _target_url: proposal.targetUrl,
      _title: proposal.title,
      _changes: proposal.changes,
      _rationale: proposal.rationale,
      _evidence: proposal.evidence,
      _evidence_summary: proposal.evidenceSummary,
      _evidence_limitations: proposal.evidenceLimitations,
      _risk_note: proposal.riskNote,
      _generation_context: proposal.generationContext,
      _source_repo: proposal.sourceRepo,
      _source_branch: proposal.sourceBranch,
      _source_file: proposal.sourceFile,
      _source_project_id: proposal.sourceProjectId,
      _source_revision_before: proposal.sourceRevisionBefore,
    });

    // Link the change request back to the finding that motivated it. The
    // column exists for exactly this; only fill it while it is still empty.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: linkError } = await supabaseAdmin
      .from("change_requests")
      .update({ recommendation_id: data.recommendationId })
      .eq("id", result.changeRequest.id)
      .is("recommendation_id", null);
    if (linkError) {
      throw new Error(
        `The proposal was created (${result.changeRequest.id}) but linking it to the finding failed: ${linkError.message}`,
      );
    }

    return { changeRequest: result.changeRequest, changed: result.changed };
  });
