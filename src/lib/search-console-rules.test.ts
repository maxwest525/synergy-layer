import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem } from "./os.server";
import { evaluateSnapshots } from "./search-console-rules.server";

vi.mock("./tenant.server", () => ({
  requireTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("./os.server", () => ({
  fileInboxItem: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
}));

type Write = { table: string; operation: "insert" | "upsert"; values: Record<string, unknown> };

function rulesClient() {
  const writes: Write[] = [];
  const current = [
    {
      id: "snapshot-current",
      dimensions: ["query"],
      kind: "query",
      period_end_pt: "2026-08-09",
      payload: {
        rows: [
          { keys: ["long distance movers"], clicks: 3, impressions: 120, ctr: 0.025, position: 12 },
        ],
      },
      totals: {},
    },
  ];

  class Query {
    private filters = new Map<string, unknown>();
    private inserted: Record<string, unknown> | null = null;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    not() {
      return this;
    }

    insert(values: Record<string, unknown>) {
      this.inserted = values;
      writes.push({ table: this.table, operation: "insert", values });
      return this;
    }

    async upsert(values: Record<string, unknown>) {
      writes.push({ table: this.table, operation: "upsert", values });
      return { data: null, error: null };
    }

    async maybeSingle() {
      return { data: null, error: null };
    }

    async single() {
      return { data: { id: "recommendation-1", ...this.inserted }, error: null };
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      const date = this.filters.get("period_end_pt");
      const response =
        this.table === "search_console_snapshots"
          ? { data: date === "2026-08-09" ? current : [], error: null }
          : { data: null, error: null };
      return Promise.resolve(response).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from(table: string) {
      return new Query(table);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, writes };
}

describe("Search Console finding persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a triggered rule as an observed finding without filing an approval", async () => {
    const { client, writes } = rulesClient();

    const result = await evaluateSnapshots(client, "sc-domain:trumoveinc.com", "2026-08-09");
    const recommendation = writes.find(
      (write) => write.table === "recommendations" && write.operation === "insert",
    );

    expect(result.recommendations).toBe(1);
    expect(recommendation?.values).toMatchObject({
      state: "observed",
      requires_approval: false,
      metadata: expect.objectContaining({ observationOnly: true }),
    });
    expect(fileInboxItem).not.toHaveBeenCalled();
  });
});
