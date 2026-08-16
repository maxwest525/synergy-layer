import { describe, expect, it } from "vitest";

import { definition as automation } from "./modules/automation-runtime";
import { definition as growth } from "./modules/growth-operations";

describe("operational bridge registry", () => {
  it("registers only the implemented read-only Google Ads surface as real", () => {
    const googleAds = (growth.capabilities ?? []).find((capability) => capability.key === "google.ads");

    expect(googleAds?.integrationState).toBe("real");
    expect(googleAds?.operations).toEqual([
      expect.objectContaining({ name: "customers.list_accessible", mutates: false }),
    ]);
  });

  it("registers implemented n8n and VPS operations with mutation truth", () => {
    const n8n = (automation.capabilities ?? []).find((capability) => capability.key === "automation.n8n");
    const scraper = (automation.capabilities ?? []).find(
      (capability) => capability.key === "automation.vps_scraper",
    );

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
