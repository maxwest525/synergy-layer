import type { ToolContext, ToolHandlerResult } from "@lovable.dev/mcp-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { errorResult } from "./result";
import { supabaseForUser } from "./supabase";

type Client = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["app_role"];

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CALLS = 60;
const recentCalls = new Map<string, number[]>();

/** Best effort per-caller rate limit. Worker instances are short lived, so this
 * throttles bursts from one client rather than acting as a hard global quota. */
function rateLimited(key: string): boolean {
  const now = Date.now();
  const window = (recentCalls.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  window.push(now);
  recentCalls.set(key, window);
  return window.length > RATE_MAX_CALLS;
}

async function rolesFor(userId: string): Promise<Role[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((row) => row.role);
}

type AuditInput = {
  tool: string;
  outcome: "succeeded" | "denied" | "failed" | "rate_limited";
  durationMs: number;
  clientId: string | null;
  userId: string | null;
  userEmail: string | null;
  roles: Role[];
  argumentKeys: string[];
  detail?: string;
};

/** The operator's active workspace, so the audit row is tenant-scoped rather than shared. */
async function activeTenantFor(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.active_tenant_id ?? null;
}

/** Every MCP tool call is filed to Activity: client, operator, tool, timestamp,
 * duration, and outcome. Arguments are recorded by key only and tokens never are. */
async function audit(input: AuditInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("activity_events").insert({
      tenant_id: await activeTenantFor(input.userId),
      actor_kind: "mcp_client",
      actor_id: input.clientId ?? "unknown_client",
      verb: `mcp.tool.${input.outcome}`,
      subject_kind: "mcp_tool",
      subject_id: null,
      summary: `${input.clientId ?? "Unknown client"} called ${input.tool} as ${
        input.userEmail ?? "unidentified operator"
      }: ${input.outcome}${input.detail ? ` (${input.detail})` : ""}.`,
      payload: {
        tool: input.tool,
        client_id: input.clientId,
        operator_id: input.userId,
        operator_email: input.userEmail,
        roles: input.roles,
        outcome: input.outcome,
        duration_ms: input.durationMs,
        argument_keys: input.argumentKeys,
        detail: input.detail ?? null,
      } as never,
    });
  } catch {
    // Auditing must never break a read. Failures surface in server logs only.
  }
}

/**
 * Wraps a read-only MCP tool: authentication, operator role check, rate limit,
 * error containment, and audit logging. Unprovisioned users are refused here
 * even though the table read policies are open to any authenticated session.
 */
export async function guardedRead(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  run: (supabase: Client) => Promise<ToolHandlerResult>,
): Promise<ToolHandlerResult> {
  const startedAt = Date.now();
  const clientId = ctx.getClientId() ?? null;
  const argumentKeys = Object.keys(args).filter((key) => args[key] !== undefined);

  if (!ctx.isAuthenticated()) {
    await audit({
      tool,
      outcome: "denied",
      durationMs: Date.now() - startedAt,
      clientId,
      userId: null,
      userEmail: null,
      roles: [],
      argumentKeys,
      detail: "unauthenticated",
    });
    return errorResult("Not authenticated. Connect through the AOOS authorization flow.");
  }

  const userId = ctx.getUserId() ?? null;
  const userEmail = ctx.getUserEmail() ?? null;
  const roles = userId ? await rolesFor(userId) : [];
  const isOperator = roles.includes("admin") || roles.includes("operator");

  if (!isOperator) {
    await audit({
      tool,
      outcome: "denied",
      durationMs: Date.now() - startedAt,
      clientId,
      userId,
      userEmail,
      roles,
      argumentKeys,
      detail: "not_provisioned",
    });
    return errorResult(
      "This account is authenticated but not provisioned for AOOS. Ask an administrator for operator access.",
    );
  }

  if (rateLimited(`${clientId ?? "unknown"}:${userId}`)) {
    await audit({
      tool,
      outcome: "rate_limited",
      durationMs: Date.now() - startedAt,
      clientId,
      userId,
      userEmail,
      roles,
      argumentKeys,
    });
    return errorResult("Rate limit reached. Wait a minute before calling AOOS tools again.");
  }

  try {
    const result = await run(supabaseForUser(ctx));
    await audit({
      tool,
      outcome: result.isError ? "failed" : "succeeded",
      durationMs: Date.now() - startedAt,
      clientId,
      userId,
      userEmail,
      roles,
      argumentKeys,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected tool failure.";
    await audit({
      tool,
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      clientId,
      userId,
      userEmail,
      roles,
      argumentKeys,
      detail: message,
    });
    return errorResult("The tool call could not be completed.");
  }
}
