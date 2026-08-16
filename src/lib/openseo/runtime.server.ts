import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import { classifyOpenSeoTool } from "./catalog";
import { callOpenSeoTool, discoverOpenSeo } from "./mcp.server";
import type {
  OpenSeoCallResult,
  OpenSeoDiscovery,
  OpenSeoMcpTool,
  OpenSeoToolClassification,
} from "./types";

type Client = SupabaseClient<Database>;

export type OpenSeoOperatorContext = {
  supabase: Client;
  userId: string;
};

export type OpenSeoInvocationInput = {
  toolName: string;
  arguments: Record<string, unknown>;
  confirmed: boolean;
};

type RuntimeOptions = {
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

const SENSITIVE_KEY = /(?:api[-_]?key|token|secret|password|authorization|credential)/i;
const URL_WITH_CREDENTIALS = /^[a-z][a-z\d+.-]*:\/\//i;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    if (/^(?:basic|bearer)\s+/i.test(value)) return "[redacted]";
    if (URL_WITH_CREDENTIALS.test(value)) {
      try {
        const url = new URL(value);
        if (url.username || url.password) {
          url.username = "";
          url.password = "";
          return url.toString().replace(/\/$/, "");
        }
      } catch {
        return "[redacted]";
      }
    }
    return value;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeValue(item, depth + 1),
      ]),
  );
}

function asNonNegativeNumber(value: unknown): number | null {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function extractCredits(value: unknown): { charged: number | null; remaining: number | null } {
  let charged: number | null = null;
  let remaining: number | null = null;

  function visit(candidate: unknown, depth = 0): void {
    if (depth > 8 || !candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) {
      const normalized = key.replace(/[-_]/g, "").toLowerCase();
      if (charged === null && ["creditscharged", "creditsused"].includes(normalized)) {
        charged = asNonNegativeNumber(item);
      }
      if (remaining === null && normalized === "creditsremaining") {
        remaining = asNonNegativeNumber(item);
      }
      visit(item, depth + 1);
    }
  }

  visit(value);
  return { charged, remaining };
}

function sourceEndpoint(env: Record<string, string | undefined>): string {
  const raw = env["OPENSEO_BASE_URL"]?.trim();
  if (!raw) return "configured";
  try {
    return new URL(raw).origin;
  } catch {
    return "configured";
  }
}

function toolFrom(discovery: OpenSeoDiscovery, toolName: string): OpenSeoMcpTool {
  const tool = discovery.tools.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error("That OpenSEO tool is not in the current live catalog.");
  return tool;
}

async function authorize(context: OpenSeoOperatorContext): Promise<string> {
  const { assertOperator } = await import("../os-admin.server");
  const { requireTenantId } = await import("../tenant.server");
  await assertOperator(context.supabase, context.userId);
  return requireTenantId(context.supabase);
}

async function writeEvidence(input: {
  tenantId: string;
  operatorId: string;
  toolName: string;
  classification: OpenSeoToolClassification;
  discovery: OpenSeoDiscovery;
  arguments: Record<string, unknown>;
  result: unknown;
  status: "succeeded" | "failed";
  errorCode: string | null;
  source: string;
  startedAt: Date;
  completedAt: Date;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const credits = extractCredits(input.result);
  const { error } = await supabaseAdmin.from("openseo_tool_runs").insert({
    tenant_id: input.tenantId,
    operator_id: input.operatorId,
    tool_name: input.toolName,
    classification: input.classification.mode,
    cost_model: input.classification.cost,
    arguments: sanitizeValue(input.arguments) as never,
    result: sanitizeValue(input.result) as never,
    status: input.status,
    error_code: input.errorCode,
    source_endpoint: input.source,
    openseo_version: input.discovery.serverInfo.version,
    mcp_version: input.discovery.protocolVersion,
    credits_charged: credits.charged,
    credits_remaining: credits.remaining,
    started_at: input.startedAt.toISOString(),
    completed_at: input.completedAt.toISOString(),
    duration_ms: Math.max(0, input.completedAt.getTime() - input.startedAt.getTime()),
  });
  if (error) throw new Error(`OpenSEO evidence could not be recorded: ${error.message}`);
}

export async function getOpenSeoWorkspaceForOperator(context: OpenSeoOperatorContext) {
  const tenantId = await authorize(context);
  const discovery = await discoverOpenSeo();
  const { data: history, error } = await context.supabase
    .from("openseo_tool_runs")
    .select(
      "id, tool_name, classification, cost_model, status, error_code, credits_charged, credits_remaining, source_endpoint, started_at, completed_at, duration_ms, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  return {
    tenantId,
    server: discovery.serverInfo,
    protocolVersion: discovery.protocolVersion,
    instructions: discovery.instructions ?? null,
    tools: discovery.tools.map((tool) => ({ ...tool, classification: classifyOpenSeoTool(tool) })),
    history: history ?? [],
  };
}

export async function invokeOpenSeoToolForOperator(
  context: OpenSeoOperatorContext,
  input: OpenSeoInvocationInput,
  options: RuntimeOptions = {},
) {
  if (!input.toolName.trim()) throw new Error("OpenSEO tool name is required.");
  if (!input.arguments || typeof input.arguments !== "object" || Array.isArray(input.arguments)) {
    throw new Error("OpenSEO arguments must be an object.");
  }

  const tenantId = await authorize(context);
  const discovery = await discoverOpenSeo();
  const tool = toolFrom(discovery, input.toolName);
  const classification = classifyOpenSeoTool(tool);
  if (classification.requiresConfirmation && !input.confirmed) {
    throw new Error(`OpenSEO tool ${tool.name} requires explicit confirmation before it can run.`);
  }

  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const source = sourceEndpoint(options.env ?? process.env);
  let providerResult: OpenSeoCallResult;
  try {
    providerResult = await callOpenSeoTool(tool.name, input.arguments);
  } catch (error) {
    await writeEvidence({
      tenantId,
      operatorId: context.userId,
      toolName: tool.name,
      classification,
      discovery,
      arguments: input.arguments,
      result: {},
      status: "failed",
      errorCode: "openseo_error",
      source,
      startedAt,
      completedAt: now(),
    });
    throw error;
  }

  await writeEvidence({
    tenantId,
    operatorId: context.userId,
    toolName: tool.name,
    classification,
    discovery,
    arguments: input.arguments,
    result: providerResult,
    status: providerResult.isError ? "failed" : "succeeded",
    errorCode: providerResult.isError ? "openseo_error" : null,
    source,
    startedAt,
    completedAt: now(),
  });

  return {
    toolName: tool.name,
    classification,
    result: sanitizeValue(providerResult),
  };
}
