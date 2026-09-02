import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptRecord } from "./execute";
import { createExecutionStore } from "./execute.server";

const inboxItems: Record<string, unknown>[] = [];
vi.mock("../os.server", () => ({
  fileInboxItem: vi.fn(async (_client: unknown, item: Record<string, unknown>) => {
    inboxItems.push(item);
  }),
  logActivity: vi.fn(async () => undefined),
}));

type QueryResult = { data: unknown; error: { message: string } | null };

type FakeQuery = {
  select: () => FakeQuery;
  eq: () => FakeQuery;
  is: () => FakeQuery;
  limit: () => FakeQuery;
  insert: (row: unknown) => FakeQuery;
  update: (patch: unknown) => FakeQuery;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

function fakeQuery(
  result: QueryResult,
  capture?: { insert?: (row: unknown) => void; update?: (patch: unknown) => void },
): FakeQuery {
  const q: FakeQuery = {
    select: () => q,
    eq: () => q,
    is: () => q,
    limit: () => q,
    insert: (row) => {
      capture?.insert?.(row);
      return q;
    },
    update: (patch) => {
      capture?.update?.(patch);
      return q;
    },
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return q;
}

function createAdmin(options: { openItems?: number } = {}) {
  const executions: Record<string, unknown>[] = [];
  const inboxUpdates: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      switch (table) {
        case "change_request_executions":
          return fakeQuery(
            { data: null, error: null },
            { insert: (row) => executions.push(row as Record<string, unknown>) },
          );
        case "inbox_items":
          return fakeQuery(
            {
              data: Array.from({ length: options.openItems ?? 0 }, (_, i) => ({ id: `item-${i}` })),
              error: null,
            },
            { update: (patch) => inboxUpdates.push(patch as Record<string, unknown>) },
          );
        default:
          throw new Error(`Unexpected table in test: ${table}`);
      }
    },
  };
  const client = admin as unknown as Parameters<typeof createExecutionStore>[0];
  return { store: createExecutionStore(client, client, "operator-1"), executions, inboxUpdates };
}

const base = {
  tenantId: "6a2f8f6e-0000-4000-8000-000000000001",
  changeRequestId: "cr-1",
  actorId: "operator-1",
} satisfies Partial<AttemptRecord>;

beforeEach(() => {
  vi.clearAllMocks();
  inboxItems.length = 0;
});

describe("a governed source attempt and the Inbox", () => {
  it("files one needs-attention item naming the reason when a commit fails", async () => {
    const { store, executions, inboxUpdates } = createAdmin();
    await store.recordAttempt({
      ...base,
      kind: "source_commit",
      status: "failed",
      error: "GitHub returned 409 for src/pages/movers.tsx.",
    });
    expect(executions).toHaveLength(1);
    expect(inboxItems).toHaveLength(1);
    expect(inboxItems[0]).toMatchObject({
      lane: "needs_attention",
      sourceModule: "execution",
      title: "The governed commit was failed",
      summary: "GitHub returned 409 for src/pages/movers.tsx.",
      subjectKind: "change_request",
      subjectId: "cr-1",
      tenantId: base.tenantId,
    });
    expect(inboxUpdates).toHaveLength(0);
  });

  it("names a refused revert as a revert", async () => {
    const { store } = createAdmin();
    await store.recordAttempt({
      ...base,
      kind: "source_revert",
      status: "refused",
      error: "The file at HEAD is not the revision this change was committed against.",
    });
    expect(inboxItems[0]).toMatchObject({ title: "The governed revert was refused" });
  });

  it("does not file a second item while one is still open for the change", async () => {
    const { store } = createAdmin({ openItems: 1 });
    await store.recordAttempt({ ...base, kind: "source_commit", status: "failed", error: "again" });
    expect(inboxItems).toHaveLength(0);
  });

  it("resolves the open item when a later attempt lands", async () => {
    const { store, inboxUpdates } = createAdmin();
    await store.recordAttempt({
      ...base,
      kind: "source_commit",
      status: "committed",
      commitSha: "abc123",
      commitUrl: "https://github.com/x/y/commit/abc123",
    });
    expect(inboxItems).toHaveLength(0);
    expect(inboxUpdates).toHaveLength(1);
    expect(inboxUpdates[0]).toMatchObject({ lane: "completed" });
    expect(typeof inboxUpdates[0]!["resolved_at"]).toBe("string");
  });

  it("leaves the Inbox alone for attempts that are not source commits or reverts", async () => {
    const { store, inboxUpdates } = createAdmin();
    await store.recordAttempt({ ...base, kind: "publish_check", status: "failed", error: "x" });
    await store.recordAttempt({ ...base, kind: "preflight", status: "refused", error: "y" });
    expect(inboxItems).toHaveLength(0);
    expect(inboxUpdates).toHaveLength(0);
  });
});
