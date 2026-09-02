import type { ModuleDefinition } from "../types";

/**
 * Growth and acquisition module. It used to declare an agent
 * (`growth.analyst`) and a workflow built on it (`growth.weekly_scan`); the
 * agent runtime throws on every call and the runner refuses any graph with an
 * agent node, so both described something that did not exist (CODE-14). A
 * declaration returns the day the runtime does.
 */
export const definition: ModuleDefinition = {
  module: "growth-operations",
  capabilities: [
    {
      key: "google.ads",
      name: "Google Ads",
      kind: "connector",
      category: "Paid media",
      description:
        "Read-only Google Ads reporting. AOOS lists accessible customer resource names to prove access, and reads campaign-level impressions, clicks, cost and conversions day by day for the configured customer id. All writes remain unimplemented.",
      integrationState: "real",
      authKind: "oauth",
      operations: [
        {
          name: "customers.list_accessible",
          description:
            "List accessible customer resource names without reading campaigns or spend.",
          mutates: false,
        },
        {
          name: "campaigns.report_read",
          description:
            "Read campaign id, name, status, channel type, and daily impressions/clicks/cost/conversions for the trailing 30 days via GAQL search.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        provider: "google_ads_v25",
        prohibited: ["budget_writes", "bid_writes", "ad_writes"],
      },
    },
    {
      key: "growth.opportunity_scanner",
      name: "Opportunity Scanner",
      kind: "internal_module",
      category: "Analysis",
      description: "Scores gaps across owned assets and files recommendations.",
      // pending until the workflow runner has an execution path for scan.run.
      integrationState: "pending",
      operations: [{ name: "scan.run", description: "Produce scored opportunities." }],
    },
  ],
};
