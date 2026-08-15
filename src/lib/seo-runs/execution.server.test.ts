import { describe, expect, it } from "vitest";

import {
  recordSeoRunChangeTransition,
  recordSeoRunExecutionStarted,
  recordSeoRunRenderedProof,
  recordSeoRunSourceExecutionResult,
} from "./execution.server";

type Event = {
  tenant_id: string;
  run_id: string;
  event_key: string;
  state: "approved" | "executing" | "executed" | "verified" | "rejected" | "failed" | "rolled_back";
  summary: string;
  actor_id: string;
  payload?: Record<string, string>;
};

type EventUpsertOptions = {
  onConflict: "tenant_id,run_id,event_key";
  ignoreDuplicates: true;
};

type WriteResult = { error: { message: string } | null };

function createAdminClient() {
  const events: Event[] = [];
  const upsertOptions: EventUpsertOptions[] = [];
  const storedEventKeys = new Set<string>();

  const runQuery = {
    select() {
      return runQuery;
    },
    update() {
      return runQuery;
    },
    eq() {
      return runQuery;
    },
    maybeSingle(): Promise<{
      data: { id: string };
      error: null;
    }> {
      return Promise.resolve({ data: { id: "run-123" }, error: null });
    },
  };

  const eventQuery = {
    insert(event: Event): Promise<WriteResult> {
      events.push(event);
      return Promise.resolve({ error: null });
    },
    upsert(event: Event, options: EventUpsertOptions): Promise<WriteResult> {
      upsertOptions.push(options);
      const eventIdentity = `${event.tenant_id}:${event.run_id}:${event.event_key}`;
      if (!storedEventKeys.has(eventIdentity)) {
        storedEventKeys.add(eventIdentity);
        events.push(event);
      }
      return Promise.resolve({ error: null });
    },
  };

  const client = {
    from(table: "seo_runs" | "seo_run_events") {
      return table === "seo_runs" ? runQuery : eventQuery;
    },
  };

  return {
    admin: client as unknown as Parameters<typeof recordSeoRunExecutionStarted>[0],
    events,
    upsertOptions,
  };
}

const tenantId = "tenant-789";
const changeRequestId = "request-456";
const actorId = "actor-012";

describe("SEO execution timeline delivery", () => {
  it("stores one deterministic started event across a retried delivery", async () => {
    const { admin, events } = createAdminClient();

    await recordSeoRunExecutionStarted(admin, tenantId, changeRequestId, actorId);
    await recordSeoRunExecutionStarted(admin, tenantId, changeRequestId, actorId);

    expect(events).toEqual([
      {
        tenant_id: tenantId,
        run_id: "run-123",
        event_key: "execution_started:request-456",
        state: "executing",
        summary:
          "An operator started the approved source execution. No live-page proof exists yet.",
        actor_id: actorId,
      },
    ]);
  });

  it("deduplicates committed and replayed deliveries under the executing key", async () => {
    const { admin, events } = createAdminClient();

    await recordSeoRunSourceExecutionResult(admin, tenantId, changeRequestId, actorId, "committed");
    await recordSeoRunSourceExecutionResult(admin, tenantId, changeRequestId, actorId, "replayed");

    expect(events).toEqual([
      {
        tenant_id: tenantId,
        run_id: "run-123",
        event_key: "source_execution:request-456:executing",
        state: "executing",
        summary:
          "The approved source change is committed. Rendered live-page proof is still required.",
        payload: { status: "committed", change_request_id: changeRequestId },
        actor_id: actorId,
      },
    ]);
  });

  it("keeps failed and later executing deliveries as distinct immutable events", async () => {
    const { admin, events } = createAdminClient();

    await recordSeoRunSourceExecutionResult(admin, tenantId, changeRequestId, actorId, "failed");
    await recordSeoRunSourceExecutionResult(admin, tenantId, changeRequestId, actorId, "committed");

    expect(events.map((event) => event.event_key)).toEqual([
      "source_execution:request-456:failed",
      "source_execution:request-456:executing",
    ]);
    expect(events.map((event) => event.payload?.["status"])).toEqual(["failed", "committed"]);
  });

  it("uses immutable-event conflict options for every execution event", async () => {
    const { admin, upsertOptions } = createAdminClient();

    await recordSeoRunExecutionStarted(admin, tenantId, changeRequestId, actorId);
    await recordSeoRunSourceExecutionResult(admin, tenantId, changeRequestId, actorId, "failed");

    expect(upsertOptions).toEqual([
      { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
      { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
    ]);
  });
});

describe("SEO change-request transition timeline", () => {
  it("maps every operator transition to a durable SEO run state event", async () => {
    const { admin, events } = createAdminClient();

    for (const state of ["approved", "applied", "verified", "rejected", "rolled_back"] as const) {
      await recordSeoRunChangeTransition(admin, tenantId, changeRequestId, actorId, state);
    }

    expect(events.map((event) => [event.event_key, event.state])).toEqual([
      ["change_state:request-456:approved", "approved"],
      ["change_state:request-456:applied", "executed"],
      ["change_state:request-456:verified", "verified"],
      ["change_state:request-456:rejected", "rejected"],
      ["change_state:request-456:rolled_back", "rolled_back"],
    ]);
  });

  it("reconciles a retried transition without duplicating its immutable event", async () => {
    const { admin, events } = createAdminClient();

    await recordSeoRunChangeTransition(admin, tenantId, changeRequestId, actorId, "approved");
    await recordSeoRunChangeTransition(admin, tenantId, changeRequestId, actorId, "approved");

    expect(events.filter((event) => event.event_key.includes(":approved"))).toHaveLength(1);
  });
});

describe("SEO rendered proof timeline", () => {
  it("records rendered proof as executed without claiming outcome verification", async () => {
    const { admin, events } = createAdminClient();

    await recordSeoRunRenderedProof(
      admin,
      tenantId,
      changeRequestId,
      actorId,
      "https://trumoveinc.com/services",
    );

    expect(events.at(-1)).toMatchObject({
      event_key: "rendered_proof:request-456",
      state: "executed",
      payload: {
        change_request_id: changeRequestId,
        final_url: "https://trumoveinc.com/services",
      },
    });
    expect(events.at(-1)?.summary).toContain("Outcome verification remains separate");
  });

  it("deduplicates repeated rendered proof delivery", async () => {
    const { admin, events } = createAdminClient();

    await recordSeoRunRenderedProof(
      admin,
      tenantId,
      changeRequestId,
      actorId,
      "https://trumoveinc.com/services",
    );
    await recordSeoRunRenderedProof(
      admin,
      tenantId,
      changeRequestId,
      actorId,
      "https://trumoveinc.com/services",
    );

    expect(events.filter((event) => event.event_key === "rendered_proof:request-456")).toHaveLength(
      1,
    );
  });
});
