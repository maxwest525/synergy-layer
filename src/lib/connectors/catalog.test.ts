import { describe, expect, it } from "vitest";

import { CONNECTOR_CATALOG, describeConnectorReadiness } from "./catalog";

describe("connector catalog", () => {
  it("contains the complete approved connector scope", () => {
    expect(CONNECTOR_CATALOG.map((item) => item.key)).toEqual([
      "supabase",
      "google_search_console",
      "google_analytics_4",
      "dataforseo",
      "firecrawl",
      "gemini_generation",
      "gemini_embeddings",
      "github_executor",
      "pagespeed_insights",
      "serpapi",
      "perplexity",
      "google_ads",
      "n8n",
      "vps_scraper",
      "selfhosted_firecrawl",
      "searxng",
      "openseo",
      "umami",
    ]);
  });

  it("returns only secret names and safe configuration metadata", () => {
    const env = {
      DATAFORSEO_LOGIN: "max@example.com",
      DATAFORSEO_PASSWORD: "super-secret",
      N8N_BASE_URL: "https://automation.example.com/",
      N8N_API_KEY: "n8n-secret",
    };

    const states = describeConnectorReadiness(env);
    const dataforseo = states.find((item) => item.key === "dataforseo")!;
    const n8n = states.find((item) => item.key === "n8n")!;

    expect(dataforseo.state).toBe("configured");
    expect(dataforseo.secretNames).toEqual(["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
    expect(JSON.stringify(states)).not.toContain("super-secret");
    expect(JSON.stringify(states)).not.toContain("n8n-secret");
    expect(n8n.safeConfig).toEqual({ baseUrl: "https://automation.example.com" });
  });

  it("supports alternative credential strategies", () => {
    expect(
      describeConnectorReadiness({ DATAFORSEO_BASIC_TOKEN: "token" }).find(
        (item) => item.key === "dataforseo",
      )?.state,
    ).toBe("configured");
    expect(
      describeConnectorReadiness({ GA4_SERVICE_ACCOUNT_JSON: "{}" }).find(
        (item) => item.key === "google_analytics_4",
      )?.state,
    ).toBe("configured");
    expect(
      describeConnectorReadiness({
        GA4_OAUTH_CLIENT_ID: "id",
        GA4_OAUTH_CLIENT_SECRET: "secret",
        GA4_OAUTH_REFRESH_TOKEN: "refresh",
      }).find((item) => item.key === "google_analytics_4")?.state,
    ).toBe("configured");
  });

  it("reports missing requirements without claiming health", () => {
    const n8n = describeConnectorReadiness({ N8N_API_KEY: "key" }).find(
      (item) => item.key === "n8n",
    )!;

    expect(n8n.state).toBe("missing");
    expect(n8n.missing).toContain("N8N_BASE_URL");
    expect(n8n.health).toBe("unknown");
  });
});
