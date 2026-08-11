import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { tickScheduler } from "./scheduler.server";
import { runWorkflow } from "./workflow-runner.server";

vi.mock("./workflow-runner.server", () => ({
  runWorkflow: vi.fn(async () => ({ runId: "run-id", state: "succeeded" })),
}));

vi.mock("./os.server", () => ({
  fileInboxItem: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
}));

type QueryResult = { data: unknown; error: null };

function query(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "order", "limit", "update"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["then"] = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

function schedulerClient() {
  const touchedTables: string[] = [];
  const schedules = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      key: "gsc-daily-observe",
      name: "Search Console daily observation",
      cron: "0 16 * * *",
      target_kind: "workflow",
      target_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      next_run_at: "2026-08-11T16:00:00.000Z",
      last_run_at: "2026-08-10T16:00:00.000Z",
      last_state: "succeeded",
      failure_count: 0,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      key: "paid-provider-workflow",
      name: "Paid provider workflow",
      cron: "0 16 * * *",
      target_kind: "workflow",
      target_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      next_run_at: "2026-08-11T16:00:00.000Z",
      last_run_at: "2026-08-10T16:00:00.000Z",
      last_state: "succeeded",
      failure_count: 0,
    },
  ];

  const client = {
    from(table: string) {
      touchedTables.push(table);
      if (table === "schedules") return query({ data: schedules, error: null });
      if (table === "schedule_dependencies") return query({ data: [], error: null });
      if (table === "dataforseo_requests") return query({ data: [], error: null });
      return query({ data: [], error: null });
    },
  } as unknown as SupabaseClient<Database>;

  return { client, touchedTables };
}

describe("tickScheduler automation scope", () => {
  beforeEach(() => {
    vi.mocked(runWorkflow).mockClear();
  });

  it("runs only the explicitly allowed GSC schedule and does not collect the paid SERP backlog", async () => {
    const { client, touchedTables } = schedulerClient();

    const result = await tickScheduler(client, new Date("2026-08-11T23:00:00.000Z"), {
      onlyKeys: ["gsc-daily-observe"],
      collectSerpBacklog: false,
    });

    expect(result.ran).toEqual([{ schedule: "gsc-daily-observe", state: "succeeded" }]);
    expect(runWorkflow).toHaveBeenCalledTimes(1);
    expect(runWorkflow).toHaveBeenCalledWith(
      client,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "schedule:gsc-daily-observe",
      null,
    );
    expect(touchedTables).not.toContain("dataforseo_requests");
  });
});
