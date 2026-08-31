import { describe, expect, it } from "vitest";

import { allCapabilities } from "./index";
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog";

/**
 * The registry is only worth having if it is complete and honest.
 *
 * This suite exists because of a bug on 2026-08-31: the Google Ads reporting
 * read sent `pageSize`, which the v25 search endpoint rejects outright. Every
 * mocked test passed. Nothing in the repository recorded what that endpoint
 * accepts, so an invented parameter looked exactly like a real one.
 *
 * Two rules follow, and they are the two these tests enforce:
 *
 * 1. Every connector the catalog offers must have a registry capability, so a
 *    new integration cannot be added without its surface being written down.
 * 2. A claim of "we called this and it worked" must carry a date, and must not
 *    be made about a future day. Read-from-docs and confirmed-by-calling are
 *    different claims; collapsing them is how a guess becomes documentation.
 */

/** Catalog key -> the capability key that documents it. */
const CAPABILITY_FOR_CONNECTOR: Record<string, string> = {
  supabase: "cap.supabase",
  google_search_console: "search.console",
  google_analytics_4: "cap.ga4",
  dataforseo: "cap.dataforseo_serp",
  litellm: "cap.litellm",
  gemini_generation: "cap.gemini",
  gemini_embeddings: "cap.gemini",
  github_executor: "cap.github_executor",
  pagespeed_insights: "cap.pagespeed_insights",
  serpapi: "cap.serpapi_ads_transparency",
  google_ads: "cap.google_ads",
  n8n: "automation.n8n",
  vps_scraper: "automation.vps_scraper",
  selfhosted_firecrawl: "cap.selfhosted_firecrawl",
  openseo: "cap.openseo",
  umami: "cap.umami",
  openai_ads: "openai.ads.capi",
  adloop: "cap.adloop",
  microsoft_clarity: "cap.microsoft_clarity",
  bing_webmaster: "cap.bing_webmaster",
};

describe("every connector has its surface written down", () => {
  it("names a capability for each connector in the catalog", () => {
    const missing = CONNECTOR_CATALOG.map((connector) => connector.key).filter(
      (key) => !CAPABILITY_FOR_CONNECTOR[key],
    );
    expect(missing, `connectors with no mapped capability: ${missing.join(", ")}`).toEqual([]);
  });

  it("resolves every mapped capability to a real registry entry", () => {
    const known = new Set(allCapabilities().map((capability) => capability.key));
    const dangling = Object.entries(CAPABILITY_FOR_CONNECTOR)
      .filter(([, capabilityKey]) => !known.has(capabilityKey))
      .map(([connector, capabilityKey]) => `${connector} -> ${capabilityKey}`);
    expect(dangling, `mapped to capabilities that do not exist: ${dangling.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("the registry does not overclaim", () => {
  const operations = allCapabilities().flatMap((capability) =>
    (capability.operations ?? []).map((operation) => ({
      capability: capability.key,
      ...operation,
    })),
  );

  it("dates every verification claim", () => {
    const undated = operations
      .filter((operation) => operation.verified && !operation.verifiedOn)
      .map((operation) => `${operation.capability}:${operation.name}`);
    expect(undated, `verified without a date: ${undated.join(", ")}`).toEqual([]);
  });

  it("uses a real, non-future date", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const bad = operations
      .filter((operation) => operation.verifiedOn)
      .filter(
        (operation) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(operation.verifiedOn!) || operation.verifiedOn! > tomorrow,
      )
      .map((operation) => `${operation.capability}:${operation.name}=${operation.verifiedOn}`);
    expect(bad, `implausible verification dates: ${bad.join(", ")}`).toEqual([]);
  });

  it("records at least one operation actually called, per verified-by-call capability", () => {
    // Not every capability has been exercised, and that is allowed. What is not
    // allowed is a capability whose every operation claims `called` while the
    // capability itself is still pending.
    const overclaiming = allCapabilities()
      .filter((capability) => capability.integrationState === "pending")
      .filter((capability) =>
        (capability.operations ?? []).some((operation) => operation.verified === "called"),
      )
      .map((capability) => capability.key);
    expect(
      overclaiming,
      `pending capabilities claiming a live call: ${overclaiming.join(", ")}`,
    ).toEqual([]);
  });
});
