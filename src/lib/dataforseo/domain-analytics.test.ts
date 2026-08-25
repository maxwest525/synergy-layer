import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";

vi.mock("../os.server", () => ({
  logActivity: vi.fn(async () => undefined),
  fileInboxItem: vi.fn(async () => undefined),
}));

import {
  collectDomainTechnologies,
  collectWhoisOverview,
  DOMAIN_ANALYTICS_CONFIG,
} from "./domain-analytics.server";

type Captured = {
  requests: Record<string, unknown>[];
  snapshots: Record<string, unknown>[];
};

/**
 * The transport reaches Postgres on every path — budget read, ledger row,
 * snapshot write — so a table-keyed fake is what lets these tests exercise the
 * real transport rather than mocking it away.
 */
function fakeClient(state: {
  spentUsd?: number;
  ceilingUsd?: number;
  existingSnapshot?: { id: string; returned_row_count: number } | null;
}): { client: SupabaseClient<Database>; captured: Captured } {
  const captured: Captured = { requests: [], snapshots: [] };

  const chainOf = (result: { data: unknown; error: null }) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };

  const client = {
    from(table: string) {
      const query =
        table === "dataforseo_budgets"
          ? {
              data: {
                id: "budget-1",
                period_month: "2026-08-01",
                ceiling_usd: state.ceilingUsd ?? 300,
                spent_usd: state.spentUsd ?? 0,
                hard_stop: true,
                alerts_fired: [],
              },
              error: null as null,
            }
          : { data: state.existingSnapshot ?? null, error: null as null };

      return {
        select: () => chainOf(query),
        insert: (row: Record<string, unknown>) => {
          if (table === "dataforseo_requests") captured.requests.push(row);
          if (table === "dataforseo_snapshots") captured.snapshots.push(row);
          return chainOf({ data: { id: `${table}-row` }, error: null });
        },
        update: () => chainOf({ data: null, error: null }),
      };
    },
  } as unknown as SupabaseClient<Database>;

  return { client, captured };
}

// Stated assumption: these envelopes follow the shapes published on
// docs.dataforseo.com for the two Domain Analytics live endpoints, not a live
// snapshot. Diff the first real snapshot against them and update both together.
const technologiesEnvelope = {
  version: "0.1.20260327",
  status_code: 20000,
  status_message: "Ok.",
  time: "1.2276 sec.",
  cost: 0.01,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [
    {
      id: "task-tech",
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.01,
      result_count: 1,
      result: [
        {
          type: "domain_technology_item",
          domain: "rival.test",
          title: "Rival Moving Co.",
          domain_rank: 455,
          last_visited: "2026-08-20 17:19:25 +00:00",
          country_iso_code: "US",
          technologies: { content: { cms: ["WordPress"] } },
        },
      ],
    },
  ],
};

const whoisEnvelope = {
  version: "0.1.20260327",
  status_code: 20000,
  status_message: "Ok.",
  time: "10.8848 sec.",
  cost: 0.102,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [
    {
      id: "task-whois",
      status_code: 20000,
      status_message: "Ok.",
      cost: 0.102,
      result_count: 1,
      result: [
        {
          total_count: 131036623,
          items_count: 2,
          offset: 0,
          offset_token: "token-abc",
          items: [
            {
              domain: "rival.test",
              created_datetime: "2005-02-15 03:13:12 +00:00",
              expiration_datetime: "2027-02-15 03:13:12 +00:00",
              tld: "test",
              registered: true,
              registrar: "MarkMonitor Inc.",
              backlinks_info: { referring_domains: 2077, backlinks: 36153 },
            },
            {
              domain: "other.test",
              created_datetime: "2011-01-04 09:00:00 +00:00",
              expiration_datetime: "2028-01-04 09:00:00 +00:00",
              tld: "test",
              registered: true,
              registrar: "GoDaddy.com, LLC",
              backlinks_info: { referring_domains: 401, backlinks: 5120 },
            },
          ],
        },
      ],
    },
  ],
};

function stubFetch(envelope: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope));
  vi.stubEnv("DATAFORSEO_BASIC_TOKEN", "test-token");
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the request each Domain Analytics collector puts on the wire", () => {
  it("posts one technologies task carrying only the target domain", async () => {
    const fetcher = stubFetch(technologiesEnvelope);
    const { client } = fakeClient({});

    await collectDomainTechnologies(client, "tenant-1", "rival.test");

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.dataforseo.com/v3/domain_analytics/technologies/domain_technologies/live",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Basic test-token" },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual([
      { target: "rival.test" },
    ]);
  });

  it("sends the whois filters server-side with the default limit", async () => {
    const fetcher = stubFetch(whoisEnvelope);
    const { client } = fakeClient({});

    await collectWhoisOverview(client, "tenant-1", {
      label: "movers with real link equity",
      filters: [["backlinks_info.referring_domains", ">", 100]],
    });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.dataforseo.com/v3/domain_analytics/whois/overview/live",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual([
      {
        limit: DOMAIN_ANALYTICS_CONFIG.whoisLimit,
        filters: [["backlinks_info.referring_domains", ">", 100]],
      },
    ]);
  });

  it("clamps a whois limit above the documented provider maximum", async () => {
    const fetcher = stubFetch(whoisEnvelope);
    const { client } = fakeClient({});

    await collectWhoisOverview(client, "tenant-1", {
      label: "every com domain",
      filters: [["tld", "=", "com"]],
      limit: 50000,
    });

    const [task] = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { limit: number }[];
    expect(task?.limit).toBe(DOMAIN_ANALYTICS_CONFIG.whoisMaxLimit);
  });

  it("refuses an unfiltered whois read before spending anything", async () => {
    const fetcher = stubFetch(whoisEnvelope);
    const { client } = fakeClient({});

    await expect(
      collectWhoisOverview(client, "tenant-1", { label: "everything", filters: [] }),
    ).rejects.toThrow("at least one filter");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("what each collector stores from a realistic envelope", () => {
  it("keeps the technologies item and lifts domain rank into totals", async () => {
    stubFetch(technologiesEnvelope);
    const { client, captured } = fakeClient({});

    const result = await collectDomainTechnologies(client, "tenant-1", "rival.test");

    expect(result).toMatchObject({ created: true, rows: 1, costUsd: 0.01 });
    const snapshot = captured.snapshots[0];
    expect(snapshot?.["kind"]).toBe("domain_technologies");
    expect(snapshot?.["target"]).toBe("rival.test");
    expect(snapshot?.["totals"]).toEqual({
      domainRank: 455,
      lastVisited: "2026-08-20 17:19:25 +00:00",
    });
    expect((snapshot?.["payload"] as { rows: { domain: string }[] }).rows[0]?.domain).toBe(
      "rival.test",
    );
  });

  it("unwraps the whois items array and records the index-wide total count", async () => {
    stubFetch(whoisEnvelope);
    const { client, captured } = fakeClient({});

    const result = await collectWhoisOverview(client, "tenant-1", {
      label: "movers with real link equity",
      filters: [["backlinks_info.referring_domains", ">", 100]],
    });

    expect(result).toMatchObject({ created: true, rows: 2, costUsd: 0.102 });
    const snapshot = captured.snapshots[0];
    expect(snapshot?.["totals"]).toEqual({ totalCount: 131036623, offsetToken: "token-abc" });
    expect(snapshot?.["possibly_truncated"]).toBe(false);
    expect(captured.requests[0]).toMatchObject({
      family: "domain_analytics",
      capability_key: "cap.dataforseo_domain_analytics",
      endpoint: "/domain_analytics/whois/overview/live",
      cost_usd: 0.102,
      outcome: "succeeded",
    });
  });

  it("returns the stored snapshot without re-buying it when the fingerprint is known", async () => {
    const fetcher = stubFetch(technologiesEnvelope);
    const { client } = fakeClient({
      existingSnapshot: { id: "snapshot-earlier", returned_row_count: 1 },
    });

    const result = await collectDomainTechnologies(client, "tenant-1", "rival.test");

    expect(result).toEqual({
      snapshotId: "snapshot-earlier",
      created: false,
      rows: 1,
      costUsd: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("the guards the shared transport applies to this family", () => {
  it("stops on the monthly ceiling before a request is made", async () => {
    const fetcher = stubFetch(technologiesEnvelope);
    const { client } = fakeClient({ spentUsd: 299.99, ceilingUsd: 300 });

    await expect(collectDomainTechnologies(client, "tenant-1", "rival.test")).rejects.toThrow(
      "monthly ceiling reached",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces a failing provider task instead of storing an empty snapshot", async () => {
    stubFetch({
      ...technologiesEnvelope,
      tasks: [
        {
          id: "task-tech",
          status_code: 40400,
          status_message: "Not Found.",
          cost: 0,
          result_count: 0,
          result: null,
        },
      ],
    });
    const { client, captured } = fakeClient({});

    await expect(collectDomainTechnologies(client, "tenant-1", "rival.test")).rejects.toThrow(
      "40400",
    );
    expect(captured.snapshots).toHaveLength(0);
    expect(captured.requests[0]).toMatchObject({ outcome: "provider_error" });
  });
});
