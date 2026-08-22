import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  scope: z.enum(["page", "site"]),
  /** The audit check this fix answers. Omitted when a page is worked directly. */
  check: z.string().min(1).max(80).optional(),
  targetUrl: z.string().url().max(500).optional(),
  idempotencyKey: z.string().uuid(),
});

export type AuditFixResult = { changeRequest: { id: string }; changed: boolean };

/**
 * The one action behind every audit finding. Page wording, page metadata and
 * site crawl directives all come through here: the finding decides which
 * governed change kind writes the fix, and the operator still approves it.
 */
export const proposeAuditFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data, context }): Promise<AuditFixResult> => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    const { fixTargetForPageCheck, fixTargetForSiteCheck } = await import("./audit-fixes");
    const { fileGovernedProposal, prepareSiteFixProposal } = await import("./audit-fixes.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);

    if (data.scope === "site") {
      if (!data.check || !fixTargetForSiteCheck(data.check)) {
        throw new Error("That finding has no governed fix yet, so it stays a manual fix.");
      }
      const proposal = await prepareSiteFixProposal(
        context.supabase,
        tenantId,
        data.check as Parameters<typeof prepareSiteFixProposal>[2],
      );
      return fileGovernedProposal({
        tenantId,
        actorId: context.userId,
        idempotencyKey: `audit:${data.check ?? "page"}:${data.idempotencyKey}`,
        proposal,
      });
    }

    const target = data.check
      ? fixTargetForPageCheck(data.check)
      : { changeKind: "service.title_h1" as const };
    if (!target || !data.targetUrl) {
      throw new Error("That finding has no governed fix yet, so it stays a manual fix.");
    }

    // A description defect is a snippet problem, not a heading problem. Sending
    // it down the title/H1 lane would draft the wrong field and the operator
    // would approve a change that never answers the finding.
    if (target.changeKind === "page.metadata") {
      const { preparePageMetadataProposal } = await import("./page-metadata-proposals.server");
      const { fileGovernedProposal } = await import("./audit-fixes.server");
      // An audit finding is a defect the audit already observed on the rendered
      // page, so the rendered page is what justifies removing it. Demanding
      // impressions from a page whose broken metadata is the reason it has none
      // refuses every page that most needs the fix.
      const proposal = await preparePageMetadataProposal(
        context.supabase,
        tenantId,
        data.targetUrl,
        {
          evidenceMode: "defect",
        },
      );
      return fileGovernedProposal({
        tenantId,
        actorId: context.userId,
        idempotencyKey: `audit:${data.check ?? "page"}:${data.idempotencyKey}`,
        proposal,
      });
    }

    const { prepareTitleH1Proposal } = await import("./title-h1-proposals.server");
    const { serviceRpc } = await import("./title-h1-proposals.functions");
    const proposal = await prepareTitleH1Proposal(context.supabase, tenantId, data.targetUrl, {
      wordingMode: "gemini",
      evidenceMode: "defect",
    });
    const result = await serviceRpc("create_title_h1_proposal", {
      _tenant_id: tenantId,
      _actor: context.userId,
      _idempotency_key: `audit:${data.check ?? "page"}:${data.idempotencyKey}`,
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
    return { changeRequest: result.changeRequest, changed: result.changed };
  });
