import { GOVERNED_REPO } from "../execution/allowlist";
import { GITHUB_USER_AGENT } from "../execution/execute.server";
import {
  CONNECTOR_CATALOG,
  describeConnectorReadiness,
  withConnectorDefaults,
  type ConnectorKey,
  type ConnectorProbeOutcome,
} from "./catalog";

export type ConnectorProbeResult = {
  key: ConnectorKey;
  health: "unknown" | "healthy" | "degraded" | "failing";
  outcome: ConnectorProbeOutcome;
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
const MAX_SCHEMA_PROBE_BODY_BYTES = 32 * 1024;

type DataForSeoEnvelope = {
  status_code: number;
  status_message: string;
  tasks: Array<{ status_code: number }>;
};

type OpenSeoHealth = {
  status: "ok";
  version: string;
  authMode: string;
  checks: Record<string, unknown>;
};

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
    case "litellm":
      // The proxy's own model list. It answers with the models the operator
      // configured, which is exactly what "is this reachable and is the key
      // right" needs, and it costs nothing upstream.
      return {
        url: `${(env["LITELLM_BASE_URL"] ?? "").replace(/\/+$/, "").replace(/(?<!\/v\d+)$/, "/v1")}/models`,
        headers: {
          Authorization: `Bearer ${env["LITELLM_API_KEY"] ?? env["LITELLM_PROXY_API_KEY"]}`,
        },
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
          // Without this the deployed worker runtime sends no User-Agent and
          // GitHub answers 403, which this probe then reported as a failing
          // credential. The executor itself has sent one since the same problem
          // was found there; the probe was left behind, so a working token has
          // been shown as failing on the connector screen ever since.
          "User-Agent": GITHUB_USER_AGENT,
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

async function readBoundedResponseBody(response: Response): Promise<string | null> {
  const body = response.body;
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_SCHEMA_PROBE_BODY_BYTES) {
    try {
      await body?.cancel();
    } catch {
      // Cancellation is best-effort and must not change the probe result.
    }
    return null;
  }

  const reader = body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SCHEMA_PROBE_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best-effort and must not change the probe result.
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isDataForSeoSuccessEnvelope(value: unknown): value is DataForSeoEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  const statusCode = envelope["status_code"];
  const statusMessage = envelope["status_message"];
  const tasks = envelope["tasks"];
  if (
    typeof statusCode !== "number" ||
    typeof statusMessage !== "string" ||
    !Array.isArray(tasks)
  ) {
    return false;
  }

  return (
    isDataForSeoSuccessStatus(statusCode) &&
    tasks.every(
      (task) =>
        !!task &&
        typeof task === "object" &&
        isDataForSeoSuccessStatus((task as Record<string, unknown>)["status_code"]),
    )
  );
}

function isDataForSeoSuccessStatus(statusCode: unknown): statusCode is number {
  return statusCode === 20000 || statusCode === 20100;
}

async function hasDataForSeoSuccessEnvelope(response: Response): Promise<boolean> {
  try {
    const body = await readBoundedResponseBody(response);
    return body !== null && isDataForSeoSuccessEnvelope(JSON.parse(body));
  } catch {
    return false;
  }
}

function isOpenSeoHealth(value: unknown): value is OpenSeoHealth {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const health = value as Record<string, unknown>;
  return (
    health["status"] === "ok" &&
    typeof health["version"] === "string" &&
    typeof health["authMode"] === "string" &&
    !!health["checks"] &&
    typeof health["checks"] === "object" &&
    !Array.isArray(health["checks"])
  );
}

async function hasOpenSeoHealth(response: Response): Promise<boolean> {
  try {
    const body = await readBoundedResponseBody(response);
    return body !== null && isOpenSeoHealth(JSON.parse(body));
  } catch {
    return false;
  }
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
    const schemaValid =
      response.status !== 200 ||
      (key === "dataforseo"
        ? await hasDataForSeoSuccessEnvelope(response)
        : key === "openseo"
          ? await hasOpenSeoHealth(response)
          : true);
    return {
      key,
      health: response.ok ? (schemaValid ? "healthy" : "degraded") : "failing",
      outcome: response.ok ? (schemaValid ? "success" : "schema_error") : "http_error",
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
