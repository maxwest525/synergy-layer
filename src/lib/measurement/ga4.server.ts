import { createSign } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { MeasurementWindowDays } from "../change-measurement";
import { ga4Window, readGa4EnvPresence, type Ga4CredentialKind } from "./ga4";

type AdminClient = SupabaseClient<Database>;

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const DATA_ENDPOINT = "https://analyticsdata.googleapis.com/v1beta";

/** The exact Data API call AOOS makes for a property inventory read. */
export function ga4RunReportEndpoint(property: string): string {
  return `${DATA_ENDPOINT}/${property}:runReport`;
}
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export type Ga4InventoryRow = {
  hostName: string;
  pagePath: string;
  eventName: string;
  eventCount: number;
  activeUsers: number;
  sessions: number;
};

export type Ga4Inventory = {
  rowCount: number;
  pageCount: number;
  eventNameCount: number;
  totalEventCount: number;
  totalSessions: number;
  truncated: boolean;
  rows: Ga4InventoryRow[];
  quota: Record<string, unknown>;
};

export class Ga4ProviderError extends Error {
  readonly httpStatus: number | null;
  readonly authenticationSucceeded: boolean;

  constructor(message: string, httpStatus: number | null = null, authenticationSucceeded = false) {
    super(message);
    this.name = "Ga4ProviderError";
    this.httpStatus = httpStatus;
    this.authenticationSucceeded = authenticationSucceeded;
  }
}

/** A 401 means the bearer credential itself was rejected. Other Data API
 * responses prove Google accepted authentication, even when the property read
 * is refused or malformed. */
export function ga4ResponseProvesAuthentication(status: number): boolean {
  return status >= 200 && status < 500 && status !== 401;
}

export function buildGa4InventoryRequest(
  window: { startDate: string; endDate: string },
  targetUrl?: string,
) {
  const target = targetUrl ? new URL(targetUrl) : null;
  const pagePath = target ? `${target.pathname}${target.search}` : null;
  return {
    dateRanges: [window],
    dimensions: [{ name: "hostName" }, { name: "pagePathPlusQueryString" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "activeUsers" }, { name: "sessions" }],
    metricAggregations: ["TOTAL"],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    keepEmptyRows: false,
    returnPropertyQuota: true,
    limit: "10000",
    ...(target && pagePath
      ? {
          dimensionFilter: {
            andGroup: {
              expressions: [
                {
                  filter: {
                    fieldName: "hostName",
                    stringFilter: {
                      value: target.hostname,
                      matchType: "EXACT",
                      caseSensitive: false,
                    },
                  },
                },
                {
                  filter: {
                    fieldName: "pagePathPlusQueryString",
                    stringFilter: {
                      value: pagePath,
                      matchType: "EXACT",
                      caseSensitive: true,
                    },
                  },
                },
              ],
            },
          },
        }
      : {}),
  };
}

function numberAt(values: Array<{ value?: string }> | undefined, index: number): number {
  const value = Number(values?.[index]?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function normalizeGa4Inventory(payload: unknown): Ga4Inventory {
  const report = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rows = Array.isArray(report["rows"]) ? report["rows"] : [];
  const totals = Array.isArray(report["totals"])
    ? (report["totals"] as Array<{ metricValues?: Array<{ value?: string }> }>)
    : [];
  const normalized: Ga4InventoryRow[] = rows.map((raw) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const dimensions = Array.isArray(row["dimensionValues"])
      ? (row["dimensionValues"] as Array<{ value?: string }>)
      : [];
    const metrics = Array.isArray(row["metricValues"])
      ? (row["metricValues"] as Array<{ value?: string }>)
      : [];
    return {
      hostName: dimensions[0]?.value ?? "",
      pagePath: dimensions[1]?.value ?? "",
      eventName: dimensions[2]?.value ?? "",
      eventCount: numberAt(metrics, 0),
      activeUsers: numberAt(metrics, 1),
      sessions: numberAt(metrics, 2),
    };
  });

  return {
    rowCount: typeof report["rowCount"] === "number" ? report["rowCount"] : normalized.length,
    pageCount: new Set(normalized.map((row) => `${row.hostName}${row.pagePath}`)).size,
    eventNameCount: new Set(normalized.map((row) => row.eventName).filter(Boolean)).size,
    totalEventCount:
      totals.length > 0
        ? numberAt(totals[0]?.metricValues, 0)
        : normalized.reduce((sum, row) => sum + row.eventCount, 0),
    totalSessions:
      totals.length > 0
        ? numberAt(totals[0]?.metricValues, 2)
        : normalized.reduce((sum, row) => sum + row.sessions, 0),
    truncated: typeof report["rowCount"] === "number" && report["rowCount"] > normalized.length,
    rows: normalized,
    quota:
      report["propertyQuota"] && typeof report["propertyQuota"] === "object"
        ? (report["propertyQuota"] as Record<string, unknown>)
        : {},
  };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function tokenResponse(body: URLSearchParams): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  let payload: { access_token?: string } = {};
  try {
    payload = (await response.json()) as { access_token?: string };
  } catch {
    // The status is enough to report a failed token exchange safely.
  }
  if (!response.ok || !payload.access_token) {
    throw new Ga4ProviderError(
      `Google OAuth token exchange failed [${response.status}].`,
      response.status,
    );
  }
  return payload.access_token;
}

async function serviceAccountToken(raw: string): Promise<string> {
  let account: {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };
  try {
    account = JSON.parse(raw) as typeof account;
  } catch {
    throw new Ga4ProviderError("GA4_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!account.client_email || !account.private_key) {
    throw new Ga4ProviderError("GA4_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: ANALYTICS_SCOPE,
      aud: account.token_uri ?? TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;

  return tokenResponse(
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  );
}

async function oauthRefreshToken(env: Record<string, string | undefined>): Promise<string> {
  return tokenResponse(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env["GA4_OAUTH_CLIENT_ID"]!,
      client_secret: env["GA4_OAUTH_CLIENT_SECRET"]!,
      refresh_token: env["GA4_OAUTH_REFRESH_TOKEN"]!,
    }),
  );
}

export async function ga4AccessToken(env: Record<string, string | undefined>): Promise<{
  token: string;
  credentialKind: Exclude<Ga4CredentialKind, null>;
}> {
  const presence = readGa4EnvPresence(env);
  if (presence.serviceAccountJson) {
    return {
      token: await serviceAccountToken(env["GA4_SERVICE_ACCOUNT_JSON"]!),
      credentialKind: "service_account",
    };
  }
  if (presence.oauthRefreshToken && presence.oauthClientId && presence.oauthClientSecret) {
    return {
      token: await oauthRefreshToken(env),
      credentialKind: "oauth_refresh_token",
    };
  }
  throw new Ga4ProviderError("A complete server-side GA4 credential is not configured.");
}

export async function fetchGa4Inventory(
  property: string,
  window: { startDate: string; endDate: string },
  env: Record<string, string | undefined> = process.env,
  targetUrl?: string,
): Promise<{
  inventory: Ga4Inventory;
  credentialKind: Exclude<Ga4CredentialKind, null>;
  httpStatus: number;
}> {
  const auth = await ga4AccessToken(env);
  const response = await fetch(`${DATA_ENDPOINT}/${property}:runReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildGa4InventoryRequest(window, targetUrl)),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Ga4ProviderError(
      `GA4 Data API returned unreadable JSON [${response.status}].`,
      response.status,
      ga4ResponseProvesAuthentication(response.status),
    );
  }
  if (!response.ok) {
    throw new Ga4ProviderError(
      `GA4 Data API request failed [${response.status}].`,
      response.status,
      ga4ResponseProvesAuthentication(response.status),
    );
  }
  return {
    inventory: normalizeGa4Inventory(payload),
    credentialKind: auth.credentialKind,
    httpStatus: response.status,
  };
}

/** Event totals by name, for the one-day read stored beside the window. */
export function eventTotals(rows: readonly { eventName: string; eventCount: number }[]) {
  const byEvent = new Map<string, number>();
  for (const row of rows) {
    if (!row.eventName) continue;
    byEvent.set(row.eventName, (byEvent.get(row.eventName) ?? 0) + row.eventCount);
  }
  return [...byEvent.entries()]
    .map(([eventName, eventCount]) => ({ eventName, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount);
}

export async function runGa4Inventory(
  admin: AdminClient,
  input: {
    tenantId: string;
    actorId?: string | null;
    property: string;
    now?: Date;
  },
) {
  const window = ga4Window(input.now ?? new Date());
  const { data: run, error: runError } = await admin
    .from("measurement_runs")
    .insert({
      tenant_id: input.tenantId,
      provider: "ga4",
      target: input.property,
      strategy: "page_event_inventory",
      actor_id: input.actorId ?? null,
      status: "running",
      cost_usd: 0,
    })
    .select("id")
    .single();
  if (runError || !run)
    throw new Error(`Could not open a GA4 measurement run: ${runError?.message ?? "no row"}`);

  const startedAt = Date.now();
  const finish = async (patch: Record<string, unknown>) => {
    const { error } = await admin
      .from("measurement_runs")
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        ...patch,
      })
      .eq("id", run.id);
    if (error) throw new Error(`Could not close the GA4 measurement run: ${error.message}`);
  };

  let authenticationSucceeded = false;
  try {
    const result = await fetchGa4Inventory(input.property, window);
    authenticationSucceeded = true;
    // Yesterday alone, so a tag that broke is seen within a day rather than
    // after 28 silent ones (MEAS-9). The 28-day read is what this run exists
    // for; a failed daily read is recorded on the snapshot and never fails it.
    const dailyDate = window.endDate;
    let dailyEvents: { eventName: string; eventCount: number }[] | null = null;
    let dailyError: string | null = null;
    try {
      const daily = await fetchGa4Inventory(input.property, {
        startDate: dailyDate,
        endDate: dailyDate,
      });
      dailyEvents = eventTotals(daily.inventory.rows);
    } catch (error) {
      dailyError = error instanceof Error ? error.message : String(error);
    }
    const metrics = {
      dailyDate,
      dailyEvents,
      dailyError,
      rowCount: result.inventory.rowCount,
      pageCount: result.inventory.pageCount,
      eventNameCount: result.inventory.eventNameCount,
      totalEventCount: result.inventory.totalEventCount,
      totalSessions: result.inventory.totalSessions,
      truncated: result.inventory.truncated,
      rows: result.inventory.rows,
    };
    const { error: snapshotError } = await admin.from("ga4_snapshots").insert({
      tenant_id: input.tenantId,
      run_id: run.id,
      property: input.property,
      start_date: window.startDate,
      end_date: window.endDate,
      metrics: metrics as never,
      quota: result.inventory.quota as never,
      provenance: {
        endpoint: `${DATA_ENDPOINT}/${input.property}:runReport`,
        credentialKind: result.credentialKind,
        dimensions: ["hostName", "pagePathPlusQueryString", "eventName"],
        metrics: ["eventCount", "activeUsers", "sessions"],
      } as never,
    });
    if (snapshotError)
      throw new Error(
        `GA4 responded but the snapshot could not be stored: ${snapshotError.message}`,
      );
    await finish({
      status: "succeeded",
      http_status: result.httpStatus,
      quota: { authenticationSucceeded: true },
    });
    return {
      runId: run.id,
      status: "succeeded" as const,
      window,
      rowCount: result.inventory.rowCount,
      pageCount: result.inventory.pageCount,
      eventNameCount: result.inventory.eventNameCount,
      totalEventCount: result.inventory.totalEventCount,
      totalSessions: result.inventory.totalSessions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus = error instanceof Ga4ProviderError ? error.httpStatus : null;
    await finish({
      status: "failed",
      error: message,
      http_status: httpStatus,
      quota: {
        authenticationSucceeded:
          error instanceof Ga4ProviderError
            ? error.authenticationSucceeded
            : authenticationSucceeded,
      },
    });
    throw new Error(message);
  }
}

/**
 * One exact-target, exact-window read for immutable change measurement. This
 * does not write a property-wide GA4 snapshot; the caller appends the result to
 * the governed change-measurement history.
 */
export async function runGa4PageWindow(
  admin: AdminClient,
  input: {
    tenantId: string;
    property: string;
    targetUrl: string;
    startDate: string;
    endDate: string;
    windowDays: MeasurementWindowDays;
  },
) {
  const { data: run, error: runError } = await admin
    .from("measurement_runs")
    .insert({
      tenant_id: input.tenantId,
      provider: "ga4",
      target: input.targetUrl,
      strategy: `change_window_${input.windowDays}`,
      status: "running",
      cost_usd: 0,
    })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(
      `Could not open a GA4 change-measurement run: ${runError?.message ?? "no row"}`,
    );
  }

  const startedAt = Date.now();
  const finish = async (patch: Record<string, unknown>) => {
    const { error } = await admin
      .from("measurement_runs")
      .update({
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        ...patch,
      })
      .eq("id", run.id);
    if (error) throw new Error(`Could not close the GA4 change-measurement run: ${error.message}`);
  };

  let authenticationSucceeded = false;
  try {
    const result = await fetchGa4Inventory(
      input.property,
      { startDate: input.startDate, endDate: input.endDate },
      process.env,
      input.targetUrl,
    );
    authenticationSucceeded = true;
    await finish({
      status: "succeeded",
      http_status: result.httpStatus,
      quota: { authenticationSucceeded: true },
    });
    return { runId: run.id, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus = error instanceof Ga4ProviderError ? error.httpStatus : null;
    await finish({
      status: "failed",
      error: message,
      http_status: httpStatus,
      quota: {
        authenticationSucceeded:
          error instanceof Ga4ProviderError
            ? error.authenticationSucceeded
            : authenticationSucceeded,
      },
    });
    throw error;
  }
}

/**
 * Scheduled GA4 observation. Runs one inventory read per tenant that has a
 * selected Search Console property bound to a GA4 property. A provider failure
 * is recorded as a failed run, never as zero traffic.
 */
export async function runGa4DailyObservation(
  admin: AdminClient,
  now = new Date(),
): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  results: Array<{
    tenantId: string;
    property: string;
    status: "succeeded" | "failed";
    rowCount?: number;
    error?: string;
  }>;
}> {
  const { ga4PropertyForSearchConsoleProperty } = await import("./ga4");
  const { data: selected, error } = await admin
    .from("search_console_properties")
    .select("tenant_id, site_url")
    .eq("selected", true);
  if (error) throw new Error(`Could not read selected Search Console properties: ${error.message}`);

  const results: Array<{
    tenantId: string;
    property: string;
    status: "succeeded" | "failed";
    rowCount?: number;
    error?: string;
  }> = [];

  for (const row of selected ?? []) {
    const property = ga4PropertyForSearchConsoleProperty(row.site_url);
    if (!property || !row.tenant_id) continue;
    try {
      const result = await runGa4Inventory(admin, {
        tenantId: row.tenant_id,
        actorId: null,
        property,
        now,
      });
      results.push({
        tenantId: row.tenant_id,
        property,
        status: "succeeded",
        rowCount: result.rowCount,
      });
    } catch (providerError) {
      results.push({
        tenantId: row.tenant_id,
        property,
        status: "failed",
        error: providerError instanceof Error ? providerError.message : String(providerError),
      });
    }
  }

  return {
    attempted: results.length,
    succeeded: results.filter((entry) => entry.status === "succeeded").length,
    failed: results.filter((entry) => entry.status === "failed").length,
    results,
  };
}
