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
      description: "Campaign, budget, and performance access for paid search.",
      integrationState: "pending",
      authKind: "oauth",
      operations: [
        { name: "campaigns.list", description: "Read campaign structure." },
        { name: "budgets.update", description: "Change a campaign budget.", mutates: true },
      ],
    },
    {
      key: "growth.opportunity_scanner",
      name: "Opportunity Scanner",
      kind: "internal_module",
      category: "Analysis",
      description: "Scores gaps across owned assets and files recommendations.",
      integrationState: "real",
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
