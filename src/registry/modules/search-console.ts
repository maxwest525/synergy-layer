import type { ModuleDefinition } from "../types";

/**
 * Read-only Google Search Console observation module. No operation here can
 * change the site, Search Console, or an index state.
 */
export const definition: ModuleDefinition = {
  module: "search-console",
  capabilities: [
    {
      key: "search.console",
      name: "Google Search Console",
      kind: "connector",
      category: "Organic",
      description:
        "Read-only observation of accessible Search Console properties: finalized daily performance, dimensional rows, and sitemap status.",
      integrationState: "real",
      authKind: "oauth",
      operations: [
        { name: "properties.list", description: "List accessible properties with the permission level Google reports." },
        { name: "performance.query", description: "Read finalized search performance for a selected property." },
        { name: "sitemaps.status", description: "Read reported sitemap status. No submission." },
      ],
      config: {
        scope: "https://www.googleapis.com/auth/webmasters.readonly",
        reportingTimezone: "America/Los_Angeles",
        dataState: "final",
        mutating: false,
      },
    },
    {
      key: "search.console.rules",
      name: "Search Console Rule Engine",
      kind: "internal_module",
      category: "Analysis",
      description:
        "Evaluates stored snapshots and files evidence-backed observations. Zero rows is a valid no-change outcome.",
      integrationState: "real",
      operations: [{ name: "rules.evaluate", description: "Score stored snapshots against typed thresholds." }],
    },
  ],
  workflows: [
    {
      key: "gsc-daily-observe",
      name: "Search Console Daily Observation",
      description:
        "Collects the latest finalized Pacific reporting date, stores immutable snapshots, and files evidence-backed recommendations.",
      triggerKind: "schedule",
      graph: {
        nodes: [
          { key: "collect", kind: "capability", ref: "search.console" },
          { key: "evaluate", kind: "capability", ref: "search.console.rules" },
        ],
        edges: [{ from: "collect", to: "evaluate" }],
      },
    },
  ],
};
