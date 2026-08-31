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
  operations?: CapabilityOperation[];
  config?: Record<string, unknown>;
};

/**
 * One callable thing a capability exposes.
 *
 * `endpoint` and `verified` exist because of a bug on 2026-08-31: the Google Ads
 * reporting read was written with `pageSize: 10000`, which v25 rejects outright.
 * Every mocked test passed, because a mock answers whatever it is sent, and only
 * a live call found it. Nothing in this repo recorded what that endpoint
 * actually accepts, so there was nowhere for the correction to live except a
 * code comment.
 *
 * `verified` is deliberately three-valued rather than a boolean. "We read the
 * docs" and "we called it and it worked" are different claims, and collapsing
 * them is how a guess becomes documentation.
 */
export type CapabilityOperation = {
  name: string;
  description: string;
  /** True when calling this can change or spend at the provider. */
  mutates?: boolean;
  /** The literal request, e.g. `POST /v25/customers/{id}/googleAds:search`. */
  endpoint?: string;
  /**
   * called   — exercised against the real provider, and it worked.
   * docs     — read from the vendor's documentation, never called from here.
   * declared — named in this registry and nothing more. Treat as unproven.
   */
  verified?: "called" | "docs" | "declared";
  /** ISO date the `verified` claim was last true. */
  verifiedOn?: string;
  /** Anything that cost time or would: rejected params, quotas, required headers. */
  gotcha?: string;
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
