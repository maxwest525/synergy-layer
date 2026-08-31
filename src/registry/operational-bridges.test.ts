import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allCapabilities, allWorkflows } from "./index";
import { definition as automation } from "./modules/automation-runtime";
import { definition as growth } from "./modules/growth-operations";

describe("operational bridge registry", () => {
  it("registers only the implemented read-only Google Ads surface as real", () => {
    const capabilities = growth.capabilities;
    if (!capabilities) throw new Error("growth-operations capabilities must be defined.");
    const googleAds = capabilities.find((capability) => capability.key === "google.ads");

    expect(googleAds?.integrationState).toBe("real");
    expect(googleAds?.operations).toEqual([
      expect.objectContaining({ name: "customers.list_accessible", mutates: false }),
      expect.objectContaining({ name: "campaigns.report_read", mutates: false }),
    ]);
  });

  it("registers implemented n8n and VPS operations with mutation truth", () => {
    const capabilities = automation.capabilities;
    if (!capabilities) throw new Error("automation-runtime capabilities must be defined.");
    const n8n = capabilities.find((capability) => capability.key === "automation.n8n");
    const scraper = capabilities.find((capability) => capability.key === "automation.vps_scraper");

    expect(n8n?.integrationState).toBe("real");
    expect(n8n?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "health.probe", mutates: false }),
        expect.objectContaining({ name: "workflow.trigger", mutates: true }),
      ]),
    );
    expect(scraper?.integrationState).toBe("real");
    expect(scraper?.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "health.probe", mutates: false }),
        expect.objectContaining({ name: "page.scrape", mutates: false }),
      ]),
    );
  });
});

/**
 * The tests above assert registry literals against themselves, which is how
 * two capabilities stayed declared "real" for weeks while the workflow runner
 * had no execution path for either: every step "succeeded" through a
 * fall-through that stamped health without doing anything. So, like
 * `connections.registry.test.ts`, these tests read the source. A "real"
 * capability a workflow can reach must be dispatched somewhere in
 * `workflow-runner.server.ts`, and a workflow node must reference a key some
 * module actually declares, or a registry-only rebuild dangles.
 */
describe("every workflow node is executable exactly as declared", () => {
  const runnerSource = readFileSync(
    join(process.cwd(), "src/lib/workflow-runner.server.ts"),
    "utf8",
  );
  const declared = new Map(allCapabilities().map((capability) => [capability.key, capability]));
  const workflowCapabilityRefs = new Map<string, string>();
  for (const workflow of allWorkflows()) {
    for (const node of workflow.graph.nodes) {
      if (node.kind === "capability" && node.ref) {
        workflowCapabilityRefs.set(node.ref, workflow.key);
      }
    }
  }

  it("references only capability keys a module declares, so a registry-only rebuild cannot dangle", () => {
    for (const [ref, workflowKey] of workflowCapabilityRefs) {
      expect(declared.has(ref), `${workflowKey} references ${ref}, which no module declares`).toBe(
        true,
      );
    }
  });

  it("dispatches every reachable capability the registry declares real", () => {
    for (const [ref, workflowKey] of workflowCapabilityRefs) {
      const capability = declared.get(ref);
      if (capability?.integrationState !== "real") continue;
      expect(
        runnerSource.includes(`"${ref}"`),
        `${ref} is declared real and reachable through ${workflowKey}, but workflow-runner.server.ts never dispatches it, so the step would refuse at run time`,
      ).toBe(true);
    }
  });
});
