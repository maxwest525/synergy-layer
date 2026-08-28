import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "@/lib/os.server";
import { SERPAPI_PROVIDER_GATE } from "@/lib/serpapi/provider-gate";
import { allAgents, allCapabilities, allWorkflows, moduleDefinitions } from "./index";

type Client = SupabaseClient<Database>;

export type SyncResult = {
  modules: number;
  capabilities: number;
  agents: number;
  workflows: number;
  links: number;
};

/**
 * Upserts declared module definitions into the registry tables. Adding a new
 * module file is the only step needed to register new capability.
 */
export async function syncRegistryDefinitions(client: Client): Promise<SyncResult> {
  const capabilities = allCapabilities();
  const agents = allAgents();
  const workflows = allWorkflows();

  if (capabilities.length > 0) {
    // The SerpApi provider gate is the one capability whose state is earned at
    // runtime: recordSerpApiAccountStatus (serpapi/account.server.ts) promotes
    // it to "real" when the free account probe succeeds, and demotes it back
    // when the probe fails. Its declared state stays "pending" because the
    // registry cannot know the account is valid, so an unconditional overwrite
    // here would silently revert the promotion on every sync. Preserve the
    // stored state for that key alone; every other capability's state is the
    // registry's claim and the registry wins.
    const { data: gateRow, error: gateError } = await client
      .from("capabilities")
      .select("integration_state")
      .eq("key", SERPAPI_PROVIDER_GATE)
      .maybeSingle();
    if (gateError) throw new Error(gateError.message);

    const { error } = await client.from("capabilities").upsert(
      capabilities.map((capability) => ({
        key: capability.key,
        name: capability.name,
        kind: capability.kind,
        category: capability.category ?? null,
        description: capability.description ?? null,
        integration_state:
          capability.key === SERPAPI_PROVIDER_GATE &&
          capability.integrationState === "pending" &&
          gateRow?.integration_state === "real"
            ? "real"
            : capability.integrationState,
        auth_kind: capability.authKind ?? null,
        operations: (capability.operations ?? []) as never,
        config: (capability.config ?? {}) as never,
      })),
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
  }

  if (workflows.length > 0) {
    const { error } = await client.from("workflows").upsert(
      workflows.map((workflow) => ({
        key: workflow.key,
        name: workflow.name,
        description: workflow.description ?? null,
        trigger_kind: workflow.triggerKind,
        graph: workflow.graph as never,
      })),
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
  }

  if (agents.length > 0) {
    const { error } = await client.from("agents").upsert(
      agents.map((agent) => ({
        key: agent.key,
        name: agent.name,
        purpose: agent.purpose,
        description: agent.description ?? null,
        model: agent.model,
        memory_scope: agent.memoryScope,
        permissions: (agent.permissions ?? {}) as never,
      })),
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
  }

  const links = await linkAgents(client);

  await logActivity(client, {
    verb: "registry.synced",
    subjectKind: "registry",
    summary: `Registry synced: ${capabilities.length} capabilities, ${agents.length} agents, ${workflows.length} workflows.`,
  });

  return {
    modules: moduleDefinitions.length,
    capabilities: capabilities.length,
    agents: agents.length,
    workflows: workflows.length,
    links,
  };
}

async function linkAgents(client: Client): Promise<number> {
  const agents = allAgents();
  const { data: agentRows, error: agentError } = await client.from("agents").select("id, key");
  if (agentError) throw new Error(agentError.message);
  const { data: capabilityRows, error: capabilityError } = await client
    .from("capabilities")
    .select("id, key");
  if (capabilityError) throw new Error(capabilityError.message);

  const agentIds = new Map((agentRows ?? []).map((row) => [row.key, row.id]));
  const capabilityIds = new Map((capabilityRows ?? []).map((row) => [row.key, row.id]));

  const rows = agents.flatMap((agent) =>
    agent.capabilities
      .map((key) => ({ agentId: agentIds.get(agent.key), capabilityId: capabilityIds.get(key) }))
      .filter((row) => row.agentId && row.capabilityId)
      .map((row) => ({ agent_id: row.agentId!, capability_id: row.capabilityId! })),
  );

  if (rows.length === 0) return 0;
  const { error } = await client
    .from("agent_capabilities")
    .upsert(rows, { onConflict: "agent_id,capability_id" });
  if (error) throw new Error(error.message);
  return rows.length;
}
