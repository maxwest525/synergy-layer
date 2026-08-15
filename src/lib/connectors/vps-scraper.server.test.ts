import { describe, expect, it, vi } from "vitest";

import { probeVpsScraper, scrapeWithVps } from "./vps-scraper.server";

describe("VPS scraper bridge", () => {
  it("health-checks the authenticated Crawl4AI service", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await probeVpsScraper({ env: { VPS_SCRAPER_API_KEY: "secret" }, fetcher });

    expect(fetcher.mock.calls[0]?.[0]).toBe("https://crawl.marky.systems/health");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer secret" },
    });
    expect(result.health).toBe("healthy");
  });

  it("scrapes one allowlisted TruMove URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ results: [{ ok: true }] }));

    const result = await scrapeWithVps("https://trumoveinc.com/services/moving", {
      env: { VPS_SCRAPER_API_KEY: "secret" },
      fetcher,
    });

    expect(result).toEqual({ results: [{ ok: true }] });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ urls: ["https://trumoveinc.com/services/moving"] }),
    );
  });

  it("refuses non-allowlisted URLs before any request", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      scrapeWithVps("https://example.com/", { env: { VPS_SCRAPER_API_KEY: "secret" }, fetcher }),
    ).rejects.toThrow("outside the governed TruMove origin");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects oversized responses without exposing their content", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(101)));

    await expect(
      scrapeWithVps("https://trumoveinc.com/", {
        env: { VPS_SCRAPER_API_KEY: "secret" },
        fetcher,
        maxResponseBytes: 100,
      }),
    ).rejects.toThrow("response exceeded 100 bytes");
  });

  it("refuses unreadable schemas and reports timeouts safely", async () => {
    const invalid = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ secret: "upstream" }));

    await expect(
      scrapeWithVps("https://trumoveinc.com/", {
        env: { VPS_SCRAPER_API_KEY: "secret" },
        fetcher: invalid,
      }),
    ).rejects.toThrow("VPS scraper returned an unreadable schema");

    const timeout = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("secret timeout detail", "AbortError")),
          );
        }),
    );
    await expect(
      scrapeWithVps("https://trumoveinc.com/", {
        env: { VPS_SCRAPER_API_KEY: "secret" },
        fetcher: timeout,
        timeoutMs: 1,
      }),
    ).rejects.toThrow("VPS scraper request timed out");
  });
});
