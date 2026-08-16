import { describe, expect, it, vi } from "vitest";

import type { GeneratedTitleH1Draft } from "./generator.server";
import {
  createTitleH1ProposalService,
  type StoredTitleH1Proposal,
  type TitleH1ProposalStore,
} from "./proposals.server";
import type { TitleH1Draft, TitleH1EvidenceBundle, TitleH1Finding } from "./types";

function finding(): TitleH1Finding {
  return {
    id: "finding-1",
    rule: "high_impression_low_ctr",
    targetKind: "page",
    targetUrl: "https://trumoveinc.com/long-distance-moving",
    thresholdSatisfied: true,
    observedAt: "2026-08-10T12:00:00.000Z",
    sourceChecksum: "finding-checksum",
  };
}

function evidence(): TitleH1EvidenceBundle {
  return {
    finding: finding(),
    live: {
      requestedUrl: finding().targetUrl,
      finalUrl: finding().targetUrl,
      allowlisted: true,
      title: "Long-Distance Moving Services | TruMove",
      h1s: ["Long-Distance Moving Services"],
      mainText: "TruMove coordinates long-distance moving services for household moves.",
      observedAt: "2026-08-10T12:05:00.000Z",
      contentChecksum: "live-checksum",
    },
    gsc: {
      pageUrl: finding().targetUrl,
      currentPeriod: { start: "2026-08-03", end: "2026-08-09" },
      comparisonPeriod: null,
      rows: [
        { query: "long distance movers", clicks: 3, impressions: 250, ctr: 0.012, position: 7 },
      ],
      observedAt: "2026-08-10T12:10:00.000Z",
      sourceChecksum: "gsc-checksum",
    },
    competitors: [
      {
        query: "long distance movers",
        domain: "competitor.example",
        title: "Long Distance Movers",
        h1: "Long Distance Moving",
        observedAt: "2026-08-09T12:00:00.000Z",
        sourceChecksum: "competitor-checksum",
        provider: "dataforseo",
      },
    ],
    ga4: null,
    previousChanges: [],
  };
}

function generated(overrides: Partial<TitleH1Draft> = {}): GeneratedTitleH1Draft {
  return {
    draft: {
      proposedTitle: "Long Distance Movers & Moving Services | TruMove",
      proposedH1: "Long-Distance Movers for Household Moves",
      rationale: "Aligns the page with the observed query.",
      expectedMetric: "ctr",
      confidenceRationale: "All proposal sources agree.",
      verification: "Compare finalized page-level Search Console windows.",
      reversal: "Restore the captured title and H1.",
      claims: ["long-distance moving services", "household moves"],
      ...overrides,
    },
    provider: "gemini",
    model: "configured-model",
    requestedAt: "2026-08-10T12:15:00.000Z",
    status: 200,
    usage: { totalTokenCount: 140 },
  };
}

function memoryStore() {
  const findings = new Map([["finding-1", finding()]]);
  const proposals = new Map<string, StoredTitleH1Proposal>();
  const versions: { changeRequestId: string; versionNumber: number; reason: string }[] = [];
  const needsInvestigation: unknown[] = [];
  let inboxItems = 0;

  const store: TitleH1ProposalStore = {
    async getFinding(id) {
      return findings.get(id) ?? null;
    },
    async markFindingNeedsInvestigation(id, reasons) {
      needsInvestigation.push({ id, reasons });
    },
    async createBaseProposal(input) {
      const proposal: StoredTitleH1Proposal = {
        id: "change-1",
        findingId: input.findingId,
        state: "proposed",
        currentVersion: 0,
        payload: input.payload,
        checksum: input.checksum,
        approvedPayload: null,
        approvedChecksum: null,
        approvedVersion: null,
      };
      proposals.set(proposal.id, proposal);
      inboxItems += 1;
      return proposal;
    },
    async getProposal(id) {
      return proposals.get(id) ?? null;
    },
    async replaceCurrent(input) {
      const current = proposals.get(input.changeRequestId)!;
      if (current.checksum !== input.expectedChecksum)
        throw new Error("Proposal changed; refresh.");
      const next = {
        ...current,
        currentVersion: current.currentVersion + 1,
        payload: input.payload,
        checksum: input.checksum,
      };
      versions.push({
        changeRequestId: current.id,
        versionNumber: next.currentVersion,
        reason: input.reason,
      });
      proposals.set(current.id, next);
      return next;
    },
    async ignoreProposal(id) {
      const current = proposals.get(id)!;
      proposals.set(id, { ...current, state: "ignored" });
      return proposals.get(id)!;
    },
    async approveProposal(input) {
      const current = proposals.get(input.changeRequestId)!;
      if (current.state !== "proposed" || current.checksum !== input.expectedChecksum) {
        throw new Error("Proposal changed; refresh before approving.");
      }
      const approved = {
        ...current,
        state: "approved" as const,
        approvedPayload: structuredClone(current.payload),
        approvedChecksum: current.checksum,
        approvedVersion: current.currentVersion,
      };
      proposals.set(current.id, approved);
      return approved;
    },
  };

  return {
    store,
    findings,
    proposals,
    versions,
    needsInvestigation,
    get inboxItems() {
      return inboxItems;
    },
  };
}

describe("title/H1 proposal lifecycle", () => {
  it("keeps insufficient evidence on the finding and never calls the generator", async () => {
    const memory = memoryStore();
    const incomplete = evidence();
    incomplete.competitors = [];
    const generator = { generate: vi.fn(async () => generated()) };
    const service = createTitleH1ProposalService({
      store: memory.store,
      collectEvidence: vi.fn(async () => incomplete),
      generator,
    });

    const result = await service.generate("finding-1", "operator-1");

    expect(result).toMatchObject({ created: false, status: "needs_investigation" });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(memory.needsInvestigation).toHaveLength(1);
    expect(memory.inboxItems).toBe(0);
  });

  it("creates one base proposal with no version row and one Action Center item", async () => {
    const memory = memoryStore();
    const service = createTitleH1ProposalService({
      store: memory.store,
      collectEvidence: vi.fn(async () => evidence()),
      generator: { generate: vi.fn(async () => generated()) },
    });

    const result = await service.generate("finding-1", "operator-1");

    expect(result).toMatchObject({ created: true, proposal: { currentVersion: 0 } });
    expect(memory.versions).toHaveLength(0);
    expect(memory.inboxItems).toBe(1);
  });

  it("creates immutable version numbers for edit and regenerate", async () => {
    const memory = memoryStore();
    const generator = { generate: vi.fn(async () => generated()) };
    const service = createTitleH1ProposalService({
      store: memory.store,
      collectEvidence: vi.fn(async () => evidence()),
      generator,
    });
    const created = await service.generate("finding-1", "operator-1");
    if (!created.created) throw new Error("expected proposal");

    await service.edit(created.proposal.id, "operator-1", {
      proposedTitle: "Long Distance Moving Company Services | TruMove",
      proposedH1: "Long-Distance Moving Company for Household Moves",
    });
    generator.generate.mockResolvedValueOnce(
      generated({
        proposedTitle: "Household Long Distance Movers | TruMove",
        proposedH1: "Household Long-Distance Moving Services",
      }),
    );
    const regenerated = await service.regenerate(created.proposal.id, "operator-1");

    expect(regenerated).toMatchObject({ currentVersion: 2 });
    expect(memory.versions).toEqual([
      { changeRequestId: "change-1", versionNumber: 1, reason: "edit" },
      { changeRequestId: "change-1", versionNumber: 2, reason: "regenerate" },
    ]);
  });

  it("leaves the valid payload untouched when an edit fails validation", async () => {
    const memory = memoryStore();
    const service = createTitleH1ProposalService({
      store: memory.store,
      collectEvidence: vi.fn(async () => evidence()),
      generator: { generate: vi.fn(async () => generated()) },
    });
    const created = await service.generate("finding-1", "operator-1");
    if (!created.created) throw new Error("expected proposal");
    const checksum = created.proposal.checksum;

    await expect(
      service.edit(created.proposal.id, "operator-1", {
        proposedTitle: "Guaranteed Best Dallas Movers | TruMove",
        proposedH1: "Guaranteed Best Dallas Office Movers",
      }),
    ).rejects.toThrow("Proposal validation failed");
    expect(memory.proposals.get(created.proposal.id)?.checksum).toBe(checksum);
    expect(memory.versions).toHaveLength(0);
  });

  it("locks the exact checksum and refuses stale approval", async () => {
    const memory = memoryStore();
    const service = createTitleH1ProposalService({
      store: memory.store,
      collectEvidence: vi.fn(async () => evidence()),
      generator: { generate: vi.fn(async () => generated()) },
    });
    const created = await service.generate("finding-1", "operator-1");
    if (!created.created) throw new Error("expected proposal");

    await expect(service.approve(created.proposal.id, "operator-1", "stale")).rejects.toThrow(
      "Proposal changed",
    );
    const approved = await service.approve(
      created.proposal.id,
      "operator-1",
      created.proposal.checksum,
    );
    expect(approved).toMatchObject({
      state: "approved",
      approvedChecksum: created.proposal.checksum,
      approvedVersion: 0,
      approvedPayload: created.proposal.payload,
    });
  });

  it("ignores the proposal without deleting its finding", async () => {
    const memory = memoryStore();
    const service = createTitleH1ProposalService({
      store: memory.store,
      collectEvidence: vi.fn(async () => evidence()),
      generator: { generate: vi.fn(async () => generated()) },
    });
    const created = await service.generate("finding-1", "operator-1");
    if (!created.created) throw new Error("expected proposal");

    expect(await service.ignore(created.proposal.id, "operator-1")).toMatchObject({
      state: "ignored",
    });
    expect(memory.findings.has("finding-1")).toBe(true);
  });
});
