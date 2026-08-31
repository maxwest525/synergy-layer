import { isAdLoopReadOnlyTool } from "./read-only";

/**
 * MCP transport for the self-hosted AdLoop server.
 *
 * AdLoop is not a second copy of the OpenSEO client. OpenSEO's MCP server is
 * stateless: every request re-initializes and carries no session. AdLoop's
 * refuses anything but `initialize` without one —
 * `{"code":-32600,"message":"Bad Request: Missing session ID"}` — so the
 * session id it returns in the `Mcp-Session-Id` response header has to be
 * captured and replayed, and the `notifications/initialized` acknowledgement
 * has to be sent before any tool call.
 *
 * Responses come back SSE-framed (`event: message` / `data: {...}`) even for a
 * single reply, which is why the body is parsed for `data:` lines rather than
 * handed straight to `JSON.parse`.
 *
 * Every call goes through the read-only allowlist. See `read-only.ts` for why
 * that is an allowlist and not a blocklist.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const PROTOCOL_VERSION = "2025-06-18";

export type AdLoopTool = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
};

export type AdLoopServerInfo = { readonly name: string; readonly version: string };

export type AdLoopDiscovery = {
  readonly protocolVersion: string;
  readonly serverInfo: AdLoopServerInfo;
  readonly instructions?: string;
  readonly tools: AdLoopTool[];
  /** Of `tools`, the ones this application will actually call. */
  readonly callableTools: string[];
};

export type AdLoopTransportOptions = {
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

type Session = { endpoint: string; authorization: string; sessionId: string };

function resolveConfig(env: Record<string, string | undefined>): {
  endpoint: string;
  authorization: string;
} {
  const missing = (["ADLOOP_BASE_URL", "ADLOOP_API_KEY"] as const).filter(
    (name) => !env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(`AdLoop configuration is missing: ${missing.join(", ")}.`);
  }
  const baseUrl = env["ADLOOP_BASE_URL"]!.trim().replace(/\/+$/, "");
  return {
    endpoint: `${baseUrl}/mcp`,
    // Caddy matches this header exactly, so the value carries no adornment
    // beyond the scheme. A stray space or newline reads as a 401 with no body.
    authorization: `Bearer ${env["ADLOOP_API_KEY"]!.trim()}`,
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`AdLoop response exceeded the ${maxBytes} byte limit.`);
  }
  const text = await response.text();
  if (text.length > maxBytes) {
    throw new Error(`AdLoop response exceeded the ${maxBytes} byte limit.`);
  }
  return text;
}

function parseEnvelope(text: string): JsonRpcEnvelope {
  const payloads = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  const raw = payloads.length > 0 ? payloads.at(-1)! : text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AdLoop returned an invalid MCP response.");
  }
  if (!parsed || typeof parsed !== "object" || (parsed as JsonRpcEnvelope).jsonrpc !== "2.0") {
    throw new Error("AdLoop returned an invalid MCP response.");
  }
  return parsed as JsonRpcEnvelope;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AdLoop returned an invalid MCP response.");
  }
  return value as Record<string, unknown>;
}

async function post(
  session: Pick<Session, "endpoint" | "authorization"> & { sessionId?: string },
  body: Record<string, unknown>,
  options: AdLoopTransportOptions,
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(session.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: session.authorization,
        "Content-Type": "application/json",
        ...(session.sessionId ? { "Mcp-Session-Id": session.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`AdLoop timed out after ${timeoutMs}ms.`);
    throw new Error("AdLoop could not be reached.", { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function result(response: Response, options: AdLoopTransportOptions): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    // 401 here is Caddy at the edge rejecting the bearer, not AdLoop.
    throw new Error(`AdLoop returned HTTP ${response.status}.`);
  }
  const envelope = parseEnvelope(
    await readBoundedText(response, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES),
  );
  if (envelope.error) {
    const code = typeof envelope.error.code === "number" ? envelope.error.code : -32000;
    throw new Error(`AdLoop rejected the MCP request (${code}).`);
  }
  if (!("result" in envelope)) throw new Error("AdLoop returned an invalid MCP response.");
  return envelope.result;
}

/**
 * Handshake. Returns a session that later calls must carry, plus whatever the
 * server said about itself — the version is worth surfacing because the one
 * recorded in this workspace has already drifted from the one running.
 */
async function openSession(
  options: AdLoopTransportOptions,
): Promise<{ session: Session; initialized: Record<string, unknown> }> {
  const config = resolveConfig(options.env ?? process.env);
  const response = await post(
    config,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "aoos", version: "0.1.0" },
      },
    },
    options,
  );

  const sessionId = response.headers.get("mcp-session-id")?.trim() ?? "";
  const initialized = object(await result(response, options));
  if (!sessionId) {
    throw new Error("AdLoop did not return an MCP session id.");
  }

  const session: Session = { ...config, sessionId };
  // Not acknowledging leaves the server refusing every subsequent call.
  const ack = await post(session, { jsonrpc: "2.0", method: "notifications/initialized" }, options);
  await ack.body?.cancel().catch(() => undefined);

  return { session, initialized };
}

function isTool(value: unknown): value is AdLoopTool {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["name"] === "string" &&
    !!row["inputSchema"] &&
    typeof row["inputSchema"] === "object" &&
    !Array.isArray(row["inputSchema"])
  );
}

/** Server identity and the advertised tool list, with the callable subset named. */
export async function discoverAdLoop(
  options: AdLoopTransportOptions = {},
): Promise<AdLoopDiscovery> {
  const { session, initialized } = await openSession(options);
  const listed = object(
    await result(
      await post(session, { jsonrpc: "2.0", id: 2, method: "tools/list" }, options),
      options,
    ),
  );

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
    throw new Error("AdLoop returned an invalid MCP response.");
  }

  return {
    protocolVersion: initialized["protocolVersion"],
    serverInfo: serverInfo as AdLoopServerInfo,
    ...(typeof initialized["instructions"] === "string"
      ? { instructions: initialized["instructions"] }
      : {}),
    tools,
    callableTools: tools.filter((tool) => isAdLoopReadOnlyTool(tool.name)).map((tool) => tool.name),
  };
}

/**
 * Call one read-only AdLoop tool.
 *
 * The allowlist check happens before the session is opened, so a mutating name
 * costs no request and, more importantly, cannot be reached by a caller that
 * passes a name through from somewhere else.
 */
export async function callAdLoopReadTool(
  name: string,
  args: Record<string, unknown> = {},
  options: AdLoopTransportOptions = {},
): Promise<Record<string, unknown>> {
  if (!isAdLoopReadOnlyTool(name)) {
    throw new Error(
      `AdLoop tool "${name}" is not on the read-only allowlist; this application does not call tools that can change a live Google Ads account.`,
    );
  }
  const { session } = await openSession(options);
  return object(
    await result(
      await post(
        session,
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
        options,
      ),
      options,
    ),
  );
}
