import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { reconcileChangeMeasurements } from "./change-measurements.server";
import { logActivity } from "./os.server";
import { tickScheduler } from "./scheduler.server";
import { runWorkflow } from "./workflow-runner.server";

vi.mock("./workflow-runner.server", () => ({
  runWorkflow: vi.fn(async () => ({ runId: "run-id", state: "succeeded" })),
}));

vi.mock("./change-measurements.server", () => ({
  reconcileChangeMeasurements: vi.fn(async () => ({ cycles: 1, windows: 4 })),
}));

vi.mock("./os.server", () => ({
  fileInboxItem: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
}));

type QueryResult = { data: unknown; error: null };

function query(result: QueryResult, onInsert?: (row: unknown) => void) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "or", "order", "limit", "update"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["insert"] = vi.fn((row: unknown) => {
    onInsert?.(row);
    return chain;
  });
  chain["then"] = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

function schedulerClient(options: { tenantId?: string | null; claim?: boolean } = {}) {
  const tenantId =
    options.tenantId === undefined ? "c94a41b3-08d0-4a6d-88f8-0dcb1eb4e2e6" : options.tenantId;
  const touchedTables: string[] = [];
  const firings: Record<string, unknown>[] = [];
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
      tenant_id: tenantId,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      key: "report-digest",
      name: "Report digest",
      cron: "0 16 * * *",
      target_kind: "report",
      target_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      next_run_at: "2026-08-11T16:00:00.000Z",
      last_run_at: null,
      last_state: null,
      failure_count: 0,
      tenant_id: tenantId,
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
      tenant_id: tenantId,
    },
  ];

  let scheduleCalls = 0;
  const client = {
    from(table: string) {
      touchedTables.push(table);
      if (table === "schedules") {
        scheduleCalls += 1;
        // First call lists the enabled schedules; the second is the claim,
        // which answers with the row it moved or with nothing when another
        // tick moved it first (CQ-2); later calls are the outcome update.
        if (scheduleCalls === 1) return query({ data: schedules, error: null });
        if (scheduleCalls === 2)
          return query({ data: options.claim === false ? [] : [{ id: "claimed" }], error: null });
        return query({ data: null, error: null });
      }
      if (table === "schedule_dependencies") return query({ data: [], error: null });
      if (table === "dataforseo_requests") return query({ data: [], error: null });
      if (table === "schedule_runs")
        return query({ data: null, error: null }, (row) =>
          firings.push(row as Record<string, unknown>),
        );
      return query({ data: [], error: null });
    },
  } as unknown as SupabaseClient<Database>;

  return { client, touchedTables, firings };
}

describe("tickScheduler automation scope", () => {
  beforeEach(() => {
    vi.mocked(runWorkflow).mockClear();
    vi.mocked(reconcileChangeMeasurements).mockClear();
  });

  it("runs the allowed GSC schedule and reconciles due change windows without collecting the paid SERP backlog", async () => {
    const { client, touchedTables, firings } = schedulerClient();

    const result = await tickScheduler(client, new Date("2026-08-11T23:00:00.000Z"), {
      onlyKeys: ["gsc-daily-observe"],
      collectSerpBacklog: false,
      reconcileChangeMeasurements: true,
      firedBy: "operator",
    });

    expect(result.ran).toEqual([{ schedule: "gsc-daily-observe", state: "succeeded" }]);
    // The firing is written down, not only the row's last state (CODE-48).
    expect(firings).toEqual([
      expect.objectContaining({
        tenant_id: "c94a41b3-08d0-4a6d-88f8-0dcb1eb4e2e6",
        schedule_id: "11111111-1111-4111-8111-111111111111",
        schedule_key: "gsc-daily-observe",
        fired_by: "operator",
        state: "succeeded",
        fired_at: "2026-08-11T23:00:00.000Z",
        result: { workflowRunId: "run-id", state: "succeeded" },
        error: null,
      }),
    ]);
    expect(runWorkflow).toHaveBeenCalledTimes(1);
    expect(runWorkflow).toHaveBeenCalledWith(
      client,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "schedule:gsc-daily-observe",
      null,
      "c94a41b3-08d0-4a6d-88f8-0dcb1eb4e2e6",
    );
    expect(touchedTables).not.toContain("dataforseo_requests");
    expect(reconcileChangeMeasurements).toHaveBeenCalledTimes(1);
    expect(reconcileChangeMeasurements).toHaveBeenCalledWith(client);
  });

  it("leaves a schedule another tick claimed first, without running or recording it", async () => {
    const { client, firings } = schedulerClient({ claim: false });

    const result = await tickScheduler(client, new Date("2026-08-11T23:00:00.000Z"), {
      onlyKeys: ["gsc-daily-observe"],
      collectSerpBacklog: false,
      reconcileChangeMeasurements: false,
      firedBy: "pg_cron",
    });

    expect(result).toMatchObject({ claimed: 0, lostToAnotherTick: 1, ran: [] });
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(firings).toEqual([]);
  });

  it("fails a schedule whose target is not a workflow instead of recording a success it never earned", async () => {
    const { client, firings } = schedulerClient();

    const result = await tickScheduler(client, new Date("2026-08-11T23:00:00.000Z"), {
      onlyKeys: ["report-digest"],
      collectSerpBacklog: false,
      reconcileChangeMeasurements: false,
      firedBy: "pg_cron",
    });

    expect(result.ran).toEqual([{ schedule: "report-digest", state: "failed" }]);
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(firings).toEqual([
      expect.objectContaining({
        schedule_key: "report-digest",
        state: "failed",
        error: expect.stringContaining('targets "report", which the scheduler cannot run'),
      }),
    ]);
  });

  it("refuses a workflow schedule that names no client workspace instead of resolving one", async () => {
    const { client, firings } = schedulerClient({ tenantId: null });

    const result = await tickScheduler(client, new Date("2026-08-11T23:00:00.000Z"), {
      onlyKeys: ["gsc-daily-observe"],
      collectSerpBacklog: false,
      reconcileChangeMeasurements: false,
      firedBy: "pg_cron",
    });

    expect(result.ran).toEqual([{ schedule: "gsc-daily-observe", state: "failed" }]);
    expect(firings).toEqual([
      expect.objectContaining({
        schedule_key: "gsc-daily-observe",
        fired_by: "pg_cron",
        state: "failed",
        error: expect.stringContaining("names no client workspace"),
      }),
    ]);
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        verb: "schedule.error",
        summary: expect.stringContaining("names no client workspace"),
      }),
    );
  });
});
