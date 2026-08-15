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
