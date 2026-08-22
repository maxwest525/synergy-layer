import { GOVERNED_ORIGIN } from "../execution/allowlist";
import { withConnectorDefaults } from "./catalog";
import { probeConnector } from "./probes.server";

type Options = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function governedUrl(raw: string): string {
  const url = new URL(raw);
  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$)/i.test(
      url.hostname,
    ) ||
    url.hostname.toLowerCase().endsWith(".local")
  )
    throw new Error("Private or loopback crawl targets are not allowed.");
  if (url.origin !== GOVERNED_ORIGIN)
    throw new Error(`The target URL is outside the governed TruMove origin ${GOVERNED_ORIGIN}.`);
  return url.toString();
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes)
    throw new Error(`VPS scraper response exceeded ${maxBytes} bytes.`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new Error(`VPS scraper response exceeded ${maxBytes} bytes.`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("VPS scraper returned unreadable JSON.");
  }
}

export function probeVpsScraper(options: Options = {}) {
  return probeConnector("vps_scraper", options);
}

/** Whether the self-hosted scraper is configured well enough to be tried at all. */
export function vpsScraperConfigured(env: Record<string, string | undefined>): boolean {
  const withDefaults = withConnectorDefaults(env);
  return Boolean(
    withDefaults["VPS_SCRAPER_BASE_URL"]?.trim() && withDefaults["VPS_SCRAPER_API_KEY"]?.trim(),
  );
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * One page, rendered on the self-hosted box, in the shape the page audit needs.
 *
 * `scrapeWithVps` returns Crawl4AI's envelope verbatim, which is right for a
 * transport but useless to a caller that wants HTML and text. This adapts it,
 * and is the reason the audit can stop paying Firecrawl per page.
 *
 * Field names are read tolerantly because Crawl4AI has renamed them across
 * versions and the box's version is not pinned here. If none of the known names
 * are present the error carries the keys that actually came back, so one failed
 * run says exactly what to add rather than leaving another silent fallback to
 * the metered API.
 */
export async function scrapePageWithVps(
  rawTargetUrl: string,
  options: Options = {},
): Promise<{ html: string; markdown: string; finalUrl: string }> {
  const payload = (await scrapeWithVps(rawTargetUrl, options)) as { results: unknown[] };
  const first = payload.results[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    throw new Error("Crawl4AI returned no result for this page.");
  }
  const record = first as Record<string, unknown>;

  if (record["success"] === false) {
    const reason = firstString(record, ["error_message", "error"]) ?? "no reason given";
    throw new Error(`Crawl4AI could not render the page: ${reason}.`);
  }

  const html = firstString(record, ["html", "raw_html", "rawHtml", "cleaned_html"]);
  const markdown =
    firstString(record, ["markdown", "fit_markdown", "markdown_v2"]) ??
    (typeof record["markdown"] === "object" && record["markdown"] !== null
      ? firstString(record["markdown"] as Record<string, unknown>, ["raw_markdown", "fit_markdown"])
      : null);

  if (html === null) {
    throw new Error(
      `Crawl4AI returned no HTML field. Keys present: ${Object.keys(record).join(", ")}.`,
    );
  }

  return {
    html,
    markdown: markdown ?? "",
    finalUrl: firstString(record, ["url", "redirected_url", "final_url"]) ?? rawTargetUrl,
  };
}

export async function scrapeWithVps(rawTargetUrl: string, options: Options = {}) {
  const env = withConnectorDefaults(options.env ?? process.env);
  const baseUrl = required(env, "VPS_SCRAPER_BASE_URL").replace(/\/+$/, "");
  const secret = required(env, "VPS_SCRAPER_API_KEY");
  const targetUrl = governedUrl(rawTargetUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const response = await (options.fetcher ?? fetch)(`${baseUrl}/crawl`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: [targetUrl] }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Crawl4AI request failed with HTTP ${response.status}.`);
    const payload = await boundedJson(response, options.maxResponseBytes ?? 2 * 1024 * 1024);
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      !Array.isArray((payload as Record<string, unknown>)["results"])
    )
      throw new Error("VPS scraper returned an unreadable schema.");
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("VPS scraper request timed out.");
    if (
      error instanceof Error &&
      (error.message.startsWith("VPS ") || error.message.startsWith("Crawl4AI "))
    )
      throw error;
    throw new Error("VPS scraper request failed before a response.");
  } finally {
    clearTimeout(timeout);
  }
}
