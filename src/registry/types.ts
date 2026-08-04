import type { Database } from "@/integrations/supabase/types";

export type CapabilityDefinition = {
  key: string;
  name: string;
  kind: Database["public"]["Enums"]["capability_kind"];
  category?: string;
  description?: string;
  /** real | simulated | pending | mock — never claim more than is wired. */
  integrationState: "real" | "simulated" | "pending" | "mock";
  authKind?: string;
  operations?: { name: string; description: string; mutates?: boolean }[];
  config?: Record<string, unknown>;
};

export type AgentDefinition = {
  key: string;
  name: string;
  purpose: string;
  description?: string;
  model: string;
  memoryScope: Database["public"]["Enums"]["memory_scope"];
  capabilities: string[];
  knowledge?: string[];
  permissions?: { mutating: boolean; requiresApproval: boolean };
};

export type WorkflowDefinition = {
  key: string;
  name: string;
  description?: string;
  triggerKind: string;
  graph: {
    nodes: { key: string; kind: "agent" | "capability" | "approval" | "condition"; ref?: string }[];
    edges: { from: string; to: string }[];
  };
};

export type ModuleDefinition = {
  module: string;
  capabilities?: CapabilityDefinition[];
  agents?: AgentDefinition[];
  workflows?: WorkflowDefinition[];
};
