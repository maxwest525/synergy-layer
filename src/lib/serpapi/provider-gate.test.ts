import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { mayExecuteCapability, SERPAPI_PROVIDER_GATE } from "./provider-gate";

describe("SerpAPI workflow provider gate", () => {
  it("allows only the free provider check while pending", () => {
    expect(mayExecuteCapability(SERPAPI_PROVIDER_GATE, "pending")).toBe(true);
    expect(mayExecuteCapability("ads.advertiser_resolution", "pending")).toBe(
      false,
    );
    expect(mayExecuteCapability("ads.creative_intelligence", "pending")).toBe(
      false,
    );
    expect(mayExecuteCapability("ads.live_serp_observation", "pending")).toBe(
      false,
    );
  });

  it("does not interfere with capabilities already proven real", () => {
    expect(mayExecuteCapability("cap.dataforseo_serp", "real")).toBe(true);
    expect(mayExecuteCapability("ads.landing_page_intelligence", "real")).toBe(
      true,
    );
  });

  it("wires the pending exception to the persisted free account check", () => {
    const runner = readFileSync(
      new URL("../workflow-runner.server.ts", import.meta.url),
      "utf8",
    );
    expect(runner).toContain("mayExecuteCapability");
    expect(runner).toContain("checkSerpApiAccount");
    expect(runner).toContain("recordSerpApiAccountStatus(client, account)");
    expect(runner).not.toContain(
      'const { probeSerpApiAccount } = await import("./serpapi/transport.server")',
    );
  });
});