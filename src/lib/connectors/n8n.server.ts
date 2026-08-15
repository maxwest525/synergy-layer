import { GOVERNED_ORIGIN } from "../execution/allowlist";
import { withConnectorDefaults } from "./catalog";
import { probeConnector } from "./probes.server";

type Options = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function governedUrl(raw: string): string {
  const url = new URL(raw);
  if (url.origin !== GOVERNED_ORIGIN)
    throw new Error(`The target URL is outside the governed TruMove origin ${GOVERNED_ORIGIN}.`);
  return url.toString();
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new Error(`n8n response exceeded ${maxBytes} bytes.`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("n8n returned unreadable JSON.");
  }
}

export function probeN8n(options: Options = {}) {
  return probeConnector("n8n", options);
}

export async function triggerN8nWorkflow(
  input: { runId: string; targetUrl: string; idempotencyKey: string },
  options: Options = {},
) {
  const env = withConnectorDefaults(options.env ?? process.env);
  const webhookUrl = required(env, "N8N_SEO_WORKFLOW_WEBHOOK_URL");
  const secret = required(env, "N8N_WEBHOOK_SECRET");
  const targetUrl = governedUrl(input.targetUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const response = await (options.fetcher ?? fetch)(webhookUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({ ...input, targetUrl }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`n8n workflow request failed with HTTP ${response.status}.`);
    const payload = await boundedJson(response, options.maxResponseBytes ?? 64 * 1024);
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>)["accepted"] !== true ||
      typeof (payload as Record<string, unknown>)["provider"] !== "string" ||
      !("evidence" in payload)
    )
      throw new Error("n8n returned an unreadable workflow response schema.");
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("n8n workflow request timed out.");
    if (error instanceof Error && error.message.startsWith("n8n ")) throw error;
    throw new Error("n8n workflow request failed before a response.");
  } finally {
    clearTimeout(timeout);
  }
}
