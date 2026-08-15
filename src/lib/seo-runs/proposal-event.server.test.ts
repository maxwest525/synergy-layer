import { describe, expect, it, vi } from "vitest";

import {
  reconcileSeoRunProposalEvent,
  repairFailedSeoRunProposalEvent,
  type ProposalEventAdminClient,
  type ProposalRepairAdminClient,
  type LinkedSeoRun,
} from "./proposal-event.server";

const linkedRun: LinkedSeoRun = {
  id: "run-123",
  change_request_id: "request-456",
  authority_finding_ids: ["finding-1", "finding-2"],
  knowledge_chunk_ids: ["chunk-1"],
  started_at: "2026-08-14T12:00:00.000Z",
  updated_at: "2026-08-14T12:05:00.000Z",
};

function createAdminClient(error: { message: string } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error });
  const admin: ProposalEventAdminClient = {
    from(table) {
      expect(table).toBe("seo_run_events");
      return { upsert };
    },
  };
  return { admin, upsert };
}

describe("SEO proposal event recovery", () => {
  it("writes the canonical immutable proposal event from durable run fields", async () => {
    const { admin, upsert } = createAdminClient();

    await reconcileSeoRunProposalEvent({
      run: linkedRun,
      tenantId: "tenant-789",
      actorId: "actor-012",
      admin,
    });

    expect(upsert).toHaveBeenCalledWith(
      {
        tenant_id: "tenant-789",
        run_id: "run-123",
        event_key: "proposal:request-456",
        state: "awaiting_approval",
        summary:
          "Evidence and Authority Science produced a concrete proposal awaiting operator approval.",
        payload: {
          change_request_id: "request-456",
          authority_finding_ids: ["finding-1", "finding-2"],
          knowledge_chunk_ids: ["chunk-1"],
        },
        actor_id: "actor-012",
        occurred_at: "2026-08-14T12:00:00.000Z",
      },
      { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
    );
  });

  it("uses the update time when the durable run has no start time", async () => {
    const { admin, upsert } = createAdminClient();

    await reconcileSeoRunProposalEvent({
      run: { ...linkedRun, started_at: null },
      tenantId: "tenant-789",
      actorId: "actor-012",
      admin,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ occurred_at: "2026-08-14T12:05:00.000Z" }),
      { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
    );
  });

  it("propagates an event write error without issuing another write", async () => {
    const { admin, upsert } = createAdminClient({ message: "timeline unavailable" });

    await expect(
      reconcileSeoRunProposalEvent({
        run: linkedRun,
        tenantId: "tenant-789",
        actorId: "actor-012",
        admin,
      }),
    ).rejects.toThrow("timeline unavailable");

    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("failed SEO proposal timeline repair", () => {
  function createRepairAdmin() {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockResolvedValue({ error: null });
    const eqTenant = vi.fn().mockReturnValue({ eq: eqId });
    const update = vi.fn().mockReturnValue({ eq: eqTenant });
    const admin: ProposalRepairAdminClient = {
      from(table) {
        return table === "seo_run_events" ? { upsert } : { update };
      },
    };
    return { admin, upsert, update, eqTenant, eqId };
  }

  it("repairs the durable failed-and-linked run after reload without provider dependencies", async () => {
    const { admin, upsert, update, eqTenant, eqId } = createRepairAdmin();

    await repairFailedSeoRunProposalEvent({
      run: { ...linkedRun, state: "failed" },
      tenantId: "tenant-789",
      actorId: "actor-012",
      admin,
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ state: "awaiting_approval", failure_reason: null });
    expect(eqTenant).toHaveBeenCalledWith("tenant_id", "tenant-789");
    expect(eqId).toHaveBeenCalledWith("id", "run-123");
  });

  it("refuses repair unless the reloaded run is failed and linked", async () => {
    const { admin, upsert } = createRepairAdmin();

    await expect(
      repairFailedSeoRunProposalEvent({
        run: { ...linkedRun, state: "awaiting_approval" },
        tenantId: "tenant-789",
        actorId: "actor-012",
        admin,
      }),
    ).rejects.toThrow("Only a failed SEO run with a linked proposal can repair its timeline.");

    expect(upsert).not.toHaveBeenCalled();
  });
});
