import type { ModuleDefinition } from "../types";

/**
 * Google Analytics 4 reporting reads. Read only: nothing here can change the
 * property or the site. Every read stores an immutable snapshot plus a run
 * record with status, duration, and returned row counts.
 */
export const definition: ModuleDefinition = {
  module: "ga4",
  capabilities: [
    {
      key: "cap.ga4",
      name: "Google Analytics 4 (Data API)",
      kind: "connector",
      category: "Traffic",
      description:
        "Read-only page and event inventory from the GA4 Data API runReport endpoint, stored as immutable snapshots with the exact request window and provenance.",
      integrationState: "real",
      authKind: "service_account",
      operations: [
        {
          name: "runReport",
          description:
            "POST https://analyticsdata.googleapis.com/v1beta/{property}:runReport for hostname, page path, and event dimensions.",
        },
      ],
      config: {
        mutating: false,
        credentials: "server-side secrets only",
        endpoint: "https://analyticsdata.googleapis.com/v1beta/{property}:runReport",
        window: "28 days through yesterday",
      },
    },
  ],
  workflows: [
    {
      key: "ga4-daily-observe",
      name: "GA4 Daily Traffic Observation",
      description:
        "Reads the bound GA4 property once per day and stores an immutable snapshot. A failed read is recorded as a failure, never as zero traffic.",
      triggerKind: "schedule",
      graph: {
        nodes: [{ key: "collect", kind: "capability", ref: "cap.ga4" }],
        edges: [],
      },
    },
  ],
};
