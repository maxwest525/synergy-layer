import type {
  OpenSeoCallResult,
  OpenSeoDiscovery,
  OpenSeoMcpTool,
  OpenSeoServerInfo,
} from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PROTOCOL_VERSION = "2025-03-26";

type TransportOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

type JsonRpcEnvelope = {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

type ResolvedConfig = {
  endpoint: string;
  authorization: string;
};

function resolveConfig(env: Record<string, string | undefined>): ResolvedConfig {
  const required = ["OPENSEO_BASE_URL", "OPENSEO_USERNAME", "OPENSEO_PASSWORD"] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`OpenSEO configuration is missing: ${missing.join(", ")}.`);
  }

  const baseUrl = env["OPENSEO_BASE_URL"]!.trim().replace(/\/+$/, "");
  const username = env["OPENSEO_USERNAME"]!.trim();
  const password = env["OPENSEO_PASSWORD"]!;
  return {
    endpoint: `${baseUrl}/mcp`,
    authorization: `Basic ${btoa(`${username}:${password}`)}`,
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`OpenSEO response exceeded the ${maxBytes} byte limit.`);
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`OpenSEO response exceeded the ${maxBytes} byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseSse(text: string): unknown {
  const payloads = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  if (payloads.length === 0) throw new Error("invalid_sse");
  return JSON.parse(payloads.at(-1)!);
}

function parseEnvelope(text: string, contentType: string | null): JsonRpcEnvelope {
  try {
    const parsed = contentType?.includes("text/event-stream") ? parseSse(text) : JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || (parsed as JsonRpcEnvelope).jsonrpc !== "2.0") {
      throw new Error("invalid_envelope");
    }
    return parsed as JsonRpcEnvelope;
  } catch {
    throw new Error("OpenSEO returned an invalid MCP response.");
  }
}

async function request(
  method: string,
  params: Record<string, unknown>,
  id: number,
  options: TransportOptions,
): Promise<unknown> {
  const env = options.env ?? process.env;
  const config = resolveConfig(env);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: config.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`OpenSEO timed out after ${timeoutMs}ms.`);
    throw new Error("OpenSEO could not be reached.", { cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`OpenSEO returned HTTP ${response.status}.`);
  }

  const body = await readBoundedText(response, maxResponseBytes);
  const envelope = parseEnvelope(body, response.headers.get("content-type"));
  if (envelope.error) {
    const code = typeof envelope.error.code === "number" ? envelope.error.code : -32000;
    throw new Error(`OpenSEO rejected the MCP request (${code}).`);
  }
  if (!("result" in envelope)) throw new Error("OpenSEO returned an invalid MCP response.");
  return envelope.result;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenSEO returned an invalid MCP response.");
  }
  return value as Record<string, unknown>;
}

async function initialize(options: TransportOptions): Promise<Record<string, unknown>> {
  return object(
    await request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "aoos", version: "0.1.0" },
      },
      1,
      options,
    ),
  );
}

function isTool(value: unknown): value is OpenSeoMcpTool {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["name"] === "string" &&
    !!row["inputSchema"] &&
    typeof row["inputSchema"] === "object" &&
    !Array.isArray(row["inputSchema"])
  );
}

export async function discoverOpenSeo(options: TransportOptions = {}): Promise<OpenSeoDiscovery> {
  const initialized = await initialize(options);
  const listed = object(await request("tools/list", {}, 2, options));
  const tools = listed["tools"];
  const serverInfo = initialized["serverInfo"];
  if (
    typeof initialized["protocolVersion"] !== "string" ||
    !serverInfo ||
    typeof serverInfo !== "object" ||
    Array.isArray(serverInfo) ||
    typeof (serverInfo as Record<string, unknown>)["name"] !== "string" ||
    typeof (serverInfo as Record<string, unknown>)["version"] !== "string" ||
    !Array.isArray(tools) ||
    !tools.every(isTool)
  ) {
    throw new Error("OpenSEO returned an invalid MCP response.");
  }

  return {
    protocolVersion: initialized["protocolVersion"],
    serverInfo: serverInfo as OpenSeoServerInfo,
    ...(typeof initialized["instructions"] === "string"
      ? { instructions: initialized["instructions"] }
      : {}),
    tools,
  };
}

export async function callOpenSeoTool(
  name: string,
  args: Record<string, unknown>,
  options: TransportOptions = {},
): Promise<OpenSeoCallResult> {
  await initialize(options);
  return object(await request("tools/call", { name, arguments: args }, 2, options));
}
