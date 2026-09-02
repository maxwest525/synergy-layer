import { describe, expect, it } from "vitest";

import { openMeasurementRun, withMeasurementRun } from "./run-ledger.server";

function ledger() {
  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const admin = {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          return {
            select() {
              return {
                async single() {
                  return { data: { id: "run-1" }, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              updates.push({ id, patch });
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof openMeasurementRun>[0];
  return { admin, inserts, updates };
}

let clock = 1_000;
const now = () => clock;

describe("a measurement attempt is ledgered before the provider is touched", () => {
  it("opens as running with the tenant, provider and target, and closes with the outcome", async () => {
    const { admin, inserts, updates } = ledger();
    clock = 1_000;
    const result = await withMeasurementRun(
      admin,
      { tenantId: "t-1", provider: "gsc", target: "sc-domain:trumoveinc.com", strategy: "daily" },
      async () => {
        clock = 3_500;
        return "done";
      },
      now,
    );
    expect(result).toBe("done");
    expect(inserts).toEqual([
      {
        tenant_id: "t-1",
        provider: "gsc",
        target: "sc-domain:trumoveinc.com",
        strategy: "daily",
        actor_id: null,
        status: "running",
        cost_usd: 0,
      },
    ]);
    expect(updates).toEqual([
      {
        id: "run-1",
        patch: {
          status: "succeeded",
          error: null,
          finished_at: new Date(3_500).toISOString(),
          duration_ms: 2_500,
        },
      },
    ]);
  });

  it("closes a throwing attempt as failed with the message, and rethrows", async () => {
    const { admin, updates } = ledger();
    clock = 1_000;
    await expect(
      withMeasurementRun(
        admin,
        { tenantId: "t-1", provider: "gsc", target: "x" },
        async () => {
          throw new Error("quota exhausted");
        },
        now,
      ),
    ).rejects.toThrow("quota exhausted");
    expect(updates[0]?.patch).toMatchObject({ status: "failed", error: "quota exhausted" });
  });

  it("lets a caller close a run itself when the outcome is decided elsewhere", async () => {
    const { admin, updates } = ledger();
    const run = await openMeasurementRun(
      admin,
      { tenantId: "t-1", provider: "gsc", target: "x" },
      now,
    );
    await run.close("failed", "No Search Console property is selected.");
    expect(run.id).toBe("run-1");
    expect(updates[0]?.patch).toMatchObject({
      status: "failed",
      error: "No Search Console property is selected.",
    });
  });
});
