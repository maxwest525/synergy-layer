import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthorityQueryClass } from "../authority/types";
import { requireProposalTarget } from "../title-h1-proposals";
import { canonicalSeoRunTarget, maxSeoRunBatchSize } from "./batch";
import { describeSeoRunFailure } from "./failure";

const createInput = z.object({
  targetUrl: z.string().url().max(500),
  queryClass: z
    .enum(["community", "local_service", "professional_b2b", "ymyl", "general"])
    .default("local_service"),
  idempotencyKey: z.string().uuid(),
});
const runInput = z.object({ id: z.string().uuid() });
const createBatchInput = z.object({
  targets: z
    .array(
      z.object({
        targetUrl: z.string().url().max(500),
        idempotencyKey: z.string().uuid(),
      }),
    )
    .min(1)
    .max(maxSeoRunBatchSize),
  queryClass: z
    .enum(["community", "local_service", "professional_b2b", "ymyl", "general"])
    .default("local_service"),
});

export const getSeoRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireTenantId } = await import("../tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const { data, error } = await context.supabase
      .from("seo_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSeoRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => runInput.parse(value))
  .handler(async ({ data, context }) => {
    const { requireTenantId } = await import("../tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const [runResult, eventsResult] = await Promise.all([
      context.supabase
        .from("seo_runs")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", data.id)
        .single(),
      context.supabase
        .from("seo_run_events")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("run_id", data.id)
        .order("occurred_at", { ascending: true }),
    ]);
    if (runResult.error) throw new Error(runResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    return { run: runResult.data, events: eventsResult.data ?? [] };
  });

export const createSeoRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => createBatchInput.parse(value))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { requireTenantId } = await import("../tenant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const targets = data.targets.map((target) => ({
      ...target,
      targetUrl: requireProposalTarget(target.targetUrl),
    }));
    const unique = new Set(targets.map((target) => canonicalSeoRunTarget(target.targetUrl)));
    if (unique.size !== targets.length)
      throw new Error("Each page may appear only once per batch.");

    const { data: runs, error } = await supabaseAdmin
      .from("seo_runs")
      .insert(
        targets.map((target) => ({
          tenant_id: tenantId,
          target_url: target.targetUrl,
          query_class: data.queryClass,
          idempotency_key: target.idempotencyKey,
          created_by: context.userId,
        })),
      )
      .select("*");
    if (error) throw new Error(error.message);
    if (!runs || runs.length !== targets.length) {
      throw new Error("The complete SEO run batch was not created.");
    }

    const { error: eventError } = await supabaseAdmin.from("seo_run_events").insert(
      runs.map((run) => ({
        tenant_id: tenantId,
        run_id: run.id,
        event_key: "run_created",
        state: "draft",
        summary: "SEO run created. No proposal has been generated or approved.",
        actor_id: context.userId,
        payload: { batch_size: runs.length },
      })),
    );
    if (eventError) {
      const ids = runs.map((run) => run.id);
      const { error: rollbackError } = await supabaseAdmin
        .from("seo_runs")
        .delete()
        .eq("tenant_id", tenantId)
        .in("id", ids);
      if (rollbackError) {
        throw new Error("SEO run drafts were created, but their timeline could not be recorded.");
      }
      throw new Error(eventError.message);
    }
    return runs;
  });

export const createSeoRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => createInput.parse(value))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { requireTenantId } = await import("../tenant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { data: run, error } = await supabaseAdmin
      .from("seo_runs")
      .upsert(
        {
          tenant_id: tenantId,
          target_url: requireProposalTarget(data.targetUrl),
          query_class: data.queryClass,
          idempotency_key: data.idempotencyKey,
          created_by: context.userId,
        },
        { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true },
      )
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (run) {
      const { error: eventError } = await supabaseAdmin.from("seo_run_events").upsert(
        {
          tenant_id: tenantId,
          run_id: run.id,
          event_key: "run_created",
          state: "draft",
          summary: "SEO run created. No proposal has been generated or approved.",
          actor_id: context.userId,
        },
        { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
      );
      if (eventError) throw new Error(eventError.message);
      return run;
    }
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("seo_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("idempotency_key", data.idempotencyKey)
      .single();
    if (existingError) throw new Error(existingError.message);
    return existing;
  });

export const evaluateSeoRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => runInput.parse(value))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { requireTenantId } = await import("../tenant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assessSeoPreflight } = await import("./orchestrator.server");
    const { evaluateAuthorityForTarget } = await import("../authority/evaluate.server");
    const { prepareTitleH1Proposal } = await import("../title-h1-proposals.server");
    const { serviceRpc } = await import("../title-h1-proposals.functions");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { data: run, error: runError } = await supabaseAdmin
      .from("seo_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", data.id)
      .single();
    if (runError) throw new Error(runError.message);
    if (run.change_request_id) return run;

    const [connectionsResult, gscResult, dfsResult] = await Promise.all([
      context.supabase.from("tenant_connections").select("*").eq("tenant_id", tenantId),
      context.supabase
        .from("search_console_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      context.supabase
        .from("dataforseo_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ]);
    if (connectionsResult.error) throw new Error(connectionsResult.error.message);
    if (gscResult.error) throw new Error(gscResult.error.message);
    if (dfsResult.error) throw new Error(dfsResult.error.message);
    const connectorSnapshot = (connectionsResult.data ?? []).map((row) => {
      const config =
        row.config && typeof row.config === "object" && !Array.isArray(row.config)
          ? (row.config as Record<string, unknown>)
          : {};
      return {
        capabilityKey: row.capability_key,
        integrationState: row.integration_state,
        health: row.health,
        probeOutcome: typeof config["probe_outcome"] === "string" ? config["probe_outcome"] : null,
      };
    });
    const evidenceSnapshot = {
      searchConsoleRows: gscResult.count ?? 0,
      dataForSeoSnapshots: dfsResult.count ?? 0,
    };
    const preflight = assessSeoPreflight(connectorSnapshot, evidenceSnapshot);
    if (!preflight.ready) {
      const { error } = await supabaseAdmin
        .from("seo_runs")
        .update({
          state: "preflight_blocked",
          connector_snapshot: connectorSnapshot,
          evidence_snapshot: evidenceSnapshot,
          failure_reason: null,
        })
        .eq("tenant_id", tenantId)
        .eq("id", run.id);
      if (error) throw new Error(error.message);
      const { error: eventError } = await supabaseAdmin.from("seo_run_events").upsert(
        {
          tenant_id: tenantId,
          run_id: run.id,
          event_key: `preflight:${run.idempotency_key}`,
          state: "preflight_blocked",
          summary: "Preflight blocked the run. No proposal, approval, or execution occurred.",
          payload: preflight,
          actor_id: context.userId,
        },
        { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
      );
      if (eventError) throw new Error(eventError.message);
      return {
        ...run,
        state: "preflight_blocked" as const,
        connector_snapshot: connectorSnapshot,
        evidence_snapshot: evidenceSnapshot,
        preflight,
      };
    }

    try {
      const authority = await evaluateAuthorityForTarget(
        context.supabase,
        tenantId,
        run.target_url,
        run.query_class as AuthorityQueryClass,
      );
      const proposal = await prepareTitleH1Proposal(context.supabase, tenantId, run.target_url);
      const created = await serviceRpc("create_title_h1_proposal", {
        _tenant_id: tenantId,
        _actor: context.userId,
        _idempotency_key: `seo-run:${run.idempotency_key}`,
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
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("seo_runs")
        .update({
          state: "awaiting_approval",
          connector_snapshot: connectorSnapshot,
          evidence_snapshot: evidenceSnapshot,
          knowledge_chunk_ids: authority.evidence.knowledgeChunkIds,
          authority_finding_ids: authority.persisted.map((finding) => finding.id),
          change_request_id: created.changeRequest.id,
          started_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("tenant_id", tenantId)
        .eq("id", run.id)
        .select("*")
        .single();
      if (updateError) throw new Error(updateError.message);
      const { error: eventError } = await supabaseAdmin.from("seo_run_events").upsert(
        {
          tenant_id: tenantId,
          run_id: run.id,
          event_key: `proposal:${created.changeRequest.id}`,
          state: "awaiting_approval",
          summary:
            "Evidence and Authority Science produced a concrete proposal awaiting operator approval.",
          payload: {
            change_request_id: created.changeRequest.id,
            authority_finding_ids: authority.persisted.map((finding) => finding.id),
            knowledge_chunk_ids: authority.evidence.knowledgeChunkIds,
          },
          actor_id: context.userId,
        },
        { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
      );
      if (eventError) throw new Error(eventError.message);
      return { ...updated, preflight };
    } catch (error) {
      const failureReason = describeSeoRunFailure(error);
      const { error: updateError } = await supabaseAdmin
        .from("seo_runs")
        .update({
          state: "failed",
          connector_snapshot: connectorSnapshot,
          evidence_snapshot: evidenceSnapshot,
          failure_reason: failureReason,
        })
        .eq("tenant_id", tenantId)
        .eq("id", run.id);
      if (updateError) throw new Error(updateError.message);
      const { error: eventError } = await supabaseAdmin.from("seo_run_events").insert({
        tenant_id: tenantId,
        run_id: run.id,
        event_key: `failure:${crypto.randomUUID()}`,
        state: "failed",
        summary: failureReason,
        actor_id: context.userId,
      });
      if (eventError) throw new Error(eventError.message);
      throw new Error(failureReason);
    }
  });
