import { describe, expect, it, vi } from "vitest";

import { probeConnector } from "./probes.server";

describe("connector probes", () => {
  const dataForSeoEnv = { DATAFORSEO_BASIC_TOKEN: "dataforseo-token" };
  const openSeoEnv = {
    OPENSEO_BASE_URL: "https://seo.example.test",
    OPENSEO_USERNAME: "operator",
    OPENSEO_PASSWORD: "password",
  };

  it("accepts the documented OpenSEO health object", async () => {
    const result = await probeConnector("openseo", {
      env: openSeoEnv,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            version: "0.1.4",
            authMode: "local_noauth",
            checks: { database: "ok", ai: "configured" },
          }),
          { status: 200 },
        ),
    });

    expect(result).toMatchObject({ health: "healthy", outcome: "success" });
  });

  it("degrades an OpenSEO HTTP 200 with an invalid health object", async () => {
    const result = await probeConnector("openseo", {
      env: openSeoEnv,
      fetcher: async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "schema_error" });
  });

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

  it("keeps a DataForSEO HTTP 201 status-only", async () => {
    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () => new Response("not-json", { status: 201 }),
    });

    expect(result).toMatchObject({
      health: "healthy",
      outcome: "success",
      proof: { statusCode: 201 },
    });
  });

  it("cancels an oversized streamed DataForSEO body without exposing it", async () => {
    const cancel = vi.fn();
    // Sized against the DataForSEO budget (1 MB), not the 32 KB default: the cap
    // was raised for this endpoint, not removed, and it must still cancel.
    const oversizedBody = `provider-body-${"x".repeat(1024 * 1024)}`;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(oversizedBody));
        },
        cancel,
      }),
      { status: 200 },
    );
    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () => response,
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "schema_error" });
    expect(JSON.stringify(result)).not.toContain("provider-body-");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a DataForSEO body whose declared length exceeds the cap", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 200,
      headers: { "content-length": "1048577" },
    });
    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () => response,
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "schema_error" });
    expect(cancel).toHaveBeenCalledTimes(1);
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

  it("sends a User-Agent to GitHub, because without one it answers 403", () => {
    // The deployed worker runtime supplies no User-Agent of its own and GitHub
    // rejects the request. The executor has sent one since that was found there;
    // this probe did not, so a working token was reported as a failing
    // credential on the connector screen. Asserted here so it cannot regress
    // into the same misdiagnosis.
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));

    return probeConnector("github_executor", {
      env: { GITHUB_EXECUTOR_TOKEN: "token" },
      fetcher,
    }).then(() => {
      const headers = (fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
      expect(headers["User-Agent"]).toBeTruthy();
    });
  });

  // Regression: /v3/appendix/user_data returns DataForSEO's rates, limits,
  // statistics, money and per-endpoint price list for their whole catalogue.
  // That body is far larger than the 32 KB schema-probe cap, so a perfectly
  // valid HTTP 200 was being recorded as `schema_error` and the connector read
  // "Degraded" on /capabilities/systems while it was working normally.
  it("accepts a valid DataForSEO envelope that is larger than the small-body cap", async () => {
    const bigButValid = {
      version: "0.1.20260101",
      status_code: 20000,
      status_message: "Ok.",
      time: "0.0123 sec.",
      cost: 0,
      tasks_count: 1,
      tasks_error: 0,
      tasks: [
        {
          id: "task-1",
          status_code: 20000,
          status_message: "Ok.",
          result: [
            {
              login: "operator@example.test",
              // Stand-in for the real price list: many endpoints, each priced.
              price: Object.fromEntries(
                Array.from({ length: 900 }, (_, i) => [
                  `endpoint_family_${i}_with_a_realistically_long_name`,
                  { live: 0.006, task_post: 0.0006, priority: 0.012 },
                ]),
              ),
            },
          ],
        },
      ],
    };
    const body = JSON.stringify(bigButValid);
    expect(body.length).toBeGreaterThan(32 * 1024);

    const result = await probeConnector("dataforseo", {
      env: dataForSeoEnv,
      fetcher: async () => new Response(body, { status: 200 }),
    });

    expect(result).toMatchObject({ health: "healthy", outcome: "success" });
  });
});
