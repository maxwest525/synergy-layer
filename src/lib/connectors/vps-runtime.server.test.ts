import { describe, expect, it, vi } from "vitest";

import { crawlWithVps, triggerGovernedSeoWorkflow } from "./vps-runtime.server";

describe("self-hosted runtime adapters", () => {
  it("calls the verified Crawl4AI contract with one public URL", async () => {
    const fetcher = vi.fn(async () => Response.json({ results: [] }));
    await crawlWithVps("https://example.com/service", {
      env: { VPS_SCRAPER_BASE_URL: "https://crawl.example.com/", VPS_SCRAPER_API_KEY: "secret" },
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://crawl.example.com/crawl",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ urls: ["https://example.com/service"] }),
      }),
    );
  });

  it("triggers only the configured governed n8n webhook with idempotency", async () => {
    const fetcher = vi.fn(async () => Response.json({ accepted: true }));
    await triggerGovernedSeoWorkflow(
      { runId: "run", targetUrl: "https://example.com/page", idempotencyKey: "once" },
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
