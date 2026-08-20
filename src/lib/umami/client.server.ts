/**
 * Self-hosted Umami transport. Credentials stay server side: the token is
 * obtained per request from POST /api/auth/login and never leaves this module.
 */

export class UmamiFailure extends Error {
  readonly reason: "not_configured" | "authorization" | "unreachable" | "api_error";
  readonly httpStatus: number | null;

  constructor(reason: UmamiFailure["reason"], message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "UmamiFailure";
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

export type UmamiEnvPresence = {
  baseUrl: boolean;
  bearerToken: boolean;
  apiKey: boolean;
  username: boolean;
  password: boolean;
};

export function readUmamiEnvPresence(env: Record<string, string | undefined>): UmamiEnvPresence {
  return {
    baseUrl: Boolean(env["UMAMI_BASE_URL"]),
    bearerToken: Boolean(env["UMAMI_BEARER_TOKEN"]),
    apiKey: Boolean(env["UMAMI_API_KEY"]),
    username: Boolean(env["UMAMI_USERNAME"]),
    password: Boolean(env["UMAMI_PASSWORD"]),
  };
}

/** Configured means credentials exist. It never means the instance answered. */
export function isUmamiConfigured(presence: UmamiEnvPresence): boolean {
  return (
    presence.baseUrl &&
    (presence.bearerToken || presence.apiKey || (presence.username && presence.password))
  );
}

function baseUrl(): string {
  const raw = process.env["UMAMI_BASE_URL"];
  if (!raw) throw new UmamiFailure("not_configured", "UMAMI_BASE_URL is not set on the server.");
  return raw.replace(/\/+$/, "");
}

type AuthHeaders = Record<string, string>;

/**
 * Login is per invocation. A cached module-level token would outlive the
 * request in a worker and could be reused across tenants, so it is not cached.
 */
export async function umamiAuthHeaders(): Promise<AuthHeaders> {
  const bearer = process.env["UMAMI_BEARER_TOKEN"];
  if (bearer) return { Authorization: `Bearer ${bearer}` };

  const apiKey = process.env["UMAMI_API_KEY"];
  if (apiKey) return { "x-umami-api-key": apiKey };

  const username = process.env["UMAMI_USERNAME"];
  const password = process.env["UMAMI_PASSWORD"];
  if (!username || !password) {
    throw new UmamiFailure(
      "not_configured",
      "No Umami token, API key, or username and password are set.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch (error) {
    throw new UmamiFailure("unreachable", `Umami could not be reached: ${String(error)}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new UmamiFailure("authorization", "Umami rejected the credentials.", response.status);
  }
  if (!response.ok) {
    throw new UmamiFailure(
      "api_error",
      `Umami login failed with status ${response.status}.`,
      response.status,
    );
  }

  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    throw new UmamiFailure("api_error", "Umami login returned no token.");
  }
  return { Authorization: `Bearer ${body.token}` };
}

export async function umamiGet<T>(path: string, headers: AuthHeaders): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, { headers });
  } catch (error) {
    throw new UmamiFailure("unreachable", `Umami could not be reached: ${String(error)}`);
  }
  if (response.status === 401 || response.status === 403) {
    // Never read as zero traffic: expired credentials are a failure, not data.
    throw new UmamiFailure(
      "authorization",
      "Umami rejected the stored credentials.",
      response.status,
    );
  }
  if (!response.ok) {
    throw new UmamiFailure(
      "api_error",
      `Umami request failed [${response.status}] for ${path}.`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export async function umamiHeartbeat(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl()}/api/heartbeat`);
    return response.ok;
  } catch {
    return false;
  }
}

export type UmamiWebsite = { id: string; name: string; domain: string | null };

type WebsiteListShape = { data?: unknown } | unknown[];

export async function listUmamiWebsites(headers: AuthHeaders): Promise<UmamiWebsite[]> {
  const raw = await umamiGet<WebsiteListShape>("/api/websites", headers);
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw.data) ? raw.data : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    if (typeof record["id"] !== "string") return [];
    return [
      {
        id: record["id"],
        name: typeof record["name"] === "string" ? record["name"] : record["id"],
        domain: typeof record["domain"] === "string" ? record["domain"] : null,
      },
    ];
  });
}

export type UmamiStatValue = { value: number; prev: number };
export type UmamiStats = Record<string, UmamiStatValue>;

function statValue(input: unknown): UmamiStatValue | null {
  if (typeof input === "number") return { value: input, prev: 0 };
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const value = Number(record["value"]);
  if (!Number.isFinite(value)) return null;
  const prev = Number(record["prev"]);
  return { value, prev: Number.isFinite(prev) ? prev : 0 };
}

export async function fetchUmamiStats(
  headers: AuthHeaders,
  websiteId: string,
  startAt: number,
  endAt: number,
): Promise<UmamiStats> {
  const raw = await umamiGet<Record<string, unknown>>(
    `/api/websites/${encodeURIComponent(websiteId)}/stats?startAt=${startAt}&endAt=${endAt}`,
    headers,
  );
  const out: UmamiStats = {};
  for (const [key, entry] of Object.entries(raw ?? {})) {
    const parsed = statValue(entry);
    if (parsed) out[key] = parsed;
  }
  return out;
}

export type UmamiMetricRow = { label: string; count: number };

export async function fetchUmamiMetrics(
  headers: AuthHeaders,
  websiteId: string,
  type: "path" | "referrer",
  startAt: number,
  endAt: number,
  limit = 25,
): Promise<UmamiMetricRow[]> {
  const raw = await umamiGet<unknown>(
    `/api/websites/${encodeURIComponent(websiteId)}/metrics?startAt=${startAt}&endAt=${endAt}&type=${type}`,
    headers,
  );
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const record = row as Record<string, unknown>;
      const label = typeof record["x"] === "string" ? record["x"] : "(none)";
      const count = Number(record["y"]);
      return Number.isFinite(count) ? [{ label, count }] : [];
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type UmamiSeriesPoint = { t: string; pageviews: number; sessions: number };

export async function fetchUmamiPageviews(
  headers: AuthHeaders,
  websiteId: string,
  startAt: number,
  endAt: number,
  timezone = "UTC",
): Promise<UmamiSeriesPoint[]> {
  const raw = await umamiGet<Record<string, unknown>>(
    `/api/websites/${encodeURIComponent(websiteId)}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=day&timezone=${encodeURIComponent(timezone)}`,
    headers,
  );
  const series = new Map<string, UmamiSeriesPoint>();
  const read = (key: "pageviews" | "sessions") => {
    const rows = raw?.[key];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const t = typeof record["x"] === "string" ? record["x"] : null;
      const count = Number(record["y"]);
      if (!t || !Number.isFinite(count)) continue;
      const existing = series.get(t) ?? { t, pageviews: 0, sessions: 0 };
      existing[key] = count;
      series.set(t, existing);
    }
  };
  read("pageviews");
  read("sessions");
  return [...series.values()].sort((a, b) => a.t.localeCompare(b.t));
}
