import { describe, expect, it } from "vitest";

import { assessSeoPreflight } from "./orchestrator.server";
import {
  deriveSeoRunSourceExecutionState,
  deriveSeoRunState,
  SEO_REQUIRED_CONNECTORS,
} from "./types";

describe("SEO run preflight", () => {
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
