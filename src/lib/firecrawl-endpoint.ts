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
  /** Full search URL on the same deployment. */
  readonly searchUrl: string;
  readonly key: string;
  readonly selfHosted: true;
};

function trimmed(env: Record<string, string | undefined>, name: string): string {
  return env[name]?.trim() ?? "";
}

/**
 * The endpoint to scrape or search with, or null when the self-hosted
 * deployment is not configured.
 *
 * The metered cloud fallback was removed on 2026-08-31 at the operator's
 * instruction. There is no paid Firecrawl account, the self-hosted box answers
 * both `/v2/scrape` and `/v2/search`, and a silent fallback to
 * `api.firecrawl.dev` is exactly the shape of bug this file was written to
 * prevent: a charge nobody chose, discovered on a bill. A missing self-hosted
 * key is now a configuration error the caller must see, not a reason to spend.
 */
export function firecrawlEndpoint(
  env: Record<string, string | undefined>,
): FirecrawlEndpoint | null {
  const base = trimmed(env, "SELFHOSTED_FIRECRAWL_BASE_URL").replace(/\/+$/, "");
  const key = trimmed(env, "SELFHOSTED_FIRECRAWL_API_KEY");
  if (base === "" || key === "") return null;
  return {
    url: `${base}/v2/scrape`,
    searchUrl: `${base}/v2/search`,
    key,
    selfHosted: true,
  };
}
