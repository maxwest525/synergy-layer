/**
 * Which Firecrawl answers a scrape, and whether it costs anything.
 *
 * A self-hosted Firecrawl has been running on the operator's own box for weeks,
 * and every scrape in this application went to the metered cloud API instead,
 * because four separate files each hardcoded `api.firecrawl.dev` and read
 * `FIRECRAWL_API_KEY` directly. The self-hosted base URL was declared in the
 * connector catalog, given a health probe, and read by nothing.
 *
 * One chooser, so adding a caller cannot quietly reintroduce that. The two
 * deployments speak the same v2 API and return the same
 * `{ success, data: { rawHtml, markdown } }` shape, verified against the box on
 * 2026-08-22, so callers need no branch of their own -- only this endpoint.
 *
 * The cloud is the fallback, never the default. `selfHosted` is returned so a
 * caller can say which one answered rather than leaving the operator to guess
 * from a bill.
 */

export type FirecrawlEndpoint = {
  /** Full scrape URL, ready to POST to. */
  readonly url: string;
  readonly key: string;
  readonly selfHosted: boolean;
};

function trimmed(env: Record<string, string | undefined>, name: string): string {
  return env[name]?.trim() ?? "";
}

export const FIRECRAWL_CLOUD_URL = "https://api.firecrawl.dev/v2/scrape";

/**
 * The endpoint to scrape with, or null when neither deployment is configured.
 *
 * Self-hosted wins whenever it has both a base URL and a key. A half-configured
 * self-hosted entry falls through to the cloud rather than failing, because a
 * missing key is a configuration mistake and refusing the whole audit over it
 * would be a worse outcome than a bill.
 */
export function firecrawlEndpoint(
  env: Record<string, string | undefined>,
): FirecrawlEndpoint | null {
  const base = trimmed(env, "SELFHOSTED_FIRECRAWL_BASE_URL");
  const selfHostedKey = trimmed(env, "SELFHOSTED_FIRECRAWL_API_KEY");
  if (base !== "" && selfHostedKey !== "") {
    return {
      url: `${base.replace(/\/+$/, "")}/v2/scrape`,
      key: selfHostedKey,
      selfHosted: true,
    };
  }

  const cloudKey = trimmed(env, "FIRECRAWL_API_KEY");
  if (cloudKey !== "") {
    return { url: FIRECRAWL_CLOUD_URL, key: cloudKey, selfHosted: false };
  }

  return null;
}
