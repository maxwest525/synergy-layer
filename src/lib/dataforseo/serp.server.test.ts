import { beforeEach, describe, expect, it, vi } from "vitest";

const posts: Record<string, unknown>[] = [];
const gets: string[] = [];
const snapshots: Record<string, unknown>[] = [];

vi.mock("./transport.server", () => ({
  dataforseoPost: vi.fn(async (_client: unknown, options: Record<string, unknown>) => {
    posts.push(options);
    const tasks = (options["tasks"] as unknown[]).map((_, index) => ({
      id: `task-${index}`,
      status_code: 20100,
      status_message: "Task Created.",
      cost: 0.0006,
    }));
    return { envelope: { tasks }, requestId: "req-1", costUsd: 0.0006 * tasks.length };
  }),
  dataforseoGet: vi.fn(async (path: string) => {
    gets.push(path);
    if (path.endsWith("/tasks_ready")) {
      return { tasks: [{ result: [{ id: "task-0" }] }] };
    }
    return {
      cost: 0,
      tasks: [
        {
          id: "task-0",
          status_code: 20000,
          status_message: "Ok.",
          cost: 0,
          result: [{ items: [{ type: "organic", rank_group: 1 }], se_results_count: 1 }],
        },
      ],
    };
  }),
  fingerprint: vi.fn(
    (endpoint: string, params: unknown, date: string) =>
      `${endpoint}|${JSON.stringify(params)}|${date}`,
  ),
  persistSnapshot: vi.fn(async (_client: unknown, input: Record<string, unknown>) => {
    snapshots.push(input);
    return { id: "snap-1", created: true, rows: (input["rows"] as unknown[]).length };
  }),
}));

import { collectReadySerpTasks, ingestSerpPostback, queueSerpTasks } from "./serp.server";

type QueryResult = { data: unknown; error: null };

/** Chainable, awaitable stand-in for one supabase query builder. */
function fakeQuery(
  result: QueryResult,
  capture?: { insert?: (row: unknown) => void; update?: (patch: unknown) => void },
  listResult?: QueryResult,
) {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    in: () => q,
    maybeSingle: () => Promise.resolve(result),
    insert: (row: unknown) => {
      capture?.insert?.(row);
      return q;
    },
    update: (patch: unknown) => {
      capture?.update?.(patch);
      return q;
    },
    then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (r: unknown) => unknown) =>
      Promise.resolve(listResult ?? result).then(onFulfilled, onRejected),
  };
  return q;
}

const TENANT = "6a2f8f6e-0000-4000-8000-000000000001";

function createClient(
  options: { queuedTask?: Record<string, unknown> | null; queuedList?: unknown[] } = {},
) {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      switch (table) {
        case "dataforseo_snapshots":
          return fakeQuery({ data: null, error: null });
        case "dataforseo_serp_tasks": {
          const queued = options.queuedTask ?? null;
          return fakeQuery(
            { data: queued === null ? null : queued, error: null },
            {
              insert: (row) => inserted.push(row as Record<string, unknown>),
              update: (patch) => updated.push(patch as Record<string, unknown>),
            },
            { data: options.queuedList ?? [], error: null },
          );
        }
        default:
          throw new Error(`Unexpected table in test: ${table}`);
      }
    },
  };
  return { client: client as unknown as Parameters<typeof queueSerpTasks>[0], inserted, updated };
}

beforeEach(() => {
  vi.clearAllMocks();
  posts.length = 0;
  gets.length = 0;
  snapshots.length = 0;
});

describe("SERP tasks carry every surface on the page", () => {
  it("posts each task for advanced postback data and stores the matching task_get endpoint", async () => {
    const { client, inserted } = createClient();
    const result = await queueSerpTasks(
      client,
      TENANT,
      ["long distance movers"],
      "https://aoos.test",
    );

    expect(result).toMatchObject({ queued: 1, skipped: 0 });
    const tasks = posts[0]!["tasks"] as Record<string, unknown>[];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      keyword: "long distance movers",
      postback_data: "advanced",
    });
    expect(String(tasks[0]!["postback_url"])).toMatch(/^https:\/\/aoos\.test\//);
    expect(inserted[0]).toMatchObject({
      tenant_id: TENANT,
      provider_task_id: "task-0",
      endpoint: "/serp/google/organic/task_get/advanced",
      state: "queued",
    });
  });

  it("stores organic rows and the other surfaces the provider returned, untouched", async () => {
    const { client, updated } = createClient({
      queuedTask: {
        id: "row-1",
        keyword: "long distance movers",
        request_fingerprint: "fp-1",
        request_params: { keyword: "long distance movers" },
      },
    });
    const items = [
      { type: "ai_overview", rank_group: 1, rank_absolute: 1 },
      { type: "organic", rank_group: 1, rank_absolute: 2, domain: "rival.example", url: "u" },
      {
        type: "people_also_ask",
        rank_group: 2,
        rank_absolute: 3,
        items: [{ type: "people_also_ask_element", title: "How much do movers cost?" }],
      },
    ];
    const result = await ingestSerpPostback(client, TENANT, {
      tasks: [
        {
          id: "task-0",
          status_code: 20000,
          status_message: "Ok.",
          cost: 0.0006,
          result: [{ items, se_results_count: 12 }],
        },
      ],
    });

    expect(result).toEqual({ stored: 1 });
    expect(snapshots[0]).toMatchObject({
      endpoint: "/serp/google/organic/task_get/advanced",
      kind: "serp_organic",
      target: "long distance movers",
      rows: items,
      totals: { seResultsCount: 12 },
    });
    expect(updated[0]).toMatchObject({ state: "received", snapshot_id: "snap-1" });
  });

  it("sweeps a delayed task through the advanced task_get path", async () => {
    const row = {
      id: "row-1",
      provider_task_id: "task-0",
      keyword: "long distance movers",
      request_fingerprint: "fp-1",
      request_params: {},
    };
    const { client } = createClient({ queuedTask: row, queuedList: [row] });

    const result = await collectReadySerpTasks(client, TENANT);

    expect(gets).toEqual([
      "/serp/google/organic/tasks_ready",
      "/serp/google/organic/task_get/advanced/task-0",
    ]);
    expect(result).toMatchObject({ ready: 1, collected: 1, stillQueued: 0 });
  });
});
