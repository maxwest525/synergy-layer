import { describe, expect, it, vi } from "vitest";

import { callOpenSeoTool, discoverOpenSeo } from "./mcp.server";

const env = {
  OPENSEO_BASE_URL: "https://seo.example.test/",
  OPENSEO_USERNAME: "aoos",
  OPENSEO_PASSWORD: "secret",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    protocolVersion: "2025-03-26",
    serverInfo: { name: "OpenSEO MCP", version: "0.0.11" },
    capabilities: { tools: { listChanged: true } },
  },
};

const toolsList = {
  jsonrpc: "2.0",
  id: 2,
  result: {
    tools: [
      {
        name: "whoami",
        description: "Uses no credits.",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
    ],
  },
};

describe("OpenSEO MCP transport", () => {
  it("discovers the live server and tool catalog with Basic authentication", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(initialize))
      .mockResolvedValueOnce(jsonResponse(toolsList));

    const result = await discoverOpenSeo({ env, fetcher });

    expect(result.protocolVersion).toBe("2025-03-26");
    expect(result.serverInfo).toEqual({ name: "OpenSEO MCP", version: "0.0.11" });
    expect(result.tools.map((item) => item.name)).toEqual(["whoami"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls) {
      const headers = new Headers(call[1]?.headers);
      expect(call[0]).toBe("https://seo.example.test/mcp");
      expect(headers.get("authorization")).toBe("Basic YW9vczpzZWNyZXQ=");
      expect(headers.get("accept")).toBe("application/json, text/event-stream");
    }
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      method: "tools/list",
    });
  });

  it("accepts an SSE-formatted MCP response", async () => {
    const sse = `event: message\ndata: ${JSON.stringify(initialize)}\n\n`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }),
      )
      .mockResolvedValueOnce(jsonResponse(toolsList));

    await expect(discoverOpenSeo({ env, fetcher })).resolves.toMatchObject({
      protocolVersion: "2025-03-26",
    });
  });

  it("returns a structured tool result after initialization", async () => {
    const toolResult = {
      jsonrpc: "2.0",
      id: 2,
      result: {
        content: [{ type: "text", text: "connected" }],
        structuredContent: { mode: "self-hosted", creditsRemaining: null },
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(initialize))
      .mockResolvedValueOnce(jsonResponse(toolResult));

    await expect(callOpenSeoTool("whoami", {}, { env, fetcher })).resolves.toEqual(
      toolResult.result,
    );
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      method: "tools/call",
      params: { name: "whoami", arguments: {} },
    });
  });

  it("rejects an MCP error without exposing provider data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(initialize))
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          error: { code: -32602, message: "secret provider detail", data: { token: "leak" } },
        }),
      );

    await expect(callOpenSeoTool("whoami", {}, { env, fetcher })).rejects.toThrow(
      "OpenSEO rejected the MCP request (-32602).",
    );
  });

  it("rejects malformed and oversized responses", async () => {
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
      );
    await expect(discoverOpenSeo({ env, fetcher: malformed })).rejects.toThrow(
      "OpenSEO returned an invalid MCP response.",
    );

    const oversized = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("x".repeat(101), {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "101" },
      }),
    );
    await expect(
      discoverOpenSeo({ env, fetcher: oversized, maxResponseBytes: 100 }),
    ).rejects.toThrow("OpenSEO response exceeded the 100 byte limit.");
  });

  it("reports missing configuration by variable name only", async () => {
    await expect(discoverOpenSeo({ env: {} })).rejects.toThrow(
      "OpenSEO configuration is missing: OPENSEO_BASE_URL, OPENSEO_USERNAME, OPENSEO_PASSWORD.",
    );
  });
});
