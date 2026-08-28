import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validatePageWordingWording } from "./page-wording-proposals";

const id = z.string().uuid();
const editInput = z.object({
  id,
  seoTitle: z.string().min(1).max(200),
  h1: z.string().min(1).max(200),
  rationale: z.string().min(1).max(1200),
});

type RpcResult = { data: unknown; error: { message: string } | null };
type ServiceRpc = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };

export type PageWordingProposalMutationResult = {
  changeRequest: { id: string };
  changed: boolean;
  versionNumber: number | null;
};

export async function serviceRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<PageWordingProposalMutationResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await (supabaseAdmin as unknown as ServiceRpc).rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  const payload =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const change =
    payload["change_request"] &&
    typeof payload["change_request"] === "object" &&
    !Array.isArray(payload["change_request"])
      ? (payload["change_request"] as Record<string, unknown>)
      : {};
  if (typeof change["id"] !== "string") {
    throw new Error("The proposal mutation completed without a readable proposal id.");
  }
  return {
    changeRequest: { id: change["id"] },
    changed: payload["changed"] === true,
    versionNumber: typeof payload["version_number"] === "number" ? payload["version_number"] : null,
  };
}

function liveEvidence(evidence: unknown): { title: string; h1: string } {
  if (!Array.isArray(evidence)) throw new Error("This draft has no readable live-page evidence.");
  const row = evidence.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as Record<string, unknown>)["source"] === "live_page",
  ) as Record<string, unknown> | undefined;
  if (!row || typeof row["title"] !== "string" || typeof row["h1"] !== "string") {
    throw new Error("This draft has no readable live-page title and H1.");
  }
  return { title: row["title"], h1: row["h1"] };
}

export const regeneratePageWordingProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ id }).parse(value))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    const { preparePageWordingProposal } = await import("./page-wording-proposals.server");
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
    if (!row || row["proposal_type"] !== "page_wording" || row["state"] !== "proposed") {
      throw new Error("Only a draft title/H1 proposal can be regenerated.");
    }
    const proposal = await preparePageWordingProposal(
      context.supabase,
      tenantId,
      row.target_url ?? "",
    );
    return serviceRpc("revise_page_wording_proposal", {
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

export const editPageWordingProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => editInput.parse(value))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    const { proveEditedWordingAgainstSource } = await import("./page-wording-proposals.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { data: current, error } = await context.supabase
      .from("change_requests")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = current as Record<string, unknown> | null;
    if (!row || row["proposal_type"] !== "page_wording" || row["state"] !== "proposed") {
      throw new Error("Only a draft title/H1 proposal can be edited.");
    }
    const wording = validatePageWordingWording(data);
    const live = liveEvidence(row["evidence"]);
    const base = row["source_revision_before"];
    if (typeof base !== "string" || !base) throw new Error("This draft has no source baseline.");
    // The edit is proved against the file this draft was drawn from, not against
    // whichever file the wording lane happens to default to.
    const sourceFile = row["source_file"];
    if (typeof sourceFile !== "string" || !sourceFile) {
      throw new Error("This draft records no source file, so an edit cannot be proved against it.");
    }
    const changes = await proveEditedWordingAgainstSource({
      baseRevision: base,
      sourceFile,
      liveTitle: live.title,
      liveH1: live.h1,
      ...wording,
    });
    const contextValue =
      row["generation_context"] &&
      typeof row["generation_context"] === "object" &&
      !Array.isArray(row["generation_context"])
        ? (row["generation_context"] as Record<string, unknown>)
        : {};
    return serviceRpc("revise_page_wording_proposal", {
      _id: data.id,
      _actor: context.userId,
      _revision_kind: "edit",
      _changes: changes,
      _rationale: wording.rationale,
      _evidence: row["evidence"],
      _evidence_summary: row["evidence_summary"],
      _evidence_limitations: row["evidence_limitations"],
      _risk_note: row["risk_note"],
      _generation_context: {
        ...contextValue,
        revisionKind: "edit",
        revisedAt: new Date().toISOString(),
      },
      _source_revision_before: base,
    });
  });
