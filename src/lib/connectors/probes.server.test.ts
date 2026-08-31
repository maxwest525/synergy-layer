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
    const result = await probeConnector("pagespeed_insights", {
      env: { PAGESPEED_API_KEY: "secret" },
      fetcher,
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "configured_no_safe_probe" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  // Clarity's entire quota is 10 requests per project per day. A health probe
  // is not free here in the way it is everywhere else on this screen: opening
  // the systems page twice would spend a fifth of the day's budget, and the
  // feature would then fail for the reason the probe existed to detect.
  it("never spends a Clarity request to health check Clarity", async () => {
    const fetcher = vi.fn();
    const result = await probeConnector("microsoft_clarity", {
      env: { CLARITY_API_TOKEN: "jwt" },
      fetcher,
    });

    expect(result).toMatchObject({ health: "degraded", outcome: "configured_no_safe_probe" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  // The OpenAI Ads credential can only write. A probe that reached the provider
  // at all would be delivering a conversion, so the honest health reading is
  // "configured, unprovable" and no request may leave.
  it("never calls the provider to health check the OpenAI Ads conversions bridge", async () => {
    const fetcher = vi.fn();
    const result = await probeConnector("openai_ads", {
      env: { OPENAI_ADS_CAPI_BRIDGE_SECRET: "bridge", OPENAI_ADS_CAPI_API_KEY: "key" },
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

  // The GA4 probe exchanges a credential for a token and stops there. It takes
  // no fetcher because it reuses the measurement module's own credential path,
  // which is the point: the probe proves the same credential the Data API reads
  // use. Google charges nothing for the exchange, while a runReport would need
  // a property the probe has no claim on and would spend GA4 quota.
  it("proves the GA4 credential at the token endpoint and never calls the Data API", async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"access_token":"temporary"}', { status: 200 }));
    globalThis.fetch = fetcher;
    try {
      const result = await probeConnector("google_analytics_4", {
        env: {
          GA4_OAUTH_CLIENT_ID: "client",
          GA4_OAUTH_CLIENT_SECRET: "secret",
          GA4_OAUTH_REFRESH_TOKEN: "refresh",
        },
      });

      expect(result).toMatchObject({
        health: "healthy",
        outcome: "success",
        proof: {
          endpoint: "https://oauth2.googleapis.com/token",
          credentialKind: "oauth_refresh_token",
        },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(
        fetcher.mock.calls.some(([url]) => String(url).includes("analyticsdata.googleapis.com")),
      ).toBe(false);
      expect(JSON.stringify(result)).not.toContain("temporary");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("separates a rejected GA4 credential from an authenticated refusal", async () => {
    const originalFetch = globalThis.fetch;
    const env = {
      GA4_OAUTH_CLIENT_ID: "client",
      GA4_OAUTH_CLIENT_SECRET: "secret",
      GA4_OAUTH_REFRESH_TOKEN: "refresh",
    };
    try {
      globalThis.fetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("{}", { status: 401 }));
      expect(await probeConnector("google_analytics_4", { env })).toMatchObject({
        health: "failing",
        outcome: "http_error",
        proof: { statusCode: 401 },
      });

      globalThis.fetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("{}", { status: 403 }));
      expect(await probeConnector("google_analytics_4", { env })).toMatchObject({
        health: "degraded",
        outcome: "http_error",
        proof: { statusCode: 403 },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  // The self-hosted Firecrawl box exposes /is-production, a free liveness
  // endpoint that performs no crawl. It was listed as having no safe probe, so
  // Max's own deployment could never read better than "Degraded" — the one
  // connector he most needs proof for, since everything is meant to route there
  // instead of the metered cloud.
  it("probes the self-hosted Firecrawl box at its free liveness endpoint", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const result = await probeConnector("selfhosted_firecrawl", {
      env: {
        SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example.test/",
        SELFHOSTED_FIRECRAWL_API_KEY: "token",
      },
      fetcher: async (url, init) => {
        seenUrl = String(url);
        seenAuth = String((init?.headers as Record<string, string>)["Authorization"] ?? "");
        return new Response("true", { status: 200 });
      },
    });

    // No crawl endpoint: a probe must never cost a page render.
    expect(seenUrl).toBe("https://fire.example.test/is-production");
    expect(seenUrl).not.toContain("/v2/scrape");
    expect(seenAuth).toBe("Bearer token");
    expect(result).toMatchObject({ health: "healthy", outcome: "success" });
  });
});
