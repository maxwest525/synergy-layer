import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";

type ExecutionRow = Database["public"]["Tables"]["change_request_executions"]["Row"];

/**
 * Every query the evidence tools run is recorded here: which table, which
 * select string, and which filters. Rows to hand back are seeded per table.
 */
const harness = vi.hoisted(() => {
  const calls: Array<{ table: string; columns: string; filters: Array<[string, unknown]> }> = [];
  const rowsByTable = new Map<string, unknown[]>();
  return { calls, rowsByTable };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const call = { table, columns: "", filters: [] as Array<[string, unknown]> };
      harness.calls.push(call);
      const rows = () => harness.rowsByTable.get(table) ?? [];
      const builder = {
        select(columns: string) {
          call.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return builder;
        },
        is(column: string, value: unknown) {
          call.filters.push([column, value]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then(onFulfilled: (result: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows(), error: null }).then(onFulfilled);
        },
      };
      return builder;
    },
  }),
}));

import { buildEvidenceTools } from "./evidence.server";

/**
 * The columns listExecutions asks for. `satisfies keyof Row` makes a column
 * that does not exist on the generated table type a compile error, which is
 * exactly the bug this guards against: the tool once selected `outcome`, a
 * column the table never had, and errored on every call.
 */
const EXECUTION_COLUMNS = [
  "id",
  "change_request_id",
  "kind",
  "status",
  "created_at",
  "detail",
] as const satisfies readonly (keyof ExecutionRow)[];

const receipt: Pick<ExecutionRow, (typeof EXECUTION_COLUMNS)[number]> = {
  id: "exec-1",
  change_request_id: "cr-1",
  kind: "source_commit",
  status: "committed",
  created_at: "2026-08-27T12:00:00.000Z",
  detail: { message: "Rewrote the corporate relocation title" },
};

const toolCall = { toolCallId: "call-1", messages: [], context: {} };

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  harness.calls.length = 0;
  harness.rowsByTable.clear();
  harness.rowsByTable.set("tenant_members", [{ tenant_id: "tenant-1" }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("execution receipts are read from columns the table actually has", () => {
  it("selects the real change_request_executions columns and returns rows shaped from them", async () => {
    harness.rowsByTable.set("change_request_executions", [receipt]);
    const tools = await buildEvidenceTools({ userId: "user-1", token: "token-1" });

    const result = await tools.listExecutions.execute?.({}, toolCall);

    expect(result).toEqual({ rowCount: 1, rows: [receipt] });
    const query = harness.calls.find((call) => call.table === "change_request_executions");
    expect(query?.columns).toBe(EXECUTION_COLUMNS.join(", "));
  });

  it("filters executions to the operator's workspace like every other evidence tool", async () => {
    harness.rowsByTable.set("change_request_executions", []);
    const tools = await buildEvidenceTools({ userId: "user-1", token: "token-1" });

    await tools.listExecutions.execute?.({}, toolCall);

    const query = harness.calls.find((call) => call.table === "change_request_executions");
    expect(query?.filters).toContainEqual(["tenant_id", "tenant-1"]);
  });
});
