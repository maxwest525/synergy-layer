import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serviceRpc } from "./page-wording-proposals.functions";

const id = z.string().uuid();

/**
 * Redrafts a page-metadata proposal in place. The wording lane has had this
 * since 08-14; the description lane could only be rejected and drafted again
 * from its finding (CODE-4). The redraft is held to the same evidence mode the
 * draft was filed under, so a defect-mode draft is not suddenly refused for
 * lacking impressions, and it lands as an immutable revision through the
 * service-role function that accepts only this lane.
 */
export const regeneratePageMetadataProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ id }).parse(value))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    const { preparePageMetadataProposal } = await import("./page-metadata-proposals.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { data: current, error } = await context.supabase
      .from("change_requests")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = current as (Record<string, unknown> & { target_url?: string }) | null;
    if (!row || row["proposal_type"] !== "page_metadata" || row["state"] !== "proposed") {
      throw new Error("Only a draft meta description proposal can be regenerated.");
    }
    const generation = row["generation_context"] as Record<string, unknown> | null;
    const evidenceMode = generation?.["evidenceMode"] === "defect" ? "defect" : "wording";
    const proposal = await preparePageMetadataProposal(
      context.supabase,
      tenantId,
      row.target_url ?? "",
      { evidenceMode },
    );
    return serviceRpc("revise_page_metadata_proposal", {
      _id: data.id,
      _actor: context.userId,
      _revision_kind: "regenerate",
      _changes: proposal.changes,
      _rationale: proposal.rationale,
      _evidence: proposal.evidence,
      _evidence_summary: proposal.evidenceSummary,
      _evidence_limitations: proposal.evidenceLimitations,
      _risk_note: proposal.riskNote,
      _generation_context: proposal.generationContext,
      _source_revision_before: proposal.sourceRevisionBefore,
    });
  });
