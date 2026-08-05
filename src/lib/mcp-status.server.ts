import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import manifest from "../../.lovable/mcp/manifest.json";

type Client = SupabaseClient<Database>;

export type McpGrant = {
  clientId: string;
  operators: string[];
  calls: number;
  denied: number;
  lastCallAt: string | null;
  lastTool: string | null;
  lastOutcome: string | null;
};

export type McpCall = {
  at: string;
  clientId: string;
  operator: string;
  tool: string;
  outcome: string;
  durationMs: number | null;
};

export type McpStatus = {
  endpoint: string;
  readOnly: boolean;
  authType: string;
  issuer: string | null;
  tools: { name: string; title: string; readOnly: boolean }[];
  health: "healthy" | "degraded" | "unknown";
  grants: McpGrant[];
  recentCalls: McpCall[];
};

type Payload = {
  tool?: string;
  client_id?: string | null;
  operator_email?: string | null;
  outcome?: string;
  duration_ms?: number;
};

/** MCP health and active OAuth grants, derived from audited tool calls. */
export async function fetchMcpStatus(client: Client): Promise<McpStatus> {
  const { data } = await client
    .from("activity_events")
    .select("occurred_at, actor_id, verb, payload")
    .like("verb", "mcp.tool.%")
    .order("occurred_at", { ascending: false })
    .limit(200);

  const events = data ?? [];
  const recentCalls: McpCall[] = events.slice(0, 25).map((event) => {
    const payload = (event.payload ?? {}) as Payload;
    return {
      at: event.occurred_at,
      clientId: payload.client_id ?? event.actor_id ?? "unknown",
      operator: payload.operator_email ?? "unidentified",
      tool: payload.tool ?? "unknown",
      outcome: payload.outcome ?? event.verb.replace("mcp.tool.", ""),
      durationMs: typeof payload.duration_ms === "number" ? payload.duration_ms : null,
    };
  });

  const grants = new Map<string, McpGrant>();
  for (const event of events) {
    const payload = (event.payload ?? {}) as Payload;
    const clientId = payload.client_id ?? event.actor_id ?? "unknown";
    const outcome = payload.outcome ?? event.verb.replace("mcp.tool.", "");
    const grant = grants.get(clientId) ?? {
      clientId,
      operators: [],
      calls: 0,
      denied: 0,
      lastCallAt: null,
      lastTool: null,
      lastOutcome: null,
    };
    grant.calls += 1;
    if (outcome === "denied") grant.denied += 1;
    const operator = payload.operator_email;
    if (operator && !grant.operators.includes(operator)) grant.operators.push(operator);
    if (!grant.lastCallAt) {
      grant.lastCallAt = event.occurred_at;
      grant.lastTool = payload.tool ?? null;
      grant.lastOutcome = outcome;
    }
    grants.set(clientId, grant);
  }

  const failures = recentCalls.filter((call) => call.outcome === "failed").length;
  const health = recentCalls.length === 0 ? "unknown" : failures > 0 ? "degraded" : "healthy";

  return {
    endpoint: manifest.path,
    readOnly: manifest.mcp.tools.every((tool) => tool.annotations?.readOnlyHint === true),
    authType: manifest.auth.type,
    issuer: manifest.auth.issuer ?? null,
    tools: manifest.mcp.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      readOnly: tool.annotations?.readOnlyHint === true,
    })),
    health,
    grants: [...grants.values()],
    recentCalls,
  };
}
