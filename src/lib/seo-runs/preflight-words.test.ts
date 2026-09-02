import { describe, expect, it } from "vitest";

import { describePreflightBlock } from "./preflight-words";

describe("a blocked run says why", () => {
  it("names every missing connector, unhealthy connector and absent evidence source", () => {
    expect(
      describePreflightBlock({
        ready: false,
        missingConnectors: ["firecrawl"],
        unhealthyConnectors: ["dataforseo"],
        missingEvidence: ["google_search_console"],
      }),
    ).toBe(
      "Preflight blocked the run: connectors not real: firecrawl; connectors unhealthy: dataforseo; no stored evidence from: google_search_console.",
    );
  });

  it("says nothing for a run that passed, and admits a block with no named cause", () => {
    expect(
      describePreflightBlock({
        ready: true,
        missingConnectors: [],
        unhealthyConnectors: [],
        missingEvidence: [],
      }),
    ).toBeNull();
    expect(
      describePreflightBlock({
        ready: false,
        missingConnectors: [],
        unhealthyConnectors: [],
        missingEvidence: [],
      }),
    ).toMatch(/without naming a cause/);
  });
});
