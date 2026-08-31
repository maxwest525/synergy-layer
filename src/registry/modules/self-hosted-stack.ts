import type { ModuleDefinition } from "../types";

/**
 * The operator's own boxes: the model proxy, the crawler, the scraper, the SEO
 * toolkit.
 *
 * One fact governs all four and is repeated in each `gotcha` because it has
 * cost hours more than once: **a 401 from any *.marky.systems host is Caddy at
 * the edge, not the application behind it.** Crawl4AI answers unauthenticated
 * on localhost; OpenSEO runs AUTH_MODE=local_noauth and has no accounts at all.
 * The credential AOOS holds must match the token in the Caddyfile, and nothing
 * else. Diagnosing those 401s as bad application credentials is the specific
 * mistake this module is written to prevent.
 *
 * Everything marked `called` was exercised from the box on 2026-08-31.
 */
export const definition: ModuleDefinition = {
  module: "self-hosted-stack",
  capabilities: [
    {
      key: "cap.litellm",
      name: "LiteLLM proxy",
      kind: "connector",
      category: "Models",
      description:
        "The single gateway every model call is meant to pass through. Configured as a wildcard pass-through to OpenRouter, so any OpenRouter model id resolves whether or not it appears in /v1/models.",
      integrationState: "real",
      authKind: "bearer",
      operations: [
        {
          name: "models",
          description: "Model list. Free, and the connector's health probe.",
          endpoint: "GET {LITELLM_BASE_URL}/v1/models",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
          gotcha:
            'Config is `model_name: "*" -> openrouter/*`, so this list is not the limit. Models absent from it still resolve — google/gemini-embedding-001 and perplexity/sonar both do.',
        },
        {
          name: "chat/completions",
          description: "Structured JSON generation via response_format json_schema.",
          endpoint: "POST {LITELLM_BASE_URL}/v1/chat/completions",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
        },
        {
          name: "embeddings",
          description: "Vector embeddings over the OpenAI shape.",
          endpoint: "POST {LITELLM_BASE_URL}/v1/embeddings",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
          gotcha:
            "`dimensions` MUST be sent. google/gemini-embedding-001 returns 3072 values by default and 768 when asked — the store only accepts 768. The OpenAI shape also has no field for Gemini's taskType, so proxy vectors are not interchangeable with directly-embedded ones.",
        },
      ],
      config: {
        mutating: false,
        baseUrl: "LITELLM_BASE_URL",
        credentials: "LITELLM_API_KEY",
        backing: "OpenRouter",
        note: "Perplexity is reachable here as perplexity/sonar, which is why no separate Perplexity account is needed.",
      },
    },
    {
      key: "cap.selfhosted_firecrawl",
      name: "Firecrawl (self-hosted)",
      kind: "connector",
      category: "Crawling",
      description:
        "Scrape and search on the operator's own hardware. The metered cloud deployment was removed entirely on 2026-08-31; there is no fallback and a half-configured entry now refuses rather than spending.",
      integrationState: "real",
      authKind: "bearer",
      operations: [
        {
          name: "is-production",
          description: "Liveness. Free, instant, renders nothing. The health probe.",
          endpoint: "GET {SELFHOSTED_FIRECRAWL_BASE_URL}/is-production",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
        },
        {
          name: "scrape",
          description: "One URL to markdown and raw HTML.",
          endpoint: "POST {SELFHOSTED_FIRECRAWL_BASE_URL}/v2/scrape",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
          gotcha: "Never probe this. A health check must not cost a page fetch.",
        },
        {
          name: "search",
          description:
            "Grounded web search. Replaced Perplexity as the research entry point on 2026-08-31.",
          endpoint: "POST {SELFHOSTED_FIRECRAWL_BASE_URL}/v2/search",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
        },
      ],
      config: {
        mutating: false,
        baseUrl: "SELFHOSTED_FIRECRAWL_BASE_URL",
        credentials: "SELFHOSTED_FIRECRAWL_API_KEY",
        gotcha:
          "The credential is the token in the Caddyfile, not anything the container issues. Caddy matches the Authorization header exactly for every path.",
      },
    },
    {
      key: "cap.openseo",
      name: "OpenSEO (self-hosted)",
      kind: "connector",
      category: "SEO",
      description:
        "SEO research and audit toolkit exposing an MCP surface. AOOS calls only its free reads.",
      integrationState: "real",
      authKind: "basic",
      operations: [
        {
          name: "health",
          description: "Version, auth mode and provider checks. Free. The connector probe.",
          endpoint: "GET {OPENSEO_BASE_URL}/api/health",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
        },
        {
          name: "mcp",
          description:
            "MCP endpoint. whoami costs nothing; every other tool should be assumed to consume credits until proven otherwise.",
          endpoint: "POST {OPENSEO_BASE_URL}/mcp",
          mutates: false,
          verified: "docs",
          verifiedOn: "2026-08-31",
          gotcha:
            "OpenSEO bills DataForSEO underneath, so its 'credits' are real spend. The server's own instruction is to confirm before batches over 2,000 credits.",
        },
      ],
      config: {
        mutating: false,
        baseUrl: "OPENSEO_BASE_URL",
        credentials: "OPENSEO_USERNAME, OPENSEO_PASSWORD",
        gotcha:
          "OpenSEO runs AUTH_MODE=local_noauth and has NO authentication of its own. Those credentials are the Caddy basic-auth pair, username `aoos`. A 401 here is always the proxy.",
      },
    },
  ],
};
