import type { ModuleDefinition } from "../types";

/** Agent integrations: the AOOS MCP server other AI clients connect to. */
export const definition: ModuleDefinition = {
  module: "agent-integrations",
  capabilities: [
    {
      key: "aoos.mcp",
      name: "AOOS MCP Server",
      kind: "mcp",
      category: "Agent integrations",
      description:
        "OAuth protected MCP endpoint at /mcp. External AI clients connect as a signed in operator and read AOOS. No write tools are exposed.",
      integrationState: "real",
      authKind: "oauth",
      operations: [
        { name: "list_inbox", description: "Read inbox items by lane." },
        { name: "list_recommendations", description: "Read recommendations by state or module." },
        { name: "get_recommendation", description: "Read one recommendation with sanitised detail." },
        { name: "list_workflow_runs", description: "Read recent workflow run history." },
        { name: "list_capabilities", description: "Read capability integration state and health." },
        { name: "list_assets", description: "Read the marketing asset registry." },
      ],
      config: { endpoint: "/mcp", readOnly: true },
    },
  ],
};
