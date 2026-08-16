import { GOVERNED_REPO } from "../execution/allowlist";
import {
  CONNECTOR_CATALOG,
  describeConnectorReadiness,
  withConnectorDefaults,
  type ConnectorKey,
} from "./catalog";

export type ConnectorProbeResult = {
  key: ConnectorKey;
  health: "unknown" | "healthy" | "degraded" | "failing";
  outcome:
    | "missing_configuration"
    | "configured_no_safe_probe"
    | "success"
    | "http_error"
    | "schema_error"
    | "timeout"
    | "network_error";
  checkedAt: string;
  missing: string[];
  proof: {
    statusCode?: number;
    endpoint?: string;
  };
};

type ProbeOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type RequestDescriptor = {
  url: string;
  headers: Record<string, string>;
};

const noSafeProbe = new Set<ConnectorKey>([
  "google_search_console",
  "google_analytics_4",
  "pagespeed_insights",
  "perplexity",
  "selfhosted_firecrawl",
]);

function basic(username: string | undefined, password: string | undefined): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function configuredRequest(
  key: ConnectorKey,
  env: Record<string, string | undefined>,
): RequestDescriptor | null {
  switch (key) {
    case "supabase": {
      const token = env["SUPABASE_SERVICE_ROLE_KEY"] ?? env["SUPABASE_SECRET_KEY"]!;
      return {
        url: `${env["SUPABASE_URL"]!.replace(/\/+$/, "")}/rest/v1/`,
        headers: { apikey: token, Authorization: `Bearer ${token}` },
      };
    }
    case "dataforseo": {
      const token =
        env["DATAFORSEO_BASIC_TOKEN"] ??
        btoa(`${env["DATAFORSEO_LOGIN"]}:${env["DATAFORSEO_PASSWORD"]}`);
      return {
        url: "https://api.dataforseo.com/v3/appendix/user_data",
        headers: { Authorization: `Basic ${token}` },
      };
    }
    case "firecrawl":
      return {
        url: "https://api.firecrawl.dev/v1/team/credit-usage",
        headers: { Authorization: `Bearer ${env["FIRECRAWL_API_KEY"]}` },
      };
    case "gemini_generation":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env["GEMINI_MODEL"]!)}?key=${encodeURIComponent(env["GEMINI_API_KEY"]!)}`,
        headers: {},
      };
    case "gemini_embeddings":
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env["GEMINI_EMBEDDING_MODEL"] ?? "gemini-embedding-001")}?key=${encodeURIComponent(env["GEMINI_API_KEY"]!)}`,
        headers: {},
      };
    case "github_executor":
      return {
        url: `https://api.github.com/repos/${GOVERNED_REPO}`,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env["GITHUB_EXECUTOR_TOKEN"]}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      };
    case "serpapi":
      return {
        url: `https://serpapi.com/account.json?api_key=${encodeURIComponent(env["SERPAPI_API_KEY"]!)}`,
        headers: {},
      };
    case "n8n":
      return {
        url: `${env["N8N_BASE_URL"]!.replace(/\/+$/, "")}/healthz`,
        headers: {},
      };
    case "vps_scraper":
      return {
        url: `${env["VPS_SCRAPER_BASE_URL"]!.replace(/\/+$/, "")}/health`,
        headers: { Authorization: `Bearer ${env["VPS_SCRAPER_API_KEY"]}` },
      };
    case "searxng":
      return {
        url: `${env["SEARXNG_BASE_URL"]!.replace(/\/+$/, "")}/healthz`,
        headers: { Authorization: basic(env["SEARXNG_USERNAME"], env["SEARXNG_PASSWORD"]) },
      };
    case "openseo":
      return {
        url: `${env["OPENSEO_BASE_URL"]!.replace(/\/+$/, "")}/api/health`,
        headers: { Authorization: basic(env["OPENSEO_USERNAME"], env["OPENSEO_PASSWORD"]) },
      };
    case "umami":
      return {
        url: `${env["UMAMI_BASE_URL"]!.replace(/\/+$/, "")}/api/heartbeat`,
        headers: { Authorization: `Bearer ${env["UMAMI_API_TOKEN"]}` },
      };
    default:
      return null;
  }
}

function redactedEndpoint(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname}`;
}

export async function probeConnector(
  key: ConnectorKey,
  options: ProbeOptions = {},
): Promise<ConnectorProbeResult> {
  if (key === "google_ads") {
    const { probeGoogleAds } = await import("./google-ads.server");
    return probeGoogleAds(options);
  }
  const env = withConnectorDefaults(options.env ?? process.env);
  const checkedAt = new Date().toISOString();
  const readiness = describeConnectorReadiness(env).find((item) => item.key === key)!;
  if (readiness.state === "missing") {
    return {
      key,
      health: "unknown",
      outcome: "missing_configuration",
      checkedAt,
      missing: readiness.missing,
      proof: {},
    };
  }

  if (noSafeProbe.has(key)) {
    return {
      key,
      health: "degraded",
      outcome: "configured_no_safe_probe",
      checkedAt,
      missing: [],
      proof: {},
    };
  }

  const descriptor = configuredRequest(key, env);
  if (!descriptor) {
    return {
      key,
      health: "degraded",
      outcome: "configured_no_safe_probe",
      checkedAt,
      missing: [],
      proof: {},
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetcher ?? fetch)(descriptor.url, {
      method: "GET",
      headers: descriptor.headers,
      signal: controller.signal,
    });
    return {
      key,
      health: response.ok ? "healthy" : "failing",
      outcome: response.ok ? "success" : "http_error",
      checkedAt,
      missing: [],
      proof: {
        statusCode: response.status,
        endpoint: redactedEndpoint(descriptor.url),
      },
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      key,
      health: "failing",
      outcome: timedOut ? "timeout" : "network_error",
      checkedAt,
      missing: [],
      proof: { endpoint: redactedEndpoint(descriptor.url) },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function connectorCatalogItem(key: ConnectorKey) {
  return CONNECTOR_CATALOG.find((item) => item.key === key)!;
}
