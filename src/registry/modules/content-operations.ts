import type { ModuleDefinition } from "../types";

/**
 * Content operations module. Every capability declares its true integration
 * state so the OS never presents a mock as a live connection.
 */
export const definition: ModuleDefinition = {
  module: "content-operations",
  capabilities: [
    {
      key: "lovable.ai_gateway",
      name: "Lovable AI Gateway",
      kind: "model",
      category: "AI",
      description: "Managed model access for every agent in the platform.",
      integrationState: "real",
      authKind: "platform_managed",
      operations: [
        { name: "chat.completion", description: "Generate text or structured output." },
        { name: "embeddings.create", description: "Embed content for retrieval." },
      ],
    },
    {
      key: "content.brief_builder",
      name: "Content Brief Builder",
      kind: "internal_module",
      category: "Content",
      description: "Turns a research summary into an editorial brief.",
      // pending until the workflow runner has an execution path for brief.create.
      integrationState: "pending",
      operations: [{ name: "brief.create", description: "Draft a brief.", mutates: true }],
    },
  ],
  agents: [
    {
      key: "content.strategist",
      name: "Content Strategist",
      purpose: "Plan and brief content that serves demand captured in research.",
      model: "google/gemini-3.5-flash",
      memoryScope: "asset",
      capabilities: ["lovable.ai_gateway", "content.brief_builder"],
      knowledge: ["brand.playbooks"],
      permissions: { mutating: true, requiresApproval: true },
    },
  ],
  workflows: [
    {
      key: "content.brief_pipeline",
      name: "Content Brief Pipeline",
      description: "Research a topic, draft a brief, then hold for editorial approval.",
      triggerKind: "schedule",
      graph: {
        nodes: [
          { key: "research", kind: "agent", ref: "content.strategist" },
          { key: "brief", kind: "capability", ref: "content.brief_builder" },
          { key: "approval", kind: "approval" },
        ],
        edges: [
          { from: "research", to: "brief" },
          { from: "brief", to: "approval" },
        ],
      },
    },
  ],
};
