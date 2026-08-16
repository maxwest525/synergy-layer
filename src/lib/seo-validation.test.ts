import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem } from "./os.server";
import { runSeoValidation } from "./seo-validation.server";

vi.mock("./tenant.server", () => ({
  requireTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("./os.server", () => ({
  fileInboxItem: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
}));

type Write = {
  table: string;
  operation: "insert" | "update" | "upsert";
  values: Record<string, unknown>;
};

function validationClient() {
  const writes: Write[] = [];
  const current = [
    {
      id: "snapshot-current",
      dimensions: ["page"],
      kind: "page",
      period_end_pt: "2026-08-09",
      period_start_pt: "2026-08-03",
      payload: {
        rows: [
          {
            keys: ["https://trumoveinc.com/long-distance-moving"],
            clicks: 0,
            impressions: 250,
            ctr: 0,
            position: 5,
          },
        ],
      },
      totals: {},
    },
  ];

  class Query {
    private filters = new Map<string, unknown>();
    private selected = "";
    private inserted: Record<string, unknown> | null = null;

    constructor(private readonly table: string) {}

    select(columns = "") {
      this.selected = columns;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    not() {
      return this;
    }

    order() {
      return this;
    }

    limit() {
      return this;
    }

    insert(values: Record<string, unknown>) {
      this.inserted = values;
      writes.push({ table: this.table, operation: "insert", values });
      return this;
    }

    update(values: Record<string, unknown>) {
      writes.push({ table: this.table, operation: "update", values });
      return this;
    }

    async upsert(values: Record<string, unknown>) {
      writes.push({ table: this.table, operation: "upsert", values });
      return { data: null, error: null };
    }

    async maybeSingle() {
      if (this.table === "search_console_properties") {
        if (this.selected === "site_url") {
          return { data: { site_url: "sc-domain:trumoveinc.com" }, error: null };
        }
        return { data: { asset_id: null }, error: null };
      }
      return { data: null, error: null };
    }

    async single() {
      return { data: { id: "recommendation-1", ...this.inserted }, error: null };
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      let response: unknown = { data: [], error: null };
      if (this.table === "search_console_snapshots") {
        response = this.filters.has("period_end_pt")
          ? { data: current, error: null }
          : { data: [{ period_end_pt: "2026-08-09" }], error: null };
      }
      return Promise.resolve(response).then(onfulfilled, onrejected);
    }
  }

  return {
    client: { from: (table: string) => new Query(table) } as unknown as SupabaseClient<Database>,
    writes,
  };
}

describe("SEO validation finding persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores rule findings as observations instead of approval requests", async () => {
    const { client, writes } = validationClient();

    const result = await runSeoValidation(client, null);
    const recommendations = writes.filter(
      (write) => write.table === "recommendations" && write.operation === "insert",
    );

    expect(result.recommendationsCreated).toBeGreaterThan(0);
    expect(recommendations).not.toHaveLength(0);
    expect(recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: expect.objectContaining({
            state: "observed",
            requires_approval: false,
            metadata: expect.objectContaining({ observationOnly: true }),
          }),
        }),
      ]),
    );
    expect(fileInboxItem).not.toHaveBeenCalled();
  });
});
