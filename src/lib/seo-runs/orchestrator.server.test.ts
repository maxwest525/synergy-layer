import { describe, expect, it } from "vitest";

import { assessSeoPreflight, buildCurrentSeoConnectorSnapshot } from "./orchestrator.server";
import {
  deriveSeoRunSourceExecutionState,
  deriveSeoRunState,
  SEO_REQUIRED_CONNECTORS,
} from "./types";

describe("SEO run preflight", () => {
  const real = (capabilityKey: string) => ({
    capabilityKey,
    integrationState: "real",
    health: "healthy",
    probeOutcome: "success" as const,
  });
  const evidence = { searchConsoleRows: 7, dataForSeoSnapshots: 56 };

  it("lets the self-hosted renderer stand in for the cloud one", () => {
    const withoutCloud = SEO_REQUIRED_CONNECTORS.filter((key) => key !== "firecrawl").map(real);
    expect(
      assessSeoPreflight([...withoutCloud, real("selfhosted_firecrawl")], evidence),
    ).toMatchObject({
      ready: true,
      missingConnectors: [],
      unhealthyConnectors: [],
    });
    expect(
      assessSeoPreflight(
        [...withoutCloud, { ...real("firecrawl"), integrationState: "pending" }],
        evidence,
      ).missingConnectors,
    ).toEqual(["firecrawl"]);
  });

  it("reports the primary as unhealthy when a real candidate answered badly and none is usable", () => {
    const withoutCloud = SEO_REQUIRED_CONNECTORS.filter((key) => key !== "firecrawl").map(real);
    const result = assessSeoPreflight(
      [...withoutCloud, { ...real("selfhosted_firecrawl"), health: "failing" }],
      evidence,
    );
    expect(result.unhealthyConnectors).toEqual(["firecrawl"]);
    expect(result.missingConnectors).toEqual([]);
  });

  it("blocks when a required real connector or real evidence is missing", () => {
    const result = assessSeoPreflight([], { searchConsoleRows: 0, dataForSeoSnapshots: 0 });
    expect(result.ready).toBe(false);
    expect(result.missingConnectors).toEqual([...SEO_REQUIRED_CONNECTORS]);
    expect(result.missingEvidence).toEqual(["google_search_console", "dataforseo"]);
  });

  it("accepts proven real connectors and observed evidence", () => {
    const result = assessSeoPreflight(
      SEO_REQUIRED_CONNECTORS.map((capabilityKey) => ({
        capabilityKey,
        integrationState: "real",
        health: "healthy",
      })),
      { searchConsoleRows: 7, dataForSeoSnapshots: 56 },
    );
    expect(result).toEqual({
      ready: true,
      missingConnectors: [],
      unhealthyConnectors: [],
      missingEvidence: [],
    });
  });

  it("blocks a required connector whose stored health no probe ever established", () => {
    const currentEnv = {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      LOVABLE_API_KEY: "gsc-key",
      DATAFORSEO_BASIC_TOKEN: "dataforseo-token",
      FIRECRAWL_API_KEY: "firecrawl-key",
      GEMINI_API_KEY: "gemini-key",
      GITHUB_EXECUTOR_TOKEN: "github-key",
    };
    const persisted = SEO_REQUIRED_CONNECTORS.map((capabilityKey) => ({
      capability_key: capabilityKey,
      config: capabilityKey === "github_executor" ? {} : { probe_outcome: "success" },
      health: "healthy",
      integration_state: "real",
    }));

    const snapshot = buildCurrentSeoConnectorSnapshot(persisted, currentEnv);
    const result = assessSeoPreflight(snapshot, { searchConsoleRows: 7, dataForSeoSnapshots: 56 });

    expect(snapshot.find((row) => row.capabilityKey === "github_executor")).toMatchObject({
      health: "never_checked",
      probeOutcome: null,
    });
    expect(result.unhealthyConnectors).toEqual(["github_executor"]);
    expect(result.ready).toBe(false);
  });

  it("blocks stale healthy proof when required current configuration was removed", () => {
    const persisted = SEO_REQUIRED_CONNECTORS.map((capabilityKey) => ({
      capability_key: capabilityKey,
      config: { probe_outcome: "success" },
      health: "healthy",
      integration_state: "real",
    }));
    const currentEnv = {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      LOVABLE_API_KEY: "gsc-key",
      DATAFORSEO_BASIC_TOKEN: "",
      FIRECRAWL_API_KEY: "firecrawl-key",
      GEMINI_API_KEY: "gemini-key",
      GITHUB_EXECUTOR_TOKEN: "github-key",
    };

    const snapshot = buildCurrentSeoConnectorSnapshot(persisted, currentEnv);
    const result = assessSeoPreflight(snapshot, {
      searchConsoleRows: 7,
      dataForSeoSnapshots: 56,
    });

    expect(snapshot.find((row) => row.capabilityKey === "dataforseo")).toEqual({
      capabilityKey: "dataforseo",
      integrationState: "pending",
      health: "unknown",
      probeOutcome: null,
    });
    expect(result.missingConnectors).toContain("dataforseo");
    expect(result.ready).toBe(false);
  });
});

describe("SEO run state projection", () => {
  it("does not call approval execution", () => {
    expect(deriveSeoRunState("proposed")).toBe("awaiting_approval");
    expect(deriveSeoRunState("approved")).toBe("approved");
    expect(deriveSeoRunState("approved", "running")).toBe("executing");
  });

  it("projects every terminal change outcome honestly", () => {
    expect(deriveSeoRunState("applied")).toBe("executed");
    expect(deriveSeoRunState("verified")).toBe("verified");
    expect(deriveSeoRunState("rejected")).toBe("rejected");
    expect(deriveSeoRunState("rolled_back")).toBe("rolled_back");
  });

  it("keeps a committed source change executing until rendered proof exists", () => {
    expect(deriveSeoRunSourceExecutionState("committed")).toBe("executing");
    expect(deriveSeoRunSourceExecutionState("reconciled")).toBe("executing");
    expect(deriveSeoRunSourceExecutionState("replayed")).toBe("executing");
    expect(deriveSeoRunSourceExecutionState("refused")).toBe("failed");
    expect(deriveSeoRunSourceExecutionState("failed")).toBe("failed");
  });
});
