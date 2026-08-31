import { describe, expect, it, vi } from "vitest";

import { callAdLoopReadTool, discoverAdLoop } from "./mcp.server";
import { ADLOOP_READ_ONLY_TOOLS, isAdLoopReadOnlyTool } from "./read-only";

const ENV = {
  ADLOOP_BASE_URL: "https://ads.marky.systems",
  ADLOOP_API_KEY: "edge-token",
};

function sse(payload: unknown, sessionId?: string): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
  });
}

const INITIALIZED = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    serverInfo: { name: "AdLoop", version: "3.4.7" },
  },
};

describe("AdLoop read-only allowlist", () => {
  it("admits reporting tools", () => {
    expect(isAdLoopReadOnlyTool("get_campaign_performance")).toBe(true);
    expect(isAdLoopReadOnlyTool("run_gsc_report")).toBe(true);
    expect(isAdLoopReadOnlyTool("list_gtm_tags")).toBe(true);
  });

  it("refuses every tool that can change or spend on the account", () => {
    for (const name of [
      "confirm_and_apply",
      "draft_campaign",
      "update_campaign",
      "pause_entity",
      "enable_entity",
      "remove_entity",
      "add_negative_keywords",
      "attach_shared_set_to_campaigns",
    ]) {
      expect(isAdLoopReadOnlyTool(name)).toBe(false);
    }
  });

  it("refuses a tool a future AdLoop version might add", () => {
    expect(isAdLoopReadOnlyTool("delete_everything")).toBe(false);
  });

  it("carries no duplicates", () => {
    expect(new Set(ADLOOP_READ_ONLY_TOOLS).size).toBe(ADLOOP_READ_ONLY_TOOLS.length);
  });
});

describe("callAdLoopReadTool", () => {
  it("refuses a mutating tool before making any request at all", async () => {
    const fetcher = vi.fn();
    await expect(
      callAdLoopReadTool("confirm_and_apply", {}, { env: ENV, fetcher: fetcher as typeof fetch }),
    ).rejects.toThrow("not on the read-only allowlist");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("opens a session, acknowledges it, and replays the session id on the call", async () => {
    const calls: { sessionId: string | null; method: string }[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = JSON.parse(init!.body as string) as { method: string };
      calls.push({ sessionId: headers["Mcp-Session-Id"] ?? null, method: body.method });

      if (body.method === "initialize") return sse(INITIALIZED, "sess-123");
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return sse({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "ok" }] } });
    });

    const result = await callAdLoopReadTool(
      "get_campaign_performance",
      { days: 7 },
      { env: ENV, fetcher: fetcher as unknown as typeof fetch },
    );

    expect(result).toMatchObject({ content: [{ type: "text", text: "ok" }] });
    expect(calls.map((call) => call.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
    // initialize cannot carry a session id; everything after it must.
    expect(calls[0]!.sessionId).toBeNull();
    expect(calls[1]!.sessionId).toBe("sess-123");
    expect(calls[2]!.sessionId).toBe("sess-123");
  });

  it("fails clearly when the server returns no session id", async () => {
    const fetcher = vi.fn(async () => sse(INITIALIZED));
    await expect(
      callAdLoopReadTool(
        "health_check",
        {},
        { env: ENV, fetcher: fetcher as unknown as typeof fetch },
      ),
    ).rejects.toThrow("did not return an MCP session id");
  });

  it("names the HTTP status, because 401 here is the Caddy edge and not AdLoop", async () => {
    const fetcher = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    await expect(
      callAdLoopReadTool(
        "health_check",
        {},
        { env: ENV, fetcher: fetcher as unknown as typeof fetch },
      ),
    ).rejects.toThrow("HTTP 401");
  });

  it("reports missing configuration by name", async () => {
    await expect(
      callAdLoopReadTool("health_check", {}, { env: {}, fetcher: vi.fn() as typeof fetch }),
    ).rejects.toThrow("ADLOOP_BASE_URL, ADLOOP_API_KEY");
  });
});

describe("discoverAdLoop", () => {
  it("returns the server identity and separates callable tools from the full list", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as { method: string };
      if (body.method === "initialize") return sse(INITIALIZED, "sess-9");
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return sse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [
            { name: "get_campaign_performance", inputSchema: { type: "object" } },
            { name: "confirm_and_apply", inputSchema: { type: "object" } },
          ],
        },
      });
    });

    const discovery = await discoverAdLoop({
      env: ENV,
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(discovery.serverInfo).toEqual({ name: "AdLoop", version: "3.4.7" });
    expect(discovery.tools).toHaveLength(2);
    // The mutating tool is still reported as advertised, but never as callable.
    expect(discovery.callableTools).toEqual(["get_campaign_performance"]);
  });
});
