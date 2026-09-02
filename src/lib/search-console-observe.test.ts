import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { reconcileAppliedChangeEvidence } from "./change-requests.server";
import { reconcileChangeMeasurements } from "./change-measurements.server";
import { logActivity } from "./os.server";
import { reconcileOutcomeAlerts } from "./outcome-alerts.server";
import { reconcilePublishWaitRollup } from "./publish-wait-rollup.server";
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

vi.mock("./outcome-alerts.server", () => ({
  reconcileOutcomeAlerts: vi.fn(async () => ({ failed: 0, filed: 0 })),
}));
vi.mock("./publish-wait-rollup.server", () => ({
  reconcilePublishWaitRollup: vi.fn(async () => ({
    waiting: 0,
    filed: false,
    updated: false,
    completed: false,
  })),
}));

vi.mock("./os.server", () => ({
  fileInboxItem: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
}));

const ledgerCloses: Array<{ status: string; error: string | null | undefined }> = [];
vi.mock("./measurement/run-ledger.server", () => ({
  openMeasurementRun: vi.fn(async () => ({
    id: "run-1",
    close: vi.fn(async (status: string, error?: string | null) => {
      ledgerCloses.push({ status, error });
    }),
  })),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

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
    ledgerCloses.length = 0;
  });

  it("timestamps the selected property and records a completed observation even when the latest day already existed", async () => {
    const { client, updates } = observationClient();
    const result = await observeSearchConsole(client, "tenant-1");

    expect(result.ok).toBe(true);
    expect(getSelectedProperty).toHaveBeenCalledWith(client, "tenant-1");
    expect(collectDaily).toHaveBeenCalledWith(client, "sc-domain:trumoveinc.com");
    expect(reconcileAppliedChangeEvidence).toHaveBeenCalledWith(client);
    expect(reconcileChangeMeasurements).toHaveBeenCalledWith(client);
    // After the day's windows are captured, failure verdicts reach the Inbox.
    expect(reconcileOutcomeAlerts).toHaveBeenCalledWith(client, "sc-domain:trumoveinc.com");
    // The group of changes waiting on the site publish is refreshed in the same
    // pass, after the verdict alerts, so the Inbox reads the day's true state.
    expect(reconcilePublishWaitRollup).toHaveBeenCalledWith(client);
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
