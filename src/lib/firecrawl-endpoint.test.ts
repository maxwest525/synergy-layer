import { describe, expect, it } from "vitest";

import { firecrawlEndpoint } from "./firecrawl-endpoint";

describe("which Firecrawl answers a scrape", () => {
  it("returns the self-hosted scrape and search endpoints when it is fully configured", () => {
    expect(
      firecrawlEndpoint({
        SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example.com",
        SELFHOSTED_FIRECRAWL_API_KEY: "self",
      }),
    ).toEqual({
      url: "https://fire.example.com/v2/scrape",
      searchUrl: "https://fire.example.com/v2/search",
      key: "self",
      selfHosted: true,
    });
  });

  it("does not care about a trailing slash on the base URL", () => {
    const endpoint = firecrawlEndpoint({
      SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example.com///",
      SELFHOSTED_FIRECRAWL_API_KEY: "self",
    });
    expect(endpoint?.url).toBe("https://fire.example.com/v2/scrape");
    expect(endpoint?.searchUrl).toBe("https://fire.example.com/v2/search");
  });

  // The metered cloud fallback was removed on 2026-08-31. There is no paid
  // Firecrawl account, and a silent fallback to api.firecrawl.dev is the exact
  // shape of bug this module was written to prevent: a charge nobody chose,
  // found later on a bill. These three cases all used to return a cloud
  // endpoint and must now refuse.
  it("ignores a cloud key entirely — it is no longer a fallback", () => {
    expect(firecrawlEndpoint({ FIRECRAWL_API_KEY: "cloud" })).toBeNull();
  });

  it("refuses rather than spending when the self-hosted entry is half configured", () => {
    expect(
      firecrawlEndpoint({
        SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example.com",
        FIRECRAWL_API_KEY: "cloud",
      }),
    ).toBeNull();
    expect(
      firecrawlEndpoint({
        SELFHOSTED_FIRECRAWL_API_KEY: "self",
        FIRECRAWL_API_KEY: "cloud",
      }),
    ).toBeNull();
  });

  it("treats whitespace as absent, so a blanked secret does not become a base URL", () => {
    expect(
      firecrawlEndpoint({
        SELFHOSTED_FIRECRAWL_BASE_URL: "   ",
        SELFHOSTED_FIRECRAWL_API_KEY: "   ",
        FIRECRAWL_API_KEY: "cloud",
      }),
    ).toBeNull();
  });

  it("is null when nothing is configured, so callers refuse rather than guess", () => {
    expect(firecrawlEndpoint({})).toBeNull();
  });
});
