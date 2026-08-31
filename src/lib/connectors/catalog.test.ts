import { describe, expect, it } from "vitest";

import { CONNECTOR_CATALOG, describeConnectorReadiness } from "./catalog";

describe("connector catalog", () => {
  it("contains the complete approved connector scope", () => {
    expect(CONNECTOR_CATALOG.map((item) => item.key)).toEqual([
      "supabase",
      "google_search_console",
      "google_analytics_4",
      "dataforseo",
      "litellm",
      "gemini_generation",
      "gemini_embeddings",
      "github_executor",
      "pagespeed_insights",
      "serpapi",
      "google_ads",
      "n8n",
      "vps_scraper",
      "selfhosted_firecrawl",
      "openseo",
      "umami",
      "openai_ads",
      "microsoft_clarity",
      "bing_webmaster",
      "adloop",
    ]);
  });

  it("returns only secret names and safe configuration metadata", () => {
    const env = {
      DATAFORSEO_LOGIN: "max@example.com",
      DATAFORSEO_PASSWORD: "super-secret",
      N8N_BASE_URL: "https://automation.example.com/",
      N8N_WEBHOOK_SECRET: "webhook-secret",
      N8N_SEO_WORKFLOW_WEBHOOK_URL: "https://automation.example.com/webhook/governed-seo",
    };

    const states = describeConnectorReadiness(env);
    const dataforseo = states.find((item) => item.key === "dataforseo")!;
    const n8n = states.find((item) => item.key === "n8n")!;

    expect(dataforseo.state).toBe("configured");
    expect(dataforseo.secretNames).toEqual(["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
    expect(JSON.stringify(states)).not.toContain("super-secret");
    expect(JSON.stringify(states)).not.toContain("webhook-secret");
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

  it("uses the verified AOOS VPS endpoints without treating them as secrets", () => {
    const n8n = describeConnectorReadiness({ N8N_WEBHOOK_SECRET: "secret" }).find(
      (item) => item.key === "n8n",
    )!;
    const vps = describeConnectorReadiness({ VPS_SCRAPER_API_KEY: "secret" }).find(
      (item) => item.key === "vps_scraper",
    )!;

    expect(n8n.state).toBe("configured");
    expect(n8n.missing).toEqual([]);
    expect(n8n.safeConfig).toEqual({ baseUrl: "https://n8n.marky.systems" });
    expect(vps.state).toBe("configured");
    expect(vps.safeConfig).toEqual({ baseUrl: "https://crawl.marky.systems" });
    expect(n8n.health).toBe("unknown");
  });

  it("uses the stable Gemini generation model when the key is configured", () => {
    const gemini = describeConnectorReadiness({ GEMINI_API_KEY: "secret" }).find(
      (item) => item.key === "gemini_generation",
    )!;

    expect(gemini.state).toBe("configured");
    expect(gemini.safeConfig).toEqual({ model: "gemini-3.6-flash" });
  });

  // Regression: the catalog asked for UMAMI_API_TOKEN, a name no other file in
  // the repo reads, while umamiAuthHeaders() authenticates with
  // UMAMI_BEARER_TOKEN / UMAMI_API_KEY / username+password. A fully working
  // Umami therefore reported "missing UMAMI_API_TOKEN" on the systems page.
  it("accepts every Umami credential the client actually authenticates with", () => {
    const umami = (env: Record<string, string>) =>
      describeConnectorReadiness(env).find((item) => item.key === "umami")!;

    const base = { UMAMI_BASE_URL: "https://umami.example" };
    expect(umami({ ...base, UMAMI_BEARER_TOKEN: "t" }).state).toBe("configured");
    expect(umami({ ...base, UMAMI_API_KEY: "k" }).state).toBe("configured");
    expect(umami({ ...base, UMAMI_USERNAME: "u", UMAMI_PASSWORD: "p" }).state).toBe("configured");

    // No credential at all is still missing, and the base URL alone is not enough.
    expect(umami(base).state).toBe("missing");
    expect(umami({ UMAMI_BEARER_TOKEN: "t" }).state).toBe("missing");
  });
});
