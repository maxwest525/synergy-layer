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
const DATAFORSEO_MAX_PROBE_BODY_BYTES = 32 * 1024;

type DataForSeoEnvelope = {
  status_code: number;
  status_message: string;
  tasks: Array<{ status_code: number }>;
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

async function readBoundedResponseBody(response: Response): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > DATAFORSEO_MAX_PROBE_BODY_BYTES) {
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > DATAFORSEO_MAX_PROBE_BODY_BYTES) return null;
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
      key !== "dataforseo" || !response.ok || (await hasDataForSeoSuccessEnvelope(response));
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
