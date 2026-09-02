import { describe, expect, it } from "vitest";

import {
  FIRECRAWL_CLOUD_URL,
  firecrawlEndpoint,
  selfHostedFirecrawlRefusal,
} from "./firecrawl-endpoint";

describe("which Firecrawl answers a scrape", () => {
  it("prefers the self-hosted deployment when it is fully configured", () => {
    expect(
      firecrawlEndpoint({
        SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example.com",
        SELFHOSTED_FIRECRAWL_API_KEY: "self",
        FIRECRAWL_API_KEY: "cloud",
      }),
    ).toEqual({ url: "https://fire.example.com/v2/scrape", key: "self", selfHosted: true });
  });

  it("does not care about a trailing slash on the base URL", () => {
    expect(
      firecrawlEndpoint({
        SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example.com///",
        SELFHOSTED_FIRECRAWL_API_KEY: "self",
      })?.url,
    ).toBe("https://fire.example.com/v2/scrape");
  });

  it("falls back to the metered cloud when nothing self-hosted is set", () => {
    expect(firecrawlEndpoint({ FIRECRAWL_API_KEY: "cloud" })).toEqual({
      url: FIRECRAWL_CLOUD_URL,
      key: "cloud",
      selfHosted: false,
    });
  });

  it("falls back rather than failing when the self-hosted entry is half configured", () => {
    // A base URL with no key is a configuration mistake. Refusing the whole
    // audit over it would be a worse outcome than a bill, so it degrades to the
    // cloud -- and `selfHosted: false` is what lets the caller say so out loud.
    const endpoint = firecrawlEndpoint({
      SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example.com",
      FIRECRAWL_API_KEY: "cloud",
    });
    expect(endpoint?.selfHosted).toBe(false);
    expect(endpoint?.url).toBe(FIRECRAWL_CLOUD_URL);
  });

  it("treats whitespace as absent, so a blanked secret does not become a base URL", () => {
    expect(
      firecrawlEndpoint({
        SELFHOSTED_FIRECRAWL_BASE_URL: "   ",
        SELFHOSTED_FIRECRAWL_API_KEY: "   ",
        FIRECRAWL_API_KEY: "cloud",
      })?.selfHosted,
    ).toBe(false);
  });

  it("is null when neither deployment is configured, so callers refuse rather than guess", () => {
    expect(firecrawlEndpoint({})).toBeNull();
  });
});

describe("a self-hosted deployment that failed its last check is refused by name", () => {
  it("names the failed check and both ways out", () => {
    // The chooser trusts a present key; only the probe knows the box rejects
    // it. Without this the page audit sent a hundred requests to a 401 (CODE-17).
    const refusal = selfHostedFirecrawlRefusal({
      health: "failing",
      lastCheckedAt: "2026-09-01T16:05:00.000Z",
      probeOutcome: "unauthorized",
    });
    expect(refusal).toContain("failed its last check at 2026-09-01T16:05:00.000Z (unauthorized)");
    expect(refusal).toContain("Re-run the check on Connection health");
    expect(refusal).toContain("remove SELFHOSTED_FIRECRAWL_BASE_URL");
  });

  it("does not block a workspace whose probe has never run, or one that passed", () => {
    expect(selfHostedFirecrawlRefusal(null)).toBeNull();
    expect(
      selfHostedFirecrawlRefusal({ health: "healthy", lastCheckedAt: null, probeOutcome: null }),
    ).toBeNull();
    expect(
      selfHostedFirecrawlRefusal({ health: "unknown", lastCheckedAt: null, probeOutcome: null }),
    ).toBeNull();
  });
});
