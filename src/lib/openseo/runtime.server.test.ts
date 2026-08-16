import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertOperator: vi.fn(),
  requireTenantId: vi.fn(),
  discoverOpenSeo: vi.fn(),
  callOpenSeoTool: vi.fn(),
  inserts: [] as unknown[],
}));

vi.mock("../os-admin.server", () => ({ assertOperator: mocks.assertOperator }));
vi.mock("../tenant.server", () => ({ requireTenantId: mocks.requireTenantId }));
vi.mock("./mcp.server", () => ({
  discoverOpenSeo: mocks.discoverOpenSeo,
  callOpenSeoTool: mocks.callOpenSeoTool,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: unknown) => {
        mocks.inserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import { getOpenSeoWorkspaceForOperator, invokeOpenSeoToolForOperator } from "./runtime.server";

const freeTool = {
  name: "whoami",
  description: "Free — uses no credits.",
  inputSchema: { type: "object" },
  annotations: { readOnlyHint: true },
};

const paidTool = {
  name: "research_keywords",
  description: "Charges 50 credits per request.",
  inputSchema: { type: "object" },
  annotations: { readOnlyHint: true },
};

function workspaceDb() {
  return {
    from: (table: string) => {
      if (table !== "openseo_tool_runs") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      };
    },
  };
}

describe("OpenSEO operator runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inserts.length = 0;
    mocks.assertOperator.mockResolvedValue(undefined);
    mocks.requireTenantId.mockResolvedValue("tenant-1");
    mocks.discoverOpenSeo.mockResolvedValue({
      protocolVersion: "2025-03-26",
      serverInfo: { name: "OpenSEO", version: "0.1.4" },
      tools: [freeTool, paidTool],
    });
    mocks.callOpenSeoTool.mockResolvedValue({
      structuredContent: {
        credits_charged: 0,
        credits_remaining: 99,
        token: "do-not-store-me",
      },
    });
  });

  it("does not discover OpenSEO when the caller lacks operator access", async () => {
    mocks.assertOperator.mockRejectedValue(new Error("operator required"));

    await expect(
      getOpenSeoWorkspaceForOperator({ supabase: workspaceDb() as never, userId: "viewer-1" }),
    ).rejects.toThrow("operator required");

    expect(mocks.requireTenantId).not.toHaveBeenCalled();
    expect(mocks.discoverOpenSeo).not.toHaveBeenCalled();
  });

  it("returns the current tenant's discovered tools and invocation history", async () => {
    await expect(
      getOpenSeoWorkspaceForOperator({ supabase: workspaceDb() as never, userId: "operator-1" }),
    ).resolves.toMatchObject({
      tenantId: "tenant-1",
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "whoami",
          classification: expect.objectContaining({ mode: "free_read" }),
        }),
      ]),
      history: [],
    });
  });

  it("runs a server-classified free read and persists sanitized tenant evidence", async () => {
    const result = await invokeOpenSeoToolForOperator(
      { supabase: workspaceDb() as never, userId: "operator-1" },
      { toolName: "whoami", arguments: { token: "do-not-store-me" }, confirmed: false },
      { env: { OPENSEO_BASE_URL: "https://user:password@seo.example.test/" } },
    );

    expect(result).toMatchObject({ toolName: "whoami", classification: { mode: "free_read" } });
    expect(mocks.callOpenSeoTool).toHaveBeenCalledWith("whoami", { token: "do-not-store-me" });
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({
      tenant_id: "tenant-1",
      operator_id: "operator-1",
      tool_name: "whoami",
      classification: "free_read",
      cost_model: "free",
      status: "succeeded",
      source_endpoint: "https://seo.example.test",
      credits_charged: 0,
      credits_remaining: 99,
      arguments: { token: "[redacted]" },
      result: { structuredContent: { token: "[redacted]" } },
    });
  });

  it("refuses a rediscovered metered tool until the operator confirms it", async () => {
    await expect(
      invokeOpenSeoToolForOperator(
        { supabase: workspaceDb() as never, userId: "operator-1" },
        { toolName: "research_keywords", arguments: {}, confirmed: false },
      ),
    ).rejects.toThrow("requires explicit confirmation");

    expect(mocks.callOpenSeoTool).not.toHaveBeenCalled();
    expect(mocks.inserts).toHaveLength(0);
  });

  it("records a failed provider call without retaining secret values", async () => {
    mocks.callOpenSeoTool.mockRejectedValue(
      new Error("OpenSEO rejected the MCP request (-32000)."),
    );

    await expect(
      invokeOpenSeoToolForOperator(
        { supabase: workspaceDb() as never, userId: "operator-1" },
        {
          toolName: "research_keywords",
          arguments: { apiKey: "do-not-store-me" },
          confirmed: true,
        },
      ),
    ).rejects.toThrow("OpenSEO rejected the MCP request");

    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({
      status: "failed",
      error_code: "openseo_error",
      arguments: { apiKey: "[redacted]" },
      result: {},
    });
  });
});
