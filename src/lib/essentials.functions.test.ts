import { describe, expect, it } from "vitest";

import { EssentialsReadError } from "./essentials";

type ReadResult = { data: unknown; error: { message: string } | null };

type QueryCall = {
  table: string;
  select: string;
  eq: [string, unknown][];
  order: [string, { ascending: boolean }][];
  limit: number | null;
  single: boolean;
};

function createSnapshotDb(results: ReadResult[]) {
  const calls: QueryCall[] = [];

  return {
    calls,
    db: {
      from(table: string) {
        const call: QueryCall = {
          table,
          select: "",
          eq: [],
          order: [],
          limit: null,
          single: false,
        };
        calls.push(call);
        const query = {
          select(columns: string) {
            call.select = columns;
            return query;
          },
          eq(column: string, value: unknown) {
            call.eq.push([column, value]);
            return query;
          },
          order(column: string, options: { ascending: boolean }) {
            call.order.push([column, options]);
            return query;
          },
          limit(value: number) {
            call.limit = value;
            const result = results.shift();
            if (!result) throw new Error("Unexpected snapshot query");
            return Promise.resolve(result);
          },
          single() {
            call.single = true;
            const result = results.shift();
            if (!result) throw new Error("Unexpected snapshot query");
            return Promise.resolve(result);
          },
        };
        return query;
      },
    },
  };
}

async function readSelectedPropertySnapshots(db: unknown, tenantId: string, siteUrl: string) {
  const module = (await import("./essentials.functions")) as {
    readSelectedPropertySnapshots?: (
      db: unknown,
      tenantId: string,
      siteUrl: string,
    ) => Promise<{ snapshots: unknown[]; sitemapPayload: unknown | null }>;
  };
  if (!module.readSelectedPropertySnapshots)
    throw new Error("readSelectedPropertySnapshots missing");
  return module.readSelectedPropertySnapshots(db, tenantId, siteUrl);
}

describe("Essentials Search Console snapshot reads", () => {
  it("reads metadata first and loads only the exact latest sitemap payload", async () => {
    const snapshots = [
      {
        id: "totals-current",
        kind: "property_totals",
        dimensions: [],
        period_end_pt: "2026-08-14",
        returned_row_count: 1,
        totals: { clicks: 12 },
        collected_at: "2026-08-15T00:00:00Z",
      },
      {
        id: "sitemap-current",
        kind: "dimensional_rows",
        dimensions: ["sitemap"],
        period_end_pt: "2026-08-14",
        returned_row_count: 2,
        totals: {},
        collected_at: "2026-08-15T00:00:00Z",
      },
    ];
    const { db, calls } = createSnapshotDb([
      { data: snapshots, error: null },
      { data: { payload: { sitemap: [{ warnings: 1, errors: 0 }] } }, error: null },
    ]);

    await expect(
      readSelectedPropertySnapshots(db, "tenant-1", "https://example.com"),
    ).resolves.toEqual({
      snapshots,
      sitemapPayload: { sitemap: [{ warnings: 1, errors: 0 }] },
    });

    expect(calls).toEqual([
      {
        table: "search_console_snapshots",
        select: "id, kind, dimensions, period_end_pt, returned_row_count, totals, collected_at",
        eq: [
          ["tenant_id", "tenant-1"],
          ["property", "https://example.com"],
        ],
        order: [["period_end_pt", { ascending: false }]],
        limit: 500,
        single: false,
      },
      {
        table: "search_console_snapshots",
        select: "payload",
        eq: [
          ["tenant_id", "tenant-1"],
          ["id", "sitemap-current"],
        ],
        order: [],
        limit: null,
        single: true,
      },
    ]);
  });

  it("keeps the null sitemap summary input without a sitemap metadata row", async () => {
    const { db, calls } = createSnapshotDb([
      {
        data: [
          {
            id: "page-current",
            kind: "dimensional_rows",
            dimensions: ["page"],
            period_end_pt: "2026-08-14",
            returned_row_count: 3,
            totals: {},
            collected_at: "2026-08-15T00:00:00Z",
          },
        ],
        error: null,
      },
    ]);

    await expect(
      readSelectedPropertySnapshots(db, "tenant-1", "https://example.com"),
    ).resolves.toMatchObject({ sitemapPayload: null });
    expect(calls).toHaveLength(1);
  });

  it("surfaces a sitemap payload read error", async () => {
    const { db } = createSnapshotDb([
      {
        data: [
          {
            id: "sitemap-current",
            kind: "dimensional_rows",
            dimensions: ["sitemap"],
            period_end_pt: "2026-08-14",
            returned_row_count: 1,
            totals: {},
            collected_at: "2026-08-15T00:00:00Z",
          },
        ],
        error: null,
      },
      { data: null, error: { message: "permission denied" } },
    ]);

    await expect(
      readSelectedPropertySnapshots(db, "tenant-1", "https://example.com"),
    ).rejects.toEqual(
      new EssentialsReadError("Search Console sitemap snapshot", "permission denied"),
    );
  });
});
