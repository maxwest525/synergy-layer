import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";

type Client = SupabaseClient<Database>;

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";
const REPORTING_TIMEZONE = "America/Los_Angeles";
const API_QUERY_VERSION = "webmasters/v3";

/** Permission levels the connected account can actually query with. */
const QUERYABLE_PERMISSIONS = new Set(["siteOwner", "siteFullUser", "siteRestrictedUser"]);

export type PropertyEntry = {
  siteUrl: string;
  permissionLevel: string;
  eligible: boolean;
};

/** A genuine connector fault: auth, transport, API, validation, or persistence. */
export class SearchConsoleFailure extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "SearchConsoleFailure";
    this.reason = reason;
  }
}

function credentials(): { lovableApiKey: string; connectionApiKey: string } {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionApiKey = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  if (!lovableApiKey || !connectionApiKey) {
    throw new SearchConsoleFailure(
      "missing_credentials",
      "Search Console credentials are not available to the server.",
    );
  }
  return { lovableApiKey, connectionApiKey };
}

async function gateway<T>(path: string, init?: RequestInit): Promise<T> {
  const { lovableApiKey, connectionApiKey } = credentials();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${lovableApiKey}`);
  headers.set("X-Connection-Api-Key", connectionApiKey);
  if (init?.body) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${GATEWAY}${path}`, { ...init, headers });
  } catch (error) {
    throw new SearchConsoleFailure("transport", `Search Console request failed: ${String(error)}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new SearchConsoleFailure(
      "authorization",
      `The connected Google account is not authorised for this Search Console request [${response.status}]: ${await response.text()}`,
    );
  }
  if (!response.ok) {
    throw new SearchConsoleFailure(
      "api_error",
      `Search Console request failed [${response.status}]: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

/** Pacific-time calendar date for a given instant, the timezone Search Console reports in. */
export function pacificDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

export function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Accessible properties with the permission level Google reports. Never "verified by AOOS". */
export async function listProperties(): Promise<PropertyEntry[]> {
  const data = await gateway<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(
    "/webmasters/v3/sites",
  );
  return (data.siteEntry ?? []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel ?? "unknown",
    eligible: QUERYABLE_PERMISSIONS.has(entry.permissionLevel ?? ""),
  }));
}

export async function syncProperties(client: Client): Promise<PropertyEntry[]> {
  const entries = await listProperties();
  const tenantId = await requireTenantId(client);
  for (const entry of entries) {
    const { error } = await client
      .from("search_console_properties")
      .upsert(
        {
          tenant_id: tenantId,
          site_url: entry.siteUrl,
          permission_level: entry.permissionLevel,
          eligible: entry.eligible,
          last_observed_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,site_url" },
      );
    if (error) throw new SearchConsoleFailure("persistence", error.message);
  }

  await logActivity(client, {
    verb: "capability.connection_status_observed_connected",
    subjectKind: "capability",
    summary: `Search Console reported ${entries.length} accessible propert${entries.length === 1 ? "y" : "ies"}.`,
    payload: { observation: true, properties: entries },
  });

  return entries;
}

/** Re-lists live before accepting a choice; only queryable permission levels pass. */
export async function selectProperty(
  client: Client,
  siteUrl: string,
  actorId: string | null,
  assetId?: string | null,
): Promise<PropertyEntry> {
  const entries = await syncProperties(client);
  const match = entries.find((entry) => entry.siteUrl === siteUrl);
  if (!match) {
    throw new SearchConsoleFailure("validation", "That property is not accessible to the connected account.");
  }
  if (!match.eligible) {
    throw new SearchConsoleFailure(
      "validation",
      `The connected account only has "${match.permissionLevel}" access to this property, which cannot query performance data.`,
    );
  }

  const clearError = (await client
    .from("search_console_properties")
    .update({ selected: false })
    .neq("site_url", siteUrl)).error;
  if (clearError) throw new SearchConsoleFailure("persistence", clearError.message);

  const { error } = await client
    .from("search_console_properties")
    .update({ selected: true, ...(assetId ? { asset_id: assetId } : {}) })
    .eq("site_url", siteUrl);
  if (error) throw new SearchConsoleFailure("persistence", error.message);

  await logActivity(client, {
    actorKind: actorId ? "user" : "system",
    actorId,
    verb: "capability.property_selected",
    subjectKind: "capability",
    summary: `Search Console property ${siteUrl} selected (${match.permissionLevel}).`,
    payload: { siteUrl, permissionLevel: match.permissionLevel },
  });

  return match;
}

export async function getSelectedProperty(client: Client): Promise<string | null> {
  const { data, error } = await client
    .from("search_console_properties")
    .select("site_url")
    .eq("selected", true)
    .maybeSingle();
  if (error) throw new SearchConsoleFailure("persistence", error.message);
  return data?.site_url ?? null;
}

type QueryBody = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  type?: string;
  dataState?: string;
  rowLimit?: number;
  startRow?: number;
  aggregationType?: string;
};

export type QueryRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
type QueryResponse = { rows?: QueryRow[]; responseAggregationType?: string };

async function query(property: string, body: QueryBody): Promise<QueryResponse> {
  return gateway<QueryResponse>(
    `/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    { method: "POST", body: JSON.stringify({ dataState: "final", type: "web", ...body }) },
  );
}

/**
 * Newest Pacific date with finalized data. No hardcoded lag: ask the API and
 * take the newest date it returns. Zero rows is a valid answer, not a failure.
 */
export async function latestFinalDate(property: string): Promise<string | null> {
  const today = pacificDate(new Date());
  const response = await query(property, {
    startDate: shiftDate(today, -14),
    endDate: today,
    dimensions: ["date"],
    rowLimit: 30,
  });
  const dates = (response.rows ?? []).map((row) => row.keys?.[0]).filter(Boolean) as string[];
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

type SnapshotInput = {
  property: string;
  kind: "property_totals" | "dimensional_rows" | "page_query";
  dimensions: string[];
  aggregationType: string;
  responseAggregationType: string | null;
  rowLimit: number;
  paginatedRequestCount: number;
  periodStart: string;
  periodEnd: string;
  rows: QueryRow[];
  totals: Record<string, number | null>;
};

async function persistSnapshot(client: Client, input: SnapshotInput): Promise<string> {

  const definition = {
    property: input.property,
    kind: input.kind,
    dimensions: input.dimensions,
    aggregationType: input.aggregationType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    rows: input.rows,
  };

  const { data, error } = await client
    .from("search_console_snapshots")
    .insert({
      tenant_id: await requireTenantId(client),
      property: input.property,
      kind: input.kind,
      search_type: "web",
      dimensions: input.dimensions,
      filters: [] as never,
      aggregation_type: input.aggregationType,
      response_aggregation_type: input.responseAggregationType,
      data_state: "final",
      row_limit: input.rowLimit,
      paginated_request_count: input.paginatedRequestCount,
      returned_row_count: input.rows.length,
      // An ungrouped property-total query returns exactly one row by design.
      possibly_truncated: input.kind !== "property_totals" && input.rows.length >= input.rowLimit,

      reporting_timezone: REPORTING_TIMEZONE,
      period_start_pt: input.periodStart,
      period_end_pt: input.periodEnd,
      api_query_version: API_QUERY_VERSION,
      checksum: checksum(definition),
      totals: input.totals as never,
      payload: { rows: input.rows } as never,
    })
    .select("id")
    .single();
  if (error) throw new SearchConsoleFailure("persistence", error.message);
  return data.id;
}

/** Impression-weighted average position; row positions are never plainly averaged. */
export function weightedPosition(rows: QueryRow[]): number | null {
  const impressions = rows.reduce((total, row) => total + row.impressions, 0);
  if (impressions === 0) return null;
  return rows.reduce((total, row) => total + row.position * row.impressions, 0) / impressions;
}

export type CollectionResult = {
  property: string;
  reportingDate: string | null;
  snapshotIds: string[];
  emptyResult: boolean;
};

/**
 * Idempotent daily collection for one finalized Pacific date. Site totals come
 * from an ungrouped property query, never from summing dimensional rows.
 */
const PAGE_QUERY_ROW_LIMIT = 5000;
const PAGE_QUERY_MAX_REQUESTS = 5;

/**
 * Immutable page+query snapshot for one finalized Pacific date. Re-running for a
 * date already collected is a successful no-change run: no duplicate is written.
 * Zero rows is a successful empty collection.
 */
export async function collectPageQuery(
  client: Client,
  property: string,
  reportingDate: string,
): Promise<{ snapshotId: string | null; rows: number; created: boolean }> {
  const { data: existing, error: existingError } = await client
    .from("search_console_snapshots")
    .select("id, checksum, returned_row_count")
    .eq("property", property)
    .eq("period_end_pt", reportingDate)
    .eq("kind", "page_query");
  if (existingError) throw new SearchConsoleFailure("persistence", existingError.message);
  if ((existing ?? []).length > 0) {
    const first = existing![0]!;
    return { snapshotId: first.id, rows: first.returned_row_count, created: false };
  }

  const rows: QueryRow[] = [];
  let requests = 0;
  let responseAggregationType: string | null = null;
  while (requests < PAGE_QUERY_MAX_REQUESTS) {
    const response = await query(property, {
      startDate: reportingDate,
      endDate: reportingDate,
      dimensions: ["page", "query"],
      rowLimit: PAGE_QUERY_ROW_LIMIT,
      startRow: requests * PAGE_QUERY_ROW_LIMIT,
    });
    requests += 1;
    responseAggregationType = response.responseAggregationType ?? responseAggregationType;
    const page = response.rows ?? [];
    rows.push(...page);
    if (page.length < PAGE_QUERY_ROW_LIMIT) break;
  }

  const snapshotId = await persistSnapshot(client, {
    property,
    kind: "page_query",
    dimensions: ["page", "query"],
    aggregationType: "auto",
    responseAggregationType,
    rowLimit: PAGE_QUERY_ROW_LIMIT * requests,
    paginatedRequestCount: requests,
    periodStart: reportingDate,
    periodEnd: reportingDate,
    rows,
    totals: {
      clicks: rows.reduce((total, row) => total + row.clicks, 0),
      impressions: rows.reduce((total, row) => total + row.impressions, 0),
      position: weightedPosition(rows),
    },
  });

  return { snapshotId, rows: rows.length, created: true };
}

export async function collectDaily(client: Client, property: string): Promise<CollectionResult> {
  const reportingDate = await latestFinalDate(property);

  if (!reportingDate) {
    return { property, reportingDate: null, snapshotIds: [], emptyResult: true };
  }

  const { data: existing, error: existingError } = await client
    .from("search_console_snapshots")
    .select("id")
    .eq("property", property)
    .eq("period_end_pt", reportingDate)
    .eq("kind", "property_totals");
  if (existingError) throw new SearchConsoleFailure("persistence", existingError.message);
  if ((existing ?? []).length > 0) {
    // Still ensure the page+query snapshot exists for this finalized date.
    const backfilled = await collectPageQuery(client, property, reportingDate);
    return {
      property,
      reportingDate,
      snapshotIds: backfilled.created && backfilled.snapshotId ? [backfilled.snapshotId] : [],
      emptyResult: false,
    };
  }

  const snapshotIds: string[] = [];


  const totalsResponse = await query(property, {
    startDate: reportingDate,
    endDate: reportingDate,
    rowLimit: 1,
  });
  const totalsRow = totalsResponse.rows?.[0];
  const totals = {
    clicks: totalsRow?.clicks ?? 0,
    impressions: totalsRow?.impressions ?? 0,
    ctr: totalsRow && totalsRow.impressions > 0 ? totalsRow.clicks / totalsRow.impressions : null,
    position: totalsRow?.position ?? null,
  };

  snapshotIds.push(
    await persistSnapshot(client, {
      property,
      kind: "property_totals",
      dimensions: [],
      aggregationType: "auto",
      responseAggregationType: totalsResponse.responseAggregationType ?? null,
      rowLimit: 1,
      paginatedRequestCount: 1,
      periodStart: reportingDate,
      periodEnd: reportingDate,
      rows: totalsRow ? [totalsRow] : [],
      totals,
    }),
  );

  for (const dimensions of [["page"], ["query"], ["device"], ["country"]]) {
    const response = await query(property, {
      startDate: reportingDate,
      endDate: reportingDate,
      dimensions,
      rowLimit: 5000,
    });
    const rows = response.rows ?? [];
    snapshotIds.push(
      await persistSnapshot(client, {
        property,
        kind: "dimensional_rows",
        dimensions,
        aggregationType: "auto",
        responseAggregationType: response.responseAggregationType ?? null,
        rowLimit: 5000,
        paginatedRequestCount: 1,
        periodStart: reportingDate,
        periodEnd: reportingDate,
        rows,
        totals: {
          clicks: rows.reduce((total, row) => total + row.clicks, 0),
          impressions: rows.reduce((total, row) => total + row.impressions, 0),
          position: weightedPosition(rows),
        },
      }),
    );
  }

  const pageQuery = await collectPageQuery(client, property, reportingDate);
  if (pageQuery.created && pageQuery.snapshotId) snapshotIds.push(pageQuery.snapshotId);



  const sitemaps = await gateway<{ sitemap?: unknown[] }>(
    `/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`,
  );
  const { error: sitemapError } = await client.from("search_console_snapshots").insert({
    tenant_id: await requireTenantId(client),
    property,
    kind: "dimensional_rows",
    dimensions: ["sitemap"],
    data_state: "final",
    row_limit: 0,
    returned_row_count: (sitemaps.sitemap ?? []).length,
    period_start_pt: reportingDate,
    period_end_pt: reportingDate,
    reporting_timezone: REPORTING_TIMEZONE,
    api_query_version: API_QUERY_VERSION,
    checksum: checksum(sitemaps),
    payload: sitemaps as never,
  });
  if (sitemapError) throw new SearchConsoleFailure("persistence", sitemapError.message);

  const emptyResult = totals.impressions === 0;

  await logActivity(client, {
    verb: "capability.observation_collected",
    subjectKind: "capability",
    summary: emptyResult
      ? `Search Console returned no rows for ${property} on ${reportingDate} (Pacific). Recorded as an empty snapshot.`
      : `Collected Search Console data for ${property} on ${reportingDate} (Pacific).`,
    payload: { property, reportingDate, emptyResult, snapshots: snapshotIds.length },
  });

  return { property, reportingDate, snapshotIds, emptyResult };
}

