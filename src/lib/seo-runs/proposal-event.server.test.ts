import { describe, expect, it, vi } from "vitest";

import {
  assessSeoRunProposalEventRepair,
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
  function createRepairAdmin(repairedRun: { id: string } | null = { id: "run-123" }) {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: repairedRun, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const eqUpdatedAt = vi.fn().mockReturnValue({ select });
    const eqChangeRequest = vi.fn().mockReturnValue({ eq: eqUpdatedAt });
    const eqState = vi.fn().mockReturnValue({ eq: eqChangeRequest });
    const eqId = vi.fn().mockReturnValue({ eq: eqState });
    const eqTenant = vi.fn().mockReturnValue({ eq: eqId });
    const update = vi.fn().mockReturnValue({ eq: eqTenant });
    const admin: ProposalRepairAdminClient = {
      from(table) {
        return table === "seo_run_events" ? { upsert } : { update };
      },
    };
    return { admin, upsert, update, eqTenant, eqId, eqState, eqChangeRequest, eqUpdatedAt, select };
  }

  const exactCrashEvidence = {
    eventKeys: ["run_created", "failure:write-crash"],
    changeRequestState: "proposed",
  };

  it("recognizes only the exact failed, linked, missing-event proposal crash", () => {
    expect(
      assessSeoRunProposalEventRepair({
        run: { ...linkedRun, state: "failed" },
        ...exactCrashEvidence,
      }),
    ).toBe(true);
  });

  it.each([
    ["canonical proposal event already exists", ["proposal:request-456"], "proposed", "failed"],
    ["linked change was approved", [], "approved", "failed"],
    [
      "source execution truthfully failed",
      ["source_execution:request-456:failed"],
      "proposed",
      "failed",
    ],
    ["execution was started", ["execution_started:request-456"], "proposed", "failed"],
    ["run already transitioned", [], "proposed", "awaiting_approval"],
  ] as const)("refuses %s", (_name, eventKeys, changeRequestState, state) => {
    expect(
      assessSeoRunProposalEventRepair({
        run: { ...linkedRun, state },
        eventKeys,
        changeRequestState,
      }),
    ).toBe(false);
  });

  it("repairs the exact durable missing-event crash without provider dependencies", async () => {
    const { admin, upsert, update, eqTenant, eqId, eqState, eqChangeRequest, eqUpdatedAt } =
      createRepairAdmin();

    const result = await repairFailedSeoRunProposalEvent({
      run: { ...linkedRun, state: "failed" },
      ...exactCrashEvidence,
      tenantId: "tenant-789",
      actorId: "actor-012",
      admin,
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ state: "awaiting_approval", failure_reason: null });
    expect(eqTenant).toHaveBeenCalledWith("tenant_id", "tenant-789");
    expect(eqId).toHaveBeenCalledWith("id", "run-123");
    expect(eqState).toHaveBeenCalledWith("state", "failed");
    expect(eqChangeRequest).toHaveBeenCalledWith("change_request_id", "request-456");
    expect(eqUpdatedAt).toHaveBeenCalledWith("updated_at", linkedRun.updated_at);
    expect(result).toBe("repaired");
  });

  it("makes a repeated repair call a no-op when the canonical event exists", async () => {
    const { admin, upsert } = createRepairAdmin();

    const result = await repairFailedSeoRunProposalEvent({
      run: { ...linkedRun, state: "failed" },
      eventKeys: ["proposal:request-456"],
      changeRequestState: "proposed",
      tenantId: "tenant-789",
      actorId: "actor-012",
      admin,
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toBe("noop");
  });

  it("does not clobber a later state transition during repair", async () => {
    const { admin, upsert, update } = createRepairAdmin(null);

    const result = await repairFailedSeoRunProposalEvent({
      run: { ...linkedRun, state: "failed" },
      ...exactCrashEvidence,
      tenantId: "tenant-789",
      actorId: "actor-012",
      admin,
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toBe("noop");
  });
});
