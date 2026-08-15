import { describe, expect, it, vi } from "vitest";

import { probeConnector } from "./probes.server";

describe("connector probes", () => {
  it("probes n8n health without triggering a workflow", async () => {
    const fetcher = vi.fn(async () => new Response('{"status":"ok"}', { status: 200 }));
    const result = await probeConnector("n8n", {
      env: { N8N_BASE_URL: "https://n8n.example.com/", N8N_API_KEY: "secret" },
      fetcher,
    });

    expect(result).toMatchObject({ health: "healthy", proof: { statusCode: 200 } });
    expect(fetcher).toHaveBeenCalledWith(
      "https://n8n.example.com/healthz",
      expect.objectContaining({ method: "GET" }),
    );
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("probes the VPS scraper health endpoint", async () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const result = await probeConnector("vps_scraper", {
      env: {
        VPS_SCRAPER_BASE_URL: "https://scrape.example.com",
        VPS_SCRAPER_API_KEY: "secret",
      },
      fetcher,
    });

    expect(result.health).toBe("healthy");
    expect(fetcher).toHaveBeenCalledWith(
      "https://scrape.example.com/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("refuses to probe a connector with incomplete configuration", async () => {
    const fetcher = vi.fn();
    const result = await probeConnector("n8n", {
      env: { N8N_API_KEY: "secret" },
      fetcher,
    });

    expect(result).toMatchObject({ health: "unknown", outcome: "missing_configuration" });
    expect(result.missing).toContain("N8N_BASE_URL");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("records HTTP failure without leaking the response body", async () => {
    const fetcher = vi.fn(async () => new Response("upstream secret detail", { status: 503 }));
    const result = await probeConnector("n8n", {
      env: { N8N_BASE_URL: "https://n8n.example.com", N8N_API_KEY: "secret" },
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
      env: { N8N_BASE_URL: "https://n8n.example.com", N8N_API_KEY: "secret" },
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
});

