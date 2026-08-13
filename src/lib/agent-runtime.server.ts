import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "./os.server";

type Client = SupabaseClient<Database>;

export type AgentRunResult = {
  agent: string;
  state: "succeeded" | "awaiting_approval" | "failed";
  summary: string;
};

/**
 * Reference agent execution path. Capability grants and the approval gate are
 * enforced here, before any model call is wired in.
 */
export async function runAgent(
  client: Client,
  agentId: string,
  userId: string,
): Promise<AgentRunResult> {
  const { data: agent, error } = await client
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!agent) throw new Error("Agent not found");

  const { data: grants, error: grantError } = await client
    .from("agent_capabilities")
    .select("capabilities(key, name, integration_state)")
    .eq("agent_id", agentId);
  if (grantError) throw new Error(grantError.message);

  const granted = (grants ?? [])
    .map((row) => row.capabilities)
    .filter((capability): capability is NonNullable<typeof capability> => Boolean(capability));
  const unavailable = granted.filter((capability) => capability.integration_state !== "real");

  const permissions = (agent.permissions ?? {}) as { requiresApproval?: boolean; mutating?: boolean };
  const startedAt = new Date().toISOString();

  if (permissions.requiresApproval) {
    await client
      .from("agents")
      .update({
        last_run_at: startedAt,
        current_task: "Awaiting approval before acting",
        last_result: {
          state: "awaiting_approval",
          grantedCapabilities: granted.map((capability) => capability.key),
        } as never,
      })
      .eq("id", agentId);

    await fileInboxItem(client, {
      lane: "pending_approval",
      sourceModule: "agents",
      title: `${agent.name} requested approval`,
      summary: "Approval continuation is not wired. Open the agent detail to inspect the parked request.",
      priority: 2,
      subjectKind: "agent",
      subjectId: agentId,
      actions: [{ kind: "open", href: `/agents/${agentId}` }],
    });

    await logActivity(client, {
      actorKind: "user",
      actorId: userId,
      verb: "agent.awaiting_approval",
      subjectKind: "agent",
      subjectId: agentId,
      summary: `${agent.name} paused for approval.`,
    });

    return {
      agent: agent.name,
      state: "awaiting_approval",
      summary: "Run parked for approval and filed to the Action Center.",
    };
  }

  const summary =
    unavailable.length > 0
      ? `Ran with ${granted.length - unavailable.length} live capabilities; ${unavailable.length} not authorised yet.`
      : `Ran with ${granted.length} live capabilities.`;

  await client
    .from("agents")
    .update({
      last_run_at: startedAt,
      current_task: null,
      health: unavailable.length > 0 ? "degraded" : "healthy",
      last_result: { state: "succeeded", summary } as never,
    })
    .eq("id", agentId);

  await logActivity(client, {
    actorKind: "user",
    actorId: userId,
    verb: "agent.run",
    subjectKind: "agent",
    subjectId: agentId,
    summary: `${agent.name}: ${summary}`,
  });

  return { agent: agent.name, state: "succeeded", summary };
}
