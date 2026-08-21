import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";

vi.mock("./search-console.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./search-console.server")>();
  return { ...actual, getSelectedProperty: vi.fn(async () => "sc-domain:site.com") };
});
vi.mock("./tenant.server", () => ({ requireTenantId: vi.fn(async () => "tenant-1") }));
vi.mock("./os.server", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("./observation-record", () => ({
  observationRecommendationRecord: vi.fn((input: unknown) => input),
}));

import { evaluateSeoRules, runSeoValidation } from "./seo-validation.server";
import { QUERY_DIMENSION_CAVEAT } from "./search-console-rule-checks";
import { RULE_WINDOW_DAYS, RULE_WINDOW_KIND, shiftDate } from "./search-console.server";

const row = (keys: string[], impressions: number, position: number, clicks = 0) => ({
  keys,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position,
});

function windowSnapshot(dimension: string, rows: ReturnType<typeof row>[]) {
  return {
    id: `${dimension}-window`,
    dimensions: [dimension],
    kind: RULE_WINDOW_KIND,
    period_end_pt: "2026-08-19",
    period_start_pt: "2026-07-23",
    payload: { rows },
    totals: null,
  };
}

function legacyDailySnapshot(dimension: string, rows: ReturnType<typeof row>[]) {
  return {
    id: `${dimension}-daily`,
    dimensions: [dimension],
    kind: "dimensional_rows",
    period_end_pt: "2026-08-19",
    period_start_pt: "2026-08-19",
    payload: { rows },
    totals: null,
  };
}

describe("evaluateSeoRules: pick() prefers the rule window over a legacy daily snapshot", () => {
  it("reads a window snapshot when both kinds exist for the same dimension", () => {
    // Window shows a real 28-day decline (120 -> 50); the legacy daily row for
    // the same page carries an unrelated number (999) that must not surface.
    const current = [
      windowSnapshot("page", [row(["https://site.com/a"], 50, 3, 0)]),
      legacyDailySnapshot("page", [row(["https://site.com/a"], 999, 3, 0)]),
    ];
    const prior = [windowSnapshot("page", [row(["https://site.com/a"], 120, 3, 0)])];
    const findings = evaluateSeoRules(current, prior, []);
    const finding = findings.find((f) => f.rule === "declining_impressions");
    expect(finding).toBeDefined();
    expect(finding?.current?.impressions).toBe(50);
    expect(finding?.windowDays).toBe(28);
  });

  it("falls back to the legacy daily snapshot when no window snapshot exists, and says so", () => {
    const current = [legacyDailySnapshot("page", [row(["https://site.com/a"], 200, 3, 0)])];
    const prior = [legacyDailySnapshot("page", [row(["https://site.com/a"], 500, 3, 5)])];
    const findings = evaluateSeoRules(current, prior, []);
    const declining = findings.find((f) => f.rule === "declining_impressions");
    expect(declining).toBeDefined();
    expect(declining?.windowDays).toBe(1);
  });
});

describe("evaluateSeoRules: query-dimension rules disclose the censorship caveat", () => {
  it("declining_position carries the caveat", () => {
    const current = [windowSnapshot("query", [row(["movers miami"], 60, 15)])];
    const prior = [windowSnapshot("query", [row(["movers miami"], 60, 8)])];
    const findings = evaluateSeoRules(current, prior, []);
    const finding = findings.find((f) => f.rule === "declining_position");
    expect(finding?.description).toContain(QUERY_DIMENSION_CAVEAT);
  });

  it("possible_query_overlap carries the caveat", () => {
    const pageQueryRows = (impressions: number) => [
      { keys: ["https://site.com/a", "movers miami"], clicks: 0, impressions, ctr: 0, position: 9 },
      {
        keys: ["https://site.com/b", "movers miami"],
        clicks: 0,
        impressions,
        ctr: 0,
        position: 11,
      },
    ];
    const overlapSnapshot = (id: string, rows: ReturnType<typeof pageQueryRows>) => ({
      id,
      dimensions: ["page", "query"],
      kind: "page_query",
      period_end_pt: "2026-08-19",
      period_start_pt: "2026-08-19",
      payload: { rows },
      totals: null,
    });
    const current = [overlapSnapshot("current-overlap", pageQueryRows(30))];
    const prior = [overlapSnapshot("prior-overlap", pageQueryRows(30))];
    const findings = evaluateSeoRules(current, prior, []);
    const finding = findings.find((f) => f.rule === "possible_query_overlap");
    expect(finding?.description).toContain(QUERY_DIMENSION_CAVEAT);
  });
});

describe("evaluateSeoRules: confidence is derived, not a bare literal", () => {
  it("declining_clicks confidence tracks the size of the drop", () => {
    const bigDrop = evaluateSeoRules(
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 20)])],
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 400)])],
      [],
    );
    const smallDrop = evaluateSeoRules(
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 15)])],
      [windowSnapshot("page", [row(["https://site.com/a"], 10, 5, 20)])],
      [],
    );
    const bigConfidence = bigDrop.find((f) => f.rule === "declining_clicks")?.confidence.value ?? 0;
    const smallConfidence =
      smallDrop.find((f) => f.rule === "declining_clicks")?.confidence.value ?? 0;
    expect(bigConfidence).toBeGreaterThan(smallConfidence);
  });
});

/**
 * A minimal thenable Supabase query-builder mock. Each `.from(table)` call
 * gets fresh state; every chain method records what it was called with and
 * returns the same object, and `await`ing the chain at any point resolves it
 * via `then`, matching how the real Supabase client is used without a
 * terminal call everywhere.
 */
function runSeoValidationClient(options: {
  dateRows: { period_end_pt: string }[];
  rowsByDate: Record<string, unknown[]>;
}) {
  function chain(table: string) {
    const state: {
      selectedCols: string | undefined;
      filters: Record<string, unknown>;
      wrote: boolean;
    } = {
      selectedCols: undefined,
      filters: {},
      wrote: false,
    };
    const resolve = () =>
      Promise.resolve().then(() => {
        if (table === "search_console_properties") return { data: null, error: null };
        if (table === "search_console_snapshots") {
          if (state.selectedCols === "period_end_pt") {
            return { data: options.dateRows, error: null };
          }
          const date = state.filters["period_end_pt"] as string | undefined;
          return { data: date ? (options.rowsByDate[date] ?? []) : [], error: null };
        }
        if (table === "knowledge_entries") return { data: [], error: null };
        if (table === "competitor_candidates") return { data: [], error: null };
        if (table === "recommendations") {
          return state.wrote ? { data: { id: "rec-1" }, error: null } : { data: null, error: null };
        }
        if (table === "recommendation_targets") return { data: null, error: null };
        if (table === "search_console_observations") return { data: null, error: null };
        throw new Error(`runSeoValidationClient: unhandled table "${table}"`);
      });
    const api: {
      select: (cols?: string) => typeof api;
      eq: (col: string, val: unknown) => typeof api;
      not: () => typeof api;
      order: () => typeof api;
      limit: () => typeof api;
      insert: (payload: unknown) => typeof api;
      upsert: (payload: unknown) => typeof api;
      maybeSingle: () => Promise<unknown>;
      single: () => Promise<unknown>;
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => unknown;
    } = {
      select(cols) {
        state.selectedCols = cols;
        return api;
      },
      eq(col, val) {
        state.filters[col] = val;
        return api;
      },
      not: () => api,
      order: () => api,
      limit: () => api,
      insert() {
        state.wrote = true;
        return api;
      },
      upsert() {
        state.wrote = true;
        return api;
      },
      maybeSingle: () => resolve(),
      single: () => resolve(),
      then: (onFulfilled, onRejected) => resolve().then(onFulfilled, onRejected),
    };
    return api;
  }
  return { from: (table: string) => chain(table) } as unknown as SupabaseClient<Database>;
}

describe("runSeoValidation: the comparison window is 28 days back, not 1", () => {
  it("uses the window that ends 28 days back, ignoring the daily-written snapshot one day back", () => {
    const reportingDate = "2026-08-19";
    const oneDayBack = shiftDate(reportingDate, -1);
    const twentyEightDaysBack = shiftDate(reportingDate, -RULE_WINDOW_DAYS);
    const page = "https://site.com/a";

    const client = runSeoValidationClient({
      dateRows: [
        { period_end_pt: reportingDate },
        { period_end_pt: oneDayBack },
        { period_end_pt: twentyEightDaysBack },
      ],
      rowsByDate: {
        [reportingDate]: [windowSnapshot("page", [row([page], 50, 3, 0)])],
        // Decoy: if the code wrongly picked "the next most recent date"
        // instead of the real 28-day-back window, this row would surface —
        // its impression count is below decliningImpressions' own baseline
        // floor, so using it would silently produce no finding at all.
        [oneDayBack]: [windowSnapshot("page", [row([page], 45, 3, 0)])],
        [twentyEightDaysBack]: [windowSnapshot("page", [row([page], 120, 3, 0)])],
      },
    });

    return runSeoValidation(client, null).then((result) => {
      expect(result.comparisonDate).toBe(twentyEightDaysBack);
      expect(result.comparisonDate).not.toBe(oneDayBack);
      const declining = result.rulesTriggered.includes("declining_impressions");
      expect(declining).toBe(true);
    });
  });
});
