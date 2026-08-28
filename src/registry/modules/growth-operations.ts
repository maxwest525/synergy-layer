import type { ModuleDefinition } from "../types";

/** Growth and acquisition module. */
export const definition: ModuleDefinition = {
  module: "growth-operations",
  capabilities: [
    {
      key: "google.ads",
      name: "Google Ads",
      kind: "connector",
      category: "Paid media",
      description:
        "Read-only Google Ads account-access probe. AOOS can list accessible customer resource names to prove OAuth and developer-token access; campaign reads and all writes remain unimplemented.",
      integrationState: "real",
      authKind: "oauth",
      operations: [
        {
          name: "customers.list_accessible",
          description:
            "List accessible customer resource names without reading campaigns or spend.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        provider: "google_ads_v25",
        prohibited: ["campaign_reads", "budget_writes", "bid_writes", "ad_writes"],
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
  agents: [
    {
      key: "growth.analyst",
      name: "Growth Analyst",
      purpose: "Find and rank measurable growth opportunities across owned assets.",
      model: "google/gemini-3.5-flash",
      memoryScope: "global",
      capabilities: ["lovable.ai_gateway", "growth.opportunity_scanner", "search.console"],
      knowledge: ["growth.research"],
      permissions: { mutating: false, requiresApproval: true },
    },
  ],
  workflows: [
    {
      key: "growth.weekly_scan",
      name: "Weekly Growth Scan",
      description:
        "Scan assets, rank opportunities, and file recommendations to the Action Center.",
      triggerKind: "schedule",
      graph: {
        nodes: [
          { key: "scan", kind: "capability", ref: "growth.opportunity_scanner" },
          { key: "rank", kind: "agent", ref: "growth.analyst" },
        ],
        edges: [{ from: "scan", to: "rank" }],
      },
    },
  ],
};
