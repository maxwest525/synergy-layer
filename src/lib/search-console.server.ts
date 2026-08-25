import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";
import { googleAccessToken, GoogleTokenError } from "./google-token.server";
import {
  SEARCH_CONSOLE_CREDENTIAL_NAMES,
  SEARCH_CONSOLE_SCOPE,
  searchConsoleRoute,
} from "./search-console-transport";
import {
  materializeDailyTotals,
  normalizeInspection,
  normalizeOwnedUrl,
  ruleWindows,
} from "./search-console";

type Client = SupabaseClient<Database>;

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

/**
 * The origin to call and the headers that authenticate it. Direct to Google when
 * a Google credential is configured, otherwise through the Lovable connector
 * gateway. Both speak the same `webmasters/v3` paths, so only these two values
 * differ between the routes.
 */
async function transport(): Promise<{ origin: string; headers: Record<string, string> }> {
  const route = searchConsoleRoute(process.env);
  if (!route) {
    throw new SearchConsoleFailure(
      "missing_credentials",
      "Search Console credentials are not available to the server.",
    );
  }

  if (route.kind === "lovable_gateway") {
    return {
      origin: route.origin,
      headers: {
        Authorization: `Bearer ${route.lovableApiKey}`,
        "X-Connection-Api-Key": route.connectionApiKey,
      },
    };
  }

  try {
    const { token } = await googleAccessToken({
      env: process.env,
      names: SEARCH_CONSOLE_CREDENTIAL_NAMES,
      scope: SEARCH_CONSOLE_SCOPE,
    });
    return { origin: route.origin, headers: { Authorization: `Bearer ${token}` } };
  } catch (error) {
    // A rejected credential is an auth fault, not a transport blip: retrying it
    // would spend three more attempts reaching the same answer.
    throw new SearchConsoleFailure(
      "missing_credentials",
      error instanceof GoogleTokenError
        ? error.message
        : `Google would not issue a Search Console token: ${String(error)}`,
    );
  }
}

/** Read-only Search Console calls are safe to retry, so a transient upstream
 * fault (network reset, 429, 5xx) no longer loses a whole day of observation. */
const TRANSIENT_ATTEMPTS = 4;
const TRANSIENT_BASE_DELAY_MS = 500;

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function gateway<T>(path: string, init?: RequestInit): Promise<T> {
  const route = await transport();
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(route.headers)) headers.set(name, value);
  if (init?.body) headers.set("Content-Type", "application/json");

  let lastFailure: SearchConsoleFailure | null = null;

  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${route.origin}${path}`, { ...init, headers });
    } catch (error) {
      lastFailure = new SearchConsoleFailure(
        "transport",
        `Search Console request failed after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${String(error)}`,
      );
      if (attempt === TRANSIENT_ATTEMPTS) break;
      await new Promise((resolve) =>
        setTimeout(resolve, TRANSIENT_BASE_DELAY_MS * 2 ** (attempt - 1)),
      );
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new SearchConsoleFailure(
        "authorization",
        `The connected Google account is not authorised for this Search Console request [${response.status}]: ${await response.text()}`,
      );
    }
    if (!response.ok) {
      const detail = await response.text();
      const failure = new SearchConsoleFailure(
        isTransientStatus(response.status) ? "transient" : "api_error",
        `Search Console request failed [${response.status}] on attempt ${attempt}: ${detail}`,
      );
      if (!isTransientStatus(response.status)) throw failure;
      lastFailure = failure;
      if (attempt === TRANSIENT_ATTEMPTS) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : TRANSIENT_BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    const body = await response.text();
    if (body.trim() === "") return undefined as T;
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new SearchConsoleFailure(
        "api_error",
        "Search Console returned a successful response that was not valid JSON.",
      );
    }
  }

  throw (
    lastFailure ??
    new SearchConsoleFailure("transient", "Search Console request failed for an unknown reason.")
  );
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
  const data = await gateway<{
    siteEntry?: { siteUrl: string; permissionLevel?: string }[];
  }>("/webmasters/v3/sites");
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
    const { error } = await client.from("search_console_properties").upsert(
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
    throw new SearchConsoleFailure(
      "validation",
      "That property is not accessible to the connected account.",
    );
  }
  if (!match.eligible) {
    throw new SearchConsoleFailure(
      "validation",
      `The connected account only has "${match.permissionLevel}" access to this property, which cannot query performance data.`,
    );
  }

  const clearError = (
    await client
      .from("search_console_properties")
      .update({ selected: false })
      .neq("site_url", siteUrl)
  ).error;
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

type InspectionRow = Database["public"]["Tables"]["search_console_url_inspections"]["Row"];
type SitemapSubmissionRow =
  Database["public"]["Tables"]["search_console_sitemap_submissions"]["Row"];

/** Run Google's indexed-version URL Inspection for one page covered by the selected property. */
export async function inspectUrl(
  client: Client,
  property: string,
  candidateUrl: string,
  actorId: string | null,
): Promise<InspectionRow> {
  const inspectedUrl = normalizeOwnedUrl(property, candidateUrl);
  const payload = await gateway<unknown>("/v1/urlInspection/index:inspect", {
    method: "POST",
    body: JSON.stringify({
      inspectionUrl: inspectedUrl,
      siteUrl: property,
      languageCode: "en-US",
    }),
  });
  const inspection = normalizeInspection(payload);
  const { data, error } = await client
    .from("search_console_url_inspections")
    .insert({
      tenant_id: await requireTenantId(client),
      property,
      inspected_url: inspectedUrl,
      verdict: inspection.verdict,
      coverage_state: inspection.coverageState,
      robots_txt_state: inspection.robotsTxtState,
      indexing_state: inspection.indexingState,
      page_fetch_state: inspection.pageFetchState,
      last_crawl_time: inspection.lastCrawlTime,
      google_canonical: inspection.googleCanonical,
      user_canonical: inspection.userCanonical,
      crawled_as: inspection.crawledAs,
      sitemaps: inspection.sitemaps,
      referring_urls: inspection.referringUrls,
      inspection_result_link: inspection.inspectionResultLink,
      mobile_usability_verdict: inspection.mobileUsabilityVerdict,
      rich_results_verdict: inspection.richResultsVerdict,
      raw_payload: payload as never,
      requested_by: actorId,
    })
    .select("*")
    .single();
  if (error) throw new SearchConsoleFailure("persistence", error.message);

  await logActivity(client, {
    actorKind: "user",
    actorId,
    verb: "search_console.url_inspected",
    subjectKind: "url",
    summary: `Inspected Google's indexed version of ${inspectedUrl}: ${inspection.verdict}.`,
    payload: {
      property,
      inspectedUrl,
      verdict: inspection.verdict,
      coverageState: inspection.coverageState,
    },
  });
  return data;
}

async function recordSitemapSubmission(
  client: Client,
  input: {
    property: string;
    sitemapUrl: string;
    actorId: string;
    status: "submitted" | "failed";
    failureReason?: string | null;
  },
): Promise<SitemapSubmissionRow> {
  const { data, error } = await client
    .from("search_console_sitemap_submissions")
    .insert({
      tenant_id: await requireTenantId(client),
      property: input.property,
      sitemap_url: input.sitemapUrl,
      status: input.status,
      failure_reason: input.failureReason ?? null,
      requested_by: input.actorId,
    })
    .select("*")
    .single();
  if (error) throw new SearchConsoleFailure("persistence", error.message);
  return data;
}

/** Explicit write: ask Google to process one owned sitemap and retain an audit record. */
export async function submitSitemap(
  client: Client,
  property: string,
  candidateUrl: string,
  actorId: string,
): Promise<SitemapSubmissionRow> {
  const sitemapUrl = normalizeOwnedUrl(property, candidateUrl);
  try {
    await gateway<void>(
      `/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
      { method: "PUT" },
    );
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    await recordSitemapSubmission(client, {
      property,
      sitemapUrl,
      actorId,
      status: "failed",
      failureReason,
    });
    await logActivity(client, {
      actorKind: "user",
      actorId,
      verb: "search_console.sitemap_submission_failed",
      subjectKind: "sitemap",
      summary: `Google did not accept sitemap ${sitemapUrl}: ${failureReason}`,
      payload: { property, sitemapUrl, failureReason },
    });
    throw error;
  }

  const submission = await recordSitemapSubmission(client, {
    property,
    sitemapUrl,
    actorId,
    status: "submitted",
  });
  await logActivity(client, {
    actorKind: "user",
    actorId,
    verb: "search_console.sitemap_submitted",
    subjectKind: "sitemap",
    subjectId: submission.id,
    summary: `Submitted sitemap ${sitemapUrl} to Google Search Console.`,
    payload: {
      property,
      sitemapUrl,
      guarantee: "Submission asks Google to process the sitemap; it does not guarantee indexing.",
    },
  });
  return submission;
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

export type QueryRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
type QueryResponse = { rows?: QueryRow[]; responseAggregationType?: string };

async function query(property: string, body: QueryBody): Promise<QueryResponse> {
  return gateway<QueryResponse>(
    `/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      body: JSON.stringify({ dataState: "final", type: "web", ...body }),
    },
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
  kind: "property_totals" | "dimensional_rows" | "page_query" | "dimensional_rows_window";
  dimensions: string[];
  searchType?: string;
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
  const tenantId = await requireTenantId(client);
  const definition = {
    property: input.property,
    kind: input.kind,
    dimensions: input.dimensions,
    searchType: input.searchType ?? "web",
    aggregationType: input.aggregationType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    rows: input.rows,
  };

  const { data, error } = await client
    .from("search_console_snapshots")
    .insert({
      tenant_id: tenantId,
      property: input.property,
      kind: input.kind,
      search_type: input.searchType ?? "web",
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
  if (error?.code === "23505" && input.kind === "property_totals") {
    const { data: existing, error: existingError } = await client
      .from("search_console_snapshots")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("property", input.property)
      .eq("kind", "property_totals")
      .eq("period_start_pt", input.periodStart)
      .single();
    if (existingError) throw new SearchConsoleFailure("persistence", existingError.message);
    return existing.id;
  }
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
/** The snapshot kind holding rule-window aggregates, distinct from the daily rows. */
export const RULE_WINDOW_KIND = "dimensional_rows_window";

/**
 * Collects the aggregate the rules actually judge on: one read per dimension
 * over the whole window, not one read per day.
 *
 * Google aggregates server-side when a request spans several days, so a single
 * query over 28 days returns each query and page once with its totals for the
 * period. That is a different number from summing 28 daily snapshots, and it is
 * the correct one: daily rows are independently thresholded and truncated by
 * Google, so summing them under-counts.
 *
 * Stored under its own `kind` so the existing daily readers, the period
 * comparison, and every stored observation fingerprint are untouched.
 */
async function collectWindowRows(
  client: Client,
  property: string,
  reportingDate: string,
): Promise<string[]> {
  const windowStart = ruleWindows(reportingDate, RULE_WINDOW_DAYS).current.start;
  const ids: string[] = [];

  for (const dimensions of [["query"], ["page"], ["page", "query"]]) {
    const response = await query(property, {
      startDate: windowStart,
      endDate: reportingDate,
      dimensions,
      rowLimit: 5000,
    });
    const rows = response.rows ?? [];
    const impressions = rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
    const clicks = rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);

    ids.push(
      await persistSnapshot(client, {
        property,
        kind: RULE_WINDOW_KIND,
        dimensions,
        aggregationType: "auto",
        responseAggregationType: response.responseAggregationType ?? null,
        rowLimit: 5000,
        paginatedRequestCount: 1,
        periodStart: windowStart,
        periodEnd: reportingDate,
        rows,
        totals: {
          clicks,
          impressions,
          ctr: impressions > 0 ? clicks / impressions : null,
          position: null,
        },
      }),
    );
  }

  return ids;
}

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
    return {
      snapshotId: first.id,
      rows: first.returned_row_count,
      created: false,
    };
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

/**
 * A failed run used to lose that day's page+query detail for good. Every run now
 * fills any missing day inside a short trailing window, so one bad day heals itself.
 */
const PAGE_QUERY_BACKFILL_DAYS = 7;

export async function backfillPageQueryGaps(
  client: Client,
  property: string,
  reportingDate: string,
): Promise<string[]> {
  const created: string[] = [];
  for (let offset = 1; offset <= PAGE_QUERY_BACKFILL_DAYS; offset += 1) {
    const date = shiftDate(reportingDate, -offset);
    const result = await collectPageQuery(client, property, date);
    if (result.created && result.snapshotId) created.push(result.snapshotId);
  }
  return created;
}

const COMPARISON_HISTORY_DAYS = 56;

/**
 * The window the rules judge on.
 *
 * Every dimensional read above is a single finalized day, which is the right
 * grain for the daily-totals series the period comparison needs. It is the wrong
 * grain for a rule: `weakCtr` wants 200 impressions on one page and
 * `strikingDistance` wants 50 on one query, and this property's best finalized
 * day is 18 impressions across the whole site. Judged a day at a time, those
 * rules can never fire, which is exactly what has been happening.
 *
 * The thresholds were never wrong; the window was. Over 28 days the same
 * numbers are ordinary, so nothing here re-tunes them.
 */
export const RULE_WINDOW_DAYS = 28;

/** One provider query backfills the two complete 28-day comparison windows. */
async function collectDailyTotalsHistory(
  client: Client,
  property: string,
  reportingDate: string,
): Promise<string[]> {
  const periodStart = shiftDate(reportingDate, -(COMPARISON_HISTORY_DAYS - 1));
  const response = await query(property, {
    startDate: periodStart,
    endDate: reportingDate,
    dimensions: ["date"],
    rowLimit: 250,
  });
  const days = materializeDailyTotals(response.rows ?? [], periodStart, reportingDate);
  const { data: existing, error } = await client
    .from("search_console_snapshots")
    .select("period_start_pt")
    .eq("property", property)
    .eq("kind", "property_totals")
    .gte("period_start_pt", periodStart)
    .lte("period_start_pt", reportingDate);
  if (error) throw new SearchConsoleFailure("persistence", error.message);
  const existingDates = new Set((existing ?? []).map((row) => row.period_start_pt));
  const snapshotIds: string[] = [];

  for (const day of days) {
    if (existingDates.has(day.date)) continue;
    const rows: QueryRow[] =
      day.impressions > 0
        ? [
            {
              keys: [day.date],
              clicks: day.clicks,
              impressions: day.impressions,
              ctr: day.ctr ?? 0,
              position: day.position ?? 0,
            },
          ]
        : [];
    snapshotIds.push(
      await persistSnapshot(client, {
        property,
        kind: "property_totals",
        dimensions: [],
        aggregationType: "auto",
        responseAggregationType: response.responseAggregationType ?? null,
        rowLimit: 1,
        paginatedRequestCount: 1,
        periodStart: day.date,
        periodEnd: day.date,
        rows,
        totals: {
          clicks: day.clicks,
          impressions: day.impressions,
          ctr: day.ctr,
          position: day.position,
        },
      }),
    );
  }
  return snapshotIds;
}

export async function collectDaily(client: Client, property: string): Promise<CollectionResult> {
  const reportingDate = await latestFinalDate(property);

  if (!reportingDate) {
    return {
      property,
      reportingDate: null,
      snapshotIds: [],
      emptyResult: true,
    };
  }

  const { data: existing, error: existingError } = await client
    .from("search_console_snapshots")
    .select("id")
    .eq("property", property)
    .eq("period_end_pt", reportingDate)
    .eq("kind", "property_totals");
  if (existingError) throw new SearchConsoleFailure("persistence", existingError.message);
  if ((existing ?? []).length > 0) {
    const historyIds = await collectDailyTotalsHistory(client, property, reportingDate);
    // Still ensure the page+query snapshot exists for this finalized date.
    const backfilled = await collectPageQuery(client, property, reportingDate);
    const gapIds = await backfillPageQueryGaps(client, property, reportingDate);
    return {
      property,
      reportingDate,
      snapshotIds: [
        ...historyIds,
        ...(backfilled.created && backfilled.snapshotId ? [backfilled.snapshotId] : []),
        ...gapIds,
      ],
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

  for (const dimensions of [["page"], ["query"], ["device"], ["country"], ["searchAppearance"]]) {
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

  // Non-web surfaces. Each surface is its own Search Console report; a zero row
  // count means Google recorded no activity there, not a collection failure.
  for (const surface of ["image", "video", "news", "discover", "googleNews"]) {
    const response = await query(property, {
      startDate: reportingDate,
      endDate: reportingDate,
      type: surface,
      rowLimit: 1,
    });
    const row = response.rows?.[0];
    snapshotIds.push(
      await persistSnapshot(client, {
        property,
        kind: "dimensional_rows",
        dimensions: ["searchType"],
        searchType: surface,
        aggregationType: "auto",
        responseAggregationType: response.responseAggregationType ?? null,
        rowLimit: 1,
        paginatedRequestCount: 1,
        periodStart: reportingDate,
        periodEnd: reportingDate,
        rows: row ? [row] : [],
        totals: {
          clicks: row?.clicks ?? 0,
          impressions: row?.impressions ?? 0,
          ctr: row && row.impressions > 0 ? row.clicks / row.impressions : null,
          position: row?.position ?? null,
        },
      }),
    );
  }

  const pageQuery = await collectPageQuery(client, property, reportingDate);
  if (pageQuery.created && pageQuery.snapshotId) snapshotIds.push(pageQuery.snapshotId);

  snapshotIds.push(...(await collectWindowRows(client, property, reportingDate)));

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

  snapshotIds.push(...(await collectDailyTotalsHistory(client, property, reportingDate)));
  snapshotIds.push(...(await backfillPageQueryGaps(client, property, reportingDate)));

  const emptyResult = totals.impressions === 0;

  await logActivity(client, {
    verb: "capability.observation_collected",
    subjectKind: "capability",
    summary: emptyResult
      ? `Search Console returned no rows for ${property} on ${reportingDate} (Pacific). Recorded as an empty snapshot.`
      : `Collected Search Console data for ${property} on ${reportingDate} (Pacific).`,
    payload: {
      property,
      reportingDate,
      emptyResult,
      snapshots: snapshotIds.length,
    },
  });

  return { property, reportingDate, snapshotIds, emptyResult };
}
