import type { ModuleDefinition } from "../types";

/**
 * Self-hosted Umami traffic observation. Read only: nothing here can change the
 * site or the analytics instance. Umami is not GA4 and is never labelled as it.
 */
export const definition: ModuleDefinition = {
  module: "self-hosted-analytics",
  capabilities: [
    {
      key: "cap.umami",
      name: "Umami (self-hosted analytics)",
      kind: "connector",
      category: "Traffic",
      description:
        "Read-only observation of the operator's self-hosted Umami instance: site totals, daily series, top pages, and referrers, stored as immutable snapshots.",
      // pending until one authenticated read stores a snapshot.
      integrationState: "pending",
      authKind: "token_login",
      operations: [
        { name: "heartbeat", description: "Check the instance answers before any read." },
        { name: "websites.list", description: "List the properties the credentials can read." },
        {
          name: "stats.read",
          description: "Read totals for a window: pageviews, visitors, visits.",
        },
        { name: "pageviews.read", description: "Read the daily pageview and session series." },
        { name: "metrics.read", description: "Read top pages and referrers for a window." },
      ],
      config: {
        mutating: false,
        credentials: "server-side secrets only",
        note: "Umami counts visits with its own cookieless heuristic. Never present it as GA4.",
      },
    },
  ],
  workflows: [
    {
      key: "umami-daily-observe",
      name: "Umami Daily Traffic Observation",
      description:
        "Reads the self-hosted Umami instance once per day and stores immutable traffic snapshots. A failed read is recorded as a failure, never as zero traffic.",
      triggerKind: "schedule",
      graph: {
        nodes: [{ key: "collect", kind: "capability", ref: "cap.umami" }],
        edges: [],
      },
    },
  ],
};
