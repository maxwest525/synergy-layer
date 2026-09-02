import { describe, expect, it } from "vitest";

import { AiBudgetExceeded, assertAiBudget, recordAiSpend } from "./budget.server";

const TENANT_ID = "tenant-1";

/**
 * A minimal fake covering exactly the tables `assertAiBudget`/`recordAiSpend`
 * touch: the budget row itself, the per-call ledger, and (only when an alert
 * threshold is crossed) `inbox_items`/`activity_events` via `fileInboxItem`/
 * `logActivity`, which both re-validate the tenant id against `tenants`
 * first. No real Supabase client is spun up -- this is plain in-memory state,
 * the same shape `runtime.server.test.ts`'s `fakeStore` uses for the same
 * reason: the behaviour under test is the arithmetic and the gating, not
 * Postgres.
 */
function fakeClient(
  initial: {
    ceilingUsd?: number;
    spentUsd?: number;
    hardStop?: boolean;
    alertsFired?: number[];
  } = {},
) {
  const budget = {
    id: "budget-1",
    period_month: `${new Date().toISOString().slice(0, 7)}-01`,
    ceiling_usd: initial.ceilingUsd ?? 300,
    spent_usd: initial.spentUsd ?? 0,
    hard_stop: initial.hardStop ?? true,
    alerts_fired: initial.alertsFired ?? ([] as number[]),
  };
  const requests: Record<string, unknown>[] = [];
  const inboxItems: Record<string, unknown>[] = [];
  const activityEvents: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      if (table === "ai_gateway_budgets") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { ...budget }, error: null }) }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              Object.assign(budget, patch);
              return { error: null };
            },
          }),
        };
      }
      if (table === "ai_gateway_requests") {
        return {
          insert: async (row: Record<string, unknown>) => {
            requests.push(row);
            return { error: null };
          },
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: TENANT_ID }, error: null }) }),
          }),
        };
      }
      if (table === "inbox_items") {
        return {
          insert: async (row: Record<string, unknown>) => {
            inboxItems.push(row);
            return { error: null };
          },
        };
      }
      if (table === "activity_events") {
        return {
          insert: async (row: Record<string, unknown>) => {
            activityEvents.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { client, budget, requests, inboxItems, activityEvents };
}

describe("the AI model spend ceiling", () => {
  it("lets a call through when the estimate stays under the ceiling", async () => {
    const { client } = fakeClient({ ceilingUsd: 10, spentUsd: 1 });
    await expect(assertAiBudget(client, TENANT_ID, 0.5)).resolves.toMatchObject({
      spentUsd: 1,
      ceilingUsd: 10,
    });
  });

  it("refuses a call whose estimate would cross the ceiling", async () => {
    const { client } = fakeClient({ ceilingUsd: 10, spentUsd: 9.8 });
    await expect(assertAiBudget(client, TENANT_ID, 0.5)).rejects.toThrow(AiBudgetExceeded);
  });

  it("does not gate spend at all once hard_stop is turned off", async () => {
    const { client } = fakeClient({ ceilingUsd: 10, spentUsd: 50, hardStop: false });
    await expect(assertAiBudget(client, TENANT_ID, 1000)).resolves.toMatchObject({
      hardStop: false,
    });
  });

  it("records the real cost, not the pre-call estimate", async () => {
    const { client, budget, requests } = fakeClient({ ceilingUsd: 10, spentUsd: 1 });
    await recordAiSpend(client, TENANT_ID, 0.25, {
      surface: "page_wording",
      model: "google/gemini-3.6-flash",
      inputTokens: 500,
      outputTokens: 120,
      priced: true,
    });

    expect(budget.spent_usd).toBeCloseTo(1.25, 6);
    expect(requests).toEqual([
      expect.objectContaining({
        tenant_id: TENANT_ID,
        surface: "page_wording",
        model: "google/gemini-3.6-flash",
        input_tokens: 500,
        output_tokens: 120,
        cost_usd: 0.25,
        priced: true,
      }),
    ]);
  });

  it("fires exactly one inbox alert the first time a threshold is crossed, not on every call after", async () => {
    const { client, inboxItems, activityEvents } = fakeClient({ ceilingUsd: 10, spentUsd: 4.9 });

    await recordAiSpend(client, TENANT_ID, 0.2, {
      surface: "page_wording",
      model: "m",
      inputTokens: 1,
      outputTokens: 1,
      priced: true,
    });
    expect(inboxItems).toHaveLength(1);
    expect(inboxItems[0]).toMatchObject({ lane: "fyi" });
    expect(activityEvents).toHaveLength(1);

    // A second call that does not cross a new threshold fires nothing more.
    await recordAiSpend(client, TENANT_ID, 0.01, {
      surface: "page_wording",
      model: "m",
      inputTokens: 1,
      outputTokens: 1,
      priced: true,
    });
    expect(inboxItems).toHaveLength(1);
  });

  it("marks the alert needs_attention once spend reaches the ceiling itself", async () => {
    const { client, inboxItems } = fakeClient({ ceilingUsd: 10, spentUsd: 9.99, hardStop: false });
    await recordAiSpend(client, TENANT_ID, 0.5, {
      surface: "knowledge_embedding",
      model: "gemini-embedding-001",
      inputTokens: 1,
      outputTokens: 0,
      priced: true,
    });
    expect(inboxItems.at(-1)).toMatchObject({ lane: "needs_attention" });
  });
});
