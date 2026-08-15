import { describe, expect, it, vi } from "vitest";

import {
  reconcileSeoRunProposalEvent,
  type ProposalEventAdminClient,
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
