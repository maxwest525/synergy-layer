import { describe, expect, it, vi } from "vitest";

import { crawlWithVps, triggerGovernedSeoWorkflow } from "./vps-runtime.server";

describe("self-hosted runtime adapters", () => {
  it("calls the verified Crawl4AI contract with one governed URL", async () => {
    const fetcher = vi.fn(async () => Response.json({ results: [] }));
    await crawlWithVps("https://trumoveinc.com/service", {
      env: { VPS_SCRAPER_BASE_URL: "https://crawl.example.com/", VPS_SCRAPER_API_KEY: "secret" },
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://crawl.example.com/crawl",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ urls: ["https://trumoveinc.com/service"] }),
      }),
    );
  });

  it("triggers only the configured governed n8n webhook with idempotency", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ accepted: true, provider: "crawl4ai", evidence: {} }),
    );
    await triggerGovernedSeoWorkflow(
      { runId: "run", targetUrl: "https://trumoveinc.com/page", idempotencyKey: "once" },
      {
        env: {
          N8N_SEO_WORKFLOW_WEBHOOK_URL: "https://n8n.example.com/webhook/governed",
          N8N_WEBHOOK_SECRET: "secret",
        },
        fetcher,
      },
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://n8n.example.com/webhook/governed",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "once" }),
      }),
    );
  });

  it("uses the verified AOOS endpoints when only server-side credentials are supplied", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        accepted: true,
        provider: "crawl4ai",
        evidence: { results: [] },
        results: [],
      }),
    );

    await triggerGovernedSeoWorkflow(
      { runId: "run", targetUrl: "https://trumoveinc.com/page", idempotencyKey: "once" },
      { env: { N8N_WEBHOOK_SECRET: "secret" }, fetcher },
    );
    await crawlWithVps("https://trumoveinc.com/page", {
      env: { VPS_SCRAPER_API_KEY: "secret" },
      fetcher,
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://n8n.marky.systems/webhook/aoos-governed-seo",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://crawl.marky.systems/crawl",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("refuses private crawl targets", async () => {
    await expect(
      crawlWithVps("http://127.0.0.1/admin", {
        env: { VPS_SCRAPER_BASE_URL: "https://crawl.example.com", VPS_SCRAPER_API_KEY: "secret" },
      }),
    ).rejects.toThrow("Private or loopback");

    await expect(
      crawlWithVps("http://172.16.0.4/admin", {
        env: { VPS_SCRAPER_BASE_URL: "https://crawl.example.com", VPS_SCRAPER_API_KEY: "secret" },
      }),
    ).rejects.toThrow("Private or loopback");
  });
});
