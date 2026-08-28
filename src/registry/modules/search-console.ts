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
        {
          name: "properties.list",
          description: "List accessible properties with the permission level Google reports.",
        },
        {
          name: "performance.query",
          description: "Read finalized search performance for a selected property.",
        },
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
      operations: [
        { name: "rules.evaluate", description: "Score stored snapshots against typed thresholds." },
      ],
    },
    {
      key: "search.console.inspect",
      name: "Search Console Inspection Sweep",
      kind: "internal_module",
      category: "Analysis",
      description:
        "Quota-aware nightly URL inspection over the audited page set so index coverage is known for every page, not only hand-inspected ones. Read-only at Google.",
      integrationState: "real",
      operations: [
        {
          name: "urlInspection.sweep",
          description: "Inspect due pages, oldest inspection first, capped per run.",
        },
      ],
      config: { mutating: false, perRunCap: 25, refreshDays: 30 },
    },
    {
      key: "seo.validation",
      name: "SEO Validation Engine",
      kind: "internal_module",
      category: "Analysis",
      description:
        "Validates the site against finalized Search Console snapshots using typed SEO rules. Read-only: it never changes the site.",
      integrationState: "real",
      operations: [
        { name: "seo.validate", description: "Evaluate typed SEO rules over stored snapshots." },
      ],
      config: { mutating: false, dataState: "final", rulesEvaluated: 8 },
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
          { key: "inspect", kind: "capability", ref: "search.console.inspect" },
          { key: "evaluate", kind: "capability", ref: "search.console.rules" },
        ],
        edges: [
          { from: "collect", to: "inspect" },
          { from: "inspect", to: "evaluate" },
        ],
      },
    },
    {
      key: "wf.seo_validation",
      name: "SEO validation",
      description:
        "Validates the TruMove site against finalized Search Console snapshots with typed SEO rules.",
      triggerKind: "schedule",
      graph: {
        // The former first node referenced cap.knowledge_retrieval, a key no
        // module declares (it exists only in the 2026-08-04 seed migration) and
        // no runner path executes, so the step was a silent no-op. The rule
        // engine loads its own stored inputs; the node is removed rather than
        // declared, so a registry-only rebuild stays self-contained.
        nodes: [{ key: "validate", kind: "capability", ref: "seo.validation" }],
        edges: [],
      },
    },
  ],
};
