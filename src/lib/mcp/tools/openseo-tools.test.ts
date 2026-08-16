import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discoverOpenSeo: vi.fn(),
  invokeOpenSeoToolForOperator: vi.fn(),
}));

vi.mock("../../openseo/mcp.server", () => ({ discoverOpenSeo: mocks.discoverOpenSeo }));
vi.mock("../../openseo/runtime.server", () => ({
  invokeOpenSeoToolForOperator: mocks.invokeOpenSeoToolForOperator,
}));

import { callOpenSeoFreeRead, listOpenSeoTools } from "./call-openseo-free-read";

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

describe("AOOS MCP OpenSEO surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discoverOpenSeo.mockResolvedValue({
      protocolVersion: "2025-03-26",
      serverInfo: { name: "OpenSEO", version: "0.1.4" },
      tools: [freeTool, paidTool],
    });
    mocks.invokeOpenSeoToolForOperator.mockResolvedValue({ toolName: "whoami", result: {} });
  });

  it("lists every tool from the live catalog with AOOS's server classification", async () => {
    await expect(listOpenSeoTools()).resolves.toMatchObject({
      count: 2,
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "whoami",
          classification: expect.objectContaining({ mode: "free_read" }),
        }),
        expect.objectContaining({
          name: "research_keywords",
          classification: expect.objectContaining({ mode: "metered_read" }),
        }),
      ]),
    });
  });

  it("runs a free read through the tenant evidence runtime", async () => {
    await callOpenSeoFreeRead({ supabase: {} as never, userId: "operator-1" }, "whoami", {});

    expect(mocks.invokeOpenSeoToolForOperator).toHaveBeenCalledWith(
      { supabase: {}, userId: "operator-1" },
      { toolName: "whoami", arguments: {}, confirmed: false },
    );
  });

  it("refuses a live metered tool before it reaches the execution runtime", async () => {
    await expect(
      callOpenSeoFreeRead({ supabase: {} as never, userId: "operator-1" }, "research_keywords", {}),
    ).rejects.toThrow("not a free read");

    expect(mocks.invokeOpenSeoToolForOperator).not.toHaveBeenCalled();
  });
});
