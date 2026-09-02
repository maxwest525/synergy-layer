import type { ModuleDefinition } from "../types";

/**
 * Content operations module. Every capability declares its true integration
 * state so the OS never presents a mock as a live connection. It used to
 * declare an agent (`content.strategist`) and a workflow built on it
 * (`content.brief_pipeline`); the agent runtime throws on every call and the
 * runner refuses any graph with an agent node, so both described something
 * that did not exist (CODE-14). A declaration returns the day the runtime does.
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
};
