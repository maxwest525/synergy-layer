import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { reconcileAppliedChangeEvidence } from "./change-requests.server";
import { reconcileChangeMeasurements } from "./change-measurements.server";
import { logActivity } from "./os.server";
import { observeSearchConsole } from "./search-console-observe.server";
import { collectDaily, getSelectedProperty } from "./search-console.server";

vi.mock("./search-console.server", () => ({
  SearchConsoleFailure: class SearchConsoleFailure extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  },
  getSelectedProperty: vi.fn(async () => "sc-domain:trumoveinc.com"),
  collectDaily: vi.fn(async () => ({
    property: "sc-domain:trumoveinc.com",
    reportingDate: "2026-08-09",
    snapshotIds: [],
    emptyResult: false,
  })),
}));

vi.mock("./search-console-rules.server", () => ({
  evaluateSnapshots: vi.fn(async () => ({ evaluated: 10, observations: 0, recommendations: 0 })),
}));

vi.mock("./change-measurements.server", () => ({
  reconcileChangeMeasurements: vi.fn(async () => ({ cycles: 0, windows: 0 })),
}));

vi.mock("./change-requests.server", () => ({
  reconcileAppliedChangeEvidence: vi.fn(async () => ({ waiting: 1, ready: 0, newlyReady: 0 })),
}));

vi.mock("./os.server", () => ({
  fileInboxItem: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
}));

function observationClient() {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          updates.push({ table, values });
          return {
            eq: vi.fn(async () => ({ data: null, error: null })),
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, updates };
}

describe("Search Console observation tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("timestamps the selected property and records a completed observation even when the latest day already existed", async () => {
    const { client, updates } = observationClient();
    const result = await observeSearchConsole(client);

    expect(result.ok).toBe(true);
    expect(getSelectedProperty).toHaveBeenCalledWith(client);
    expect(collectDaily).toHaveBeenCalledWith(client, "sc-domain:trumoveinc.com");
    expect(reconcileAppliedChangeEvidence).toHaveBeenCalledWith(client);
    expect(reconcileChangeMeasurements).toHaveBeenCalledWith(client);
    expect(
      updates.some(
        (entry) =>
          entry.table === "search_console_properties" && "last_observed_at" in entry.values,
      ),
    ).toBe(true);
    expect(logActivity).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        verb: "capability.observation_completed",
        payload: expect.objectContaining({ reportingDate: "2026-08-09", outcomeEvidenceReady: 0 }),
      }),
    );
  });
});
