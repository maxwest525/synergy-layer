import { describe, expect, it, vi } from "vitest";

import { probeConnector } from "./probes.server";

describe("connector probes", () => {
  const dataForSeoEnv = { DATAFORSEO_BASIC_TOKEN: "dataforseo-token" };

  it("accepts a successful DataForSEO envelope", async () => {
    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            status_code: 20000,
            status_message: "Ok.",
            tasks: [{ status_code: 20100 }],
          }),
          { status: 200 },
        ),
    });

    expect(result).toMatchObject({
      health: "healthy",
      outcome: "success",
      proof: { statusCode: 200 },
    });
  });

  it("degrades a DataForSEO HTTP 200 with malformed JSON", async () => {
    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () => new Response("not-json", { status: 200 }),
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "schema_error" });
    expect(JSON.stringify(result)).not.toContain("not-json");
  });

  it("degrades a DataForSEO HTTP 200 with the wrong envelope shape", async () => {
    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () => new Response(JSON.stringify({ status_code: 20000 }), { status: 200 }),
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "schema_error" });
  });

  it.each([
    [{ status_code: 40000, status_message: "Error", tasks: [] }],
    [{ status_code: 20000, status_message: "Ok.", tasks: [{ status_code: 40000 }] }],
  ])("degrades a DataForSEO HTTP 200 with a non-success status code", async (body) => {
    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () => new Response(JSON.stringify(body), { status: 200 }),
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "schema_error" });
  });

  it("probes n8n health without triggering a workflow", async () => {
    const fetcher = vi.fn(async () => new Response("plain n8n response", { status: 200 }));
    const result = await probeConnector("n8n", {
      env: {
        N8N_BASE_URL: "https://n8n.example.com/",
        N8N_WEBHOOK_SECRET: "webhook-secret",
        N8N_SEO_WORKFLOW_WEBHOOK_URL: "https://n8n.example.com/webhook/governed",
      },
      fetcher,
    });

    expect(result).toMatchObject({
      health: "healthy",
      outcome: "success",
      proof: { statusCode: 200 },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://n8n.example.com/healthz",
      expect.objectContaining({ method: "GET" }),
    );
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("probes the VPS scraper health endpoint", async () => {
    const fetcher = vi.fn(async () => new Response("plain VPS response", { status: 200 }));
    const result = await probeConnector("vps_scraper", {
      env: {
        VPS_SCRAPER_BASE_URL: "https://scrape.example.com",
        VPS_SCRAPER_API_KEY: "secret",
      },
      fetcher,
    });

    expect(result).toMatchObject({ health: "healthy", outcome: "success" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://scrape.example.com/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("probes the verified n8n health endpoint when only the webhook secret is configured", async () => {
    const fetcher = vi.fn(async () => new Response('{"status":"ok"}', { status: 200 }));
    const result = await probeConnector("n8n", {
      env: { N8N_WEBHOOK_SECRET: "secret" },
      fetcher,
    });

    expect(result).toMatchObject({ health: "healthy", outcome: "success" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://n8n.marky.systems/healthz",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("records HTTP failure without leaking the response body", async () => {
    const fetcher = vi.fn(async () => new Response("upstream secret detail", { status: 503 }));
    const result = await probeConnector("n8n", {
      env: {
        N8N_BASE_URL: "https://n8n.example.com",
        N8N_WEBHOOK_SECRET: "webhook-secret",
        N8N_SEO_WORKFLOW_WEBHOOK_URL: "https://n8n.example.com/webhook/governed",
      },
      fetcher,
    });

    expect(result).toMatchObject({ health: "failing", outcome: "http_error" });
    expect(JSON.stringify(result)).not.toContain("upstream secret detail");
  });

  it("records a timeout deterministically", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const result = await probeConnector("n8n", {
      env: {
        N8N_BASE_URL: "https://n8n.example.com",
        N8N_WEBHOOK_SECRET: "webhook-secret",
        N8N_SEO_WORKFLOW_WEBHOOK_URL: "https://n8n.example.com/webhook/governed",
      },
      fetcher,
      timeoutMs: 2,
    });

    expect(result).toMatchObject({ health: "failing", outcome: "timeout" });
  });

  it("does not spend against providers that have no read-only health endpoint", async () => {
    const fetcher = vi.fn();
    const result = await probeConnector("perplexity", {
      env: { PERPLEXITY_API_KEY: "secret" },
      fetcher,
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "configured_no_safe_probe" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refreshes Google Ads OAuth and probes the current read-only v25 endpoint", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"access_token":"temporary"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"resourceNames":[]}', { status: 200 }));
    const result = await probeConnector("google_ads", {
      env: {
        GOOGLE_ADS_DEVELOPER_TOKEN: "developer",
        GOOGLE_ADS_CUSTOMER_ID: "1234567890",
        GOOGLE_ADS_OAUTH_CLIENT_ID: "client",
        GOOGLE_ADS_OAUTH_CLIENT_SECRET: "secret",
        GOOGLE_ADS_OAUTH_REFRESH_TOKEN: "refresh",
      },
      fetcher,
    });

    expect(result.health).toBe("healthy");
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
      expect.objectContaining({ method: "GET" }),
    );
    expect(JSON.stringify(result)).not.toContain("temporary");
  });
});
