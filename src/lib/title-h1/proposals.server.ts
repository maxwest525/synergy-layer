import { createHash } from "node:crypto";

import type { GeneratedTitleH1Draft, TitleH1Generator } from "./generator.server";
import { assessTitleH1Evidence } from "./sufficiency";
import type {
  InvestigationReason,
  TitleH1Draft,
  TitleH1EvidenceBundle,
  TitleH1Finding,
} from "./types";
import { validateTitleH1Draft } from "./validation";

export type TitleH1ProposalPayload = {
  kind: "title_h1";
  versionNumber: number;
  targetUrl: string;
  canonicalUrl: string;
  before: { title: string; h1: string };
  after: { title: string; h1: string };
  evidence: TitleH1EvidenceBundle;
  evidenceChecksum: string;
  liveContentChecksum: string;
  draft: TitleH1Draft;
  confidence: number;
  confidenceInputs: Record<string, number>;
  generator: {
    provider: "gemini" | "operator";
    model: string | null;
    requestedAt: string;
    status: number | null;
    usage: Record<string, number> | null;
  };
  creationReason: "initial" | "edit" | "regenerate";
  createdBy: string;
  createdAt: string;
};

export type StoredTitleH1Proposal = {
  id: string;
  findingId: string;
  state: "proposed" | "approved" | "ignored";
  currentVersion: number;
  payload: TitleH1ProposalPayload;
  checksum: string;
  approvedPayload: TitleH1ProposalPayload | null;
  approvedChecksum: string | null;
  approvedVersion: number | null;
};

export type TitleH1ProposalStore = {
  getFinding(id: string): Promise<TitleH1Finding | null>;
  markFindingNeedsInvestigation(id: string, reasons: InvestigationReason[]): Promise<void>;
  createBaseProposal(input: {
    findingId: string;
    actorId: string;
    payload: TitleH1ProposalPayload;
    checksum: string;
  }): Promise<StoredTitleH1Proposal>;
  getProposal(id: string): Promise<StoredTitleH1Proposal | null>;
  replaceCurrent(input: {
    changeRequestId: string;
    actorId: string;
    expectedChecksum: string;
    payload: TitleH1ProposalPayload;
    checksum: string;
    reason: "edit" | "regenerate";
  }): Promise<StoredTitleH1Proposal>;
  ignoreProposal(id: string, actorId: string): Promise<StoredTitleH1Proposal>;
  approveProposal(input: {
    changeRequestId: string;
    actorId: string;
    expectedChecksum: string;
  }): Promise<StoredTitleH1Proposal>;
};

type Dependencies = {
  store: TitleH1ProposalStore;
  collectEvidence(finding: TitleH1Finding): Promise<TitleH1EvidenceBundle>;
  generator: TitleH1Generator;
  now?: () => string;
};

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function proposalPayload(input: {
  evidence: TitleH1EvidenceBundle;
  generated: GeneratedTitleH1Draft;
  validation: ReturnType<typeof validateTitleH1Draft> & { valid: true };
  versionNumber: number;
  reason: "initial" | "edit" | "regenerate";
  actorId: string;
  now: string;
}): TitleH1ProposalPayload {
  const currentTitle = input.evidence.live.title;
  const currentH1 = input.evidence.live.h1s[0];
  if (!currentTitle || !currentH1) throw new Error("Validated evidence lost its title or H1.");
  return {
    kind: "title_h1",
    versionNumber: input.versionNumber,
    targetUrl: input.evidence.finding.targetUrl,
    canonicalUrl: input.evidence.live.finalUrl,
    before: { title: currentTitle, h1: currentH1 },
    after: {
      title: input.generated.draft.proposedTitle,
      h1: input.generated.draft.proposedH1,
    },
    evidence: input.evidence,
    evidenceChecksum: checksum(input.evidence),
    liveContentChecksum: input.evidence.live.contentChecksum,
    draft: input.generated.draft,
    confidence: input.validation.confidence,
    confidenceInputs: input.validation.confidenceInputs,
    generator: {
      provider: input.generated.provider,
      model: input.generated.model,
      requestedAt: input.generated.requestedAt,
      status: input.generated.status,
      usage: input.generated.usage,
    },
    creationReason: input.reason,
    createdBy: input.actorId,
    createdAt: input.now,
  };
}

function operatorGenerated(
  current: TitleH1ProposalPayload,
  values: { proposedTitle: string; proposedH1: string },
  now: string,
): GeneratedTitleH1Draft {
  return {
    draft: { ...current.draft, ...values },
    provider: "operator",
    model: "operator-edit",
    requestedAt: now,
    status: 200,
    usage: null,
  };
}

export function createTitleH1ProposalService(deps: Dependencies) {
  const now = deps.now ?? (() => new Date().toISOString());

  async function requireProposal(id: string): Promise<StoredTitleH1Proposal> {
    const proposal = await deps.store.getProposal(id);
    if (!proposal) throw new Error("That title/H1 proposal is not available.");
    if (proposal.state !== "proposed") throw new Error("Only a proposed change can be modified.");
    return proposal;
  }

  async function validateGenerated(
    evidence: TitleH1EvidenceBundle,
    generated: GeneratedTitleH1Draft,
  ) {
    return validateTitleH1Draft(evidence, generated.draft);
  }

  return {
    async generate(findingId: string, actorId: string) {
      const finding = await deps.store.getFinding(findingId);
      if (!finding) throw new Error("That finding is not available.");
      const evidence = await deps.collectEvidence(finding);
      const sufficiency = assessTitleH1Evidence(evidence);
      if (!sufficiency.eligible) {
        await deps.store.markFindingNeedsInvestigation(findingId, sufficiency.reasons);
        return {
          created: false as const,
          status: "needs_investigation" as const,
          reasons: sufficiency.reasons,
        };
      }

      const generated = await deps.generator.generate(evidence);
      const validation = await validateGenerated(evidence, generated);
      if (!validation.valid) {
        const reasons = [
          {
            code: "validation_failed" as const,
            message: validation.errors.map((error) => `${error.code}: ${error.message}`).join(" "),
          },
        ];
        await deps.store.markFindingNeedsInvestigation(findingId, reasons);
        return { created: false as const, status: "needs_investigation" as const, reasons };
      }

      const payload = proposalPayload({
        evidence,
        generated,
        validation,
        versionNumber: 0,
        reason: "initial",
        actorId,
        now: now(),
      });
      const proposal = await deps.store.createBaseProposal({
        findingId,
        actorId,
        payload,
        checksum: checksum(payload),
      });
      return { created: true as const, proposal };
    },

    async edit(
      changeRequestId: string,
      actorId: string,
      values: { proposedTitle: string; proposedH1: string },
    ) {
      const current = await requireProposal(changeRequestId);
      const generated = operatorGenerated(current.payload, values, now());
      const validation = await validateGenerated(current.payload.evidence, generated);
      if (!validation.valid) {
        throw new Error(
          `Proposal validation failed: ${validation.errors.map((row) => row.code).join(", ")}.`,
        );
      }
      const payload = proposalPayload({
        evidence: current.payload.evidence,
        generated,
        validation,
        versionNumber: current.currentVersion + 1,
        reason: "edit",
        actorId,
        now: now(),
      });
      return deps.store.replaceCurrent({
        changeRequestId,
        actorId,
        expectedChecksum: current.checksum,
        payload,
        checksum: checksum(payload),
        reason: "edit",
      });
    },

    async regenerate(changeRequestId: string, actorId: string) {
      const current = await requireProposal(changeRequestId);
      const finding = await deps.store.getFinding(current.findingId);
      if (!finding) throw new Error("The proposal's source finding is not available.");
      const evidence = await deps.collectEvidence(finding);
      const sufficiency = assessTitleH1Evidence(evidence);
      if (!sufficiency.eligible) {
        await deps.store.markFindingNeedsInvestigation(finding.id, sufficiency.reasons);
        throw new Error("Needs investigation before this proposal can be regenerated.");
      }
      const generated = await deps.generator.generate(evidence);
      const validation = await validateGenerated(evidence, generated);
      if (!validation.valid) {
        throw new Error(
          `Proposal validation failed: ${validation.errors.map((row) => row.code).join(", ")}.`,
        );
      }
      const payload = proposalPayload({
        evidence,
        generated,
        validation,
        versionNumber: current.currentVersion + 1,
        reason: "regenerate",
        actorId,
        now: now(),
      });
      return deps.store.replaceCurrent({
        changeRequestId,
        actorId,
        expectedChecksum: current.checksum,
        payload,
        checksum: checksum(payload),
        reason: "regenerate",
      });
    },

    async ignore(changeRequestId: string, actorId: string) {
      await requireProposal(changeRequestId);
      return deps.store.ignoreProposal(changeRequestId, actorId);
    },

    async approve(changeRequestId: string, actorId: string, expectedChecksum: string) {
      await requireProposal(changeRequestId);
      return deps.store.approveProposal({ changeRequestId, actorId, expectedChecksum });
    },
  };
}
