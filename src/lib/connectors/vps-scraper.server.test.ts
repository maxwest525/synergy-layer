import { describe, expect, it, vi } from "vitest";

import {
  probeVpsScraper,
  scrapePageWithVps,
  scrapeWithVps,
  vpsScraperConfigured,
} from "./vps-scraper.server";

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

describe("rendering a page on the self-hosted crawler", () => {
  const env = { VPS_SCRAPER_API_KEY: "secret" };
  const url = "https://trumoveinc.com/contact";

  function respond(result: unknown) {
    return vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [result] }));
  }

  it("reads the page a Crawl4AI result carries", async () => {
    const rendered = await scrapePageWithVps(url, {
      env,
      fetcher: respond({
        html: "<html><title>Contact</title></html>",
        markdown: "# Contact",
        url: "https://trumoveinc.com/contact/",
      }),
    });

    expect(rendered).toEqual({
      html: "<html><title>Contact</title></html>",
      markdown: "# Contact",
      finalUrl: "https://trumoveinc.com/contact/",
    });
  });

  it("accepts the other names Crawl4AI has used for the same fields", async () => {
    // The box's version is not pinned here, and these have been renamed across
    // releases. Reading them tolerantly is what stops a rename silently sending
    // every page back to the metered crawler.
    const rendered = await scrapePageWithVps(url, {
      env,
      fetcher: respond({ cleaned_html: "<html></html>", fit_markdown: "text" }),
    });

    expect(rendered.html).toBe("<html></html>");
    expect(rendered.markdown).toBe("text");
    expect(rendered.finalUrl).toBe(url);
  });

  it("says which keys did come back when no known HTML field is present", async () => {
    // A silent failure here would fall through to Firecrawl and spend money on
    // every page of every audit, which is the exact bug this replaced. The
    // error has to name the shape so one run is enough to fix it.
    await expect(
      scrapePageWithVps(url, { env, fetcher: respond({ content: "x", status_code: 200 }) }),
    ).rejects.toThrow("Keys present: content, status_code");
  });

  it("reports the crawler's own failure reason rather than a missing field", async () => {
    await expect(
      scrapePageWithVps(url, {
        env,
        fetcher: respond({ success: false, error_message: "navigation timed out" }),
      }),
    ).rejects.toThrow("Crawl4AI could not render the page: navigation timed out.");
  });

  it("treats an empty result set as no page", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [] }));
    await expect(scrapePageWithVps(url, { env, fetcher })).rejects.toThrow(
      "Crawl4AI returned no result for this page.",
    );
  });
});

describe("whether the self-hosted crawler should be tried", () => {
  it("is configured when the key is present, because the base URL has a default", () => {
    expect(vpsScraperConfigured({ VPS_SCRAPER_API_KEY: "secret" })).toBe(true);
  });

  it("is not configured without a key, so the audit falls back rather than failing", () => {
    expect(vpsScraperConfigured({})).toBe(false);
    expect(vpsScraperConfigured({ VPS_SCRAPER_API_KEY: "   " })).toBe(false);
  });
});
