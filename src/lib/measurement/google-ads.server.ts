import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  buildGoogleAdsCampaignQuery,
  normalizeCustomerId,
  normalizeGoogleAdsReport,
  type GoogleAdsCredentialKind,
  type GoogleAdsReport,
} from "./google-ads";

type AdminClient = SupabaseClient<Database>;

const TOKEN_ENDPOINT = "https://www.googleapis.com/oauth2/v3/token";
const API_VERSION = "v25";

export function googleAdsSearchEndpoint(customerId: string): string {
  return `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`;
}

export class GoogleAdsProviderError extends Error {
  readonly httpStatus: number | null;
  readonly authenticationSucceeded: boolean;

  constructor(message: string, httpStatus: number | null = null, authenticationSucceeded = false) {
    super(message);
    this.name = "GoogleAdsProviderError";
    this.httpStatus = httpStatus;
    this.authenticationSucceeded = authenticationSucceeded;
  }
}

/** A 401 means the bearer credential itself was rejected. Any other status proves Google accepted authentication. */
export function googleAdsResponseProvesAuthentication(status: number): boolean {
  return status >= 200 && status < 500 && status !== 401;
}

async function refreshAccessToken(env: Record<string, string | undefined>): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env["GOOGLE_ADS_OAUTH_CLIENT_ID"] ?? "",
      client_secret: env["GOOGLE_ADS_OAUTH_CLIENT_SECRET"] ?? "",
      refresh_token: env["GOOGLE_ADS_OAUTH_REFRESH_TOKEN"] ?? "",
    }),
  });
  let payload: { access_token?: unknown } = {};
  try {
    payload = (await response.json()) as { access_token?: unknown };
  } catch {
    // The status is enough to report a failed token exchange safely.
  }
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new GoogleAdsProviderError(
      `Google OAuth token exchange failed [${response.status}].`,
      response.status,
    );
  }
  return payload.access_token;
}

async function googleAdsAccessToken(env: Record<string, string | undefined>): Promise<{
  token: string;
  credentialKind: Exclude<GoogleAdsCredentialKind, null>;
}> {
  const direct = env["GOOGLE_ADS_ACCESS_TOKEN"]?.trim();
  if (direct) return { token: direct, credentialKind: "access_token" };
  return { token: await refreshAccessToken(env), credentialKind: "oauth_refresh_token" };
}

export async function fetchGoogleAdsCampaignReport(
  customerId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<{
  report: GoogleAdsReport;
  credentialKind: Exclude<GoogleAdsCredentialKind, null>;
  httpStatus: number;
}> {
  const cleanCustomerId = normalizeCustomerId(customerId);
  const auth = await googleAdsAccessToken(env);
  const endpoint = googleAdsSearchEndpoint(cleanCustomerId);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.token}`,
      "developer-token": env["GOOGLE_ADS_DEVELOPER_TOKEN"] ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: buildGoogleAdsCampaignQuery() }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GoogleAdsProviderError(
      `Google Ads API returned unreadable JSON [${response.status}].`,
      response.status,
      googleAdsResponseProvesAuthentication(response.status),
    );
  }
  if (!response.ok) {
    // Never echo the upstream body: Google Ads error payloads can quote back
    // request headers, which would leak the developer token into logs/UI.
    throw new GoogleAdsProviderError(
      `Google Ads API request failed [${response.status}].`,
      response.status,
      googleAdsResponseProvesAuthentication(response.status),
    );
  }
  return {
    report: normalizeGoogleAdsReport(payload),
    credentialKind: auth.credentialKind,
    httpStatus: response.status,
  };
}

export type GoogleAdsRunResult = {
  runId: string;
  status: "succeeded";
  rowCount: number;
  campaignCount: number;
  totalImpressions: number;
  totalClicks: number;
  totalCostMicros: number;
  totalConversions: number;
};

/**
 * One click, one Google Ads report: every campaign, day by day, for the
 * trailing 30-day window. Upserted on (tenant, customer, campaign, day) so a
 * rerun corrects that day's numbers rather than duplicating rows -- Google
 * Ads attributes conversions for several days after the click, so a day's
 * totals can legitimately change on a later read.
 *
 * A `measurement_runs` row is still opened and closed for every attempt, same
 * as every other provider here, even though `google_ads_snapshots` rows do
 * not carry a `run_id` back-reference -- that table is a plain per-day fact
 * table, not a per-run ledger.
 */
export async function runGoogleAdsReport(
  admin: AdminClient,
  input: {
    tenantId: string;
    actorId?: string | null;
    customerId: string;
    env?: Record<string, string | undefined>;
  },
): Promise<GoogleAdsRunResult> {
  const env = input.env ?? process.env;
  const cleanCustomerId = normalizeCustomerId(input.customerId);

  const { data: run, error: runError } = await admin
    .from("measurement_runs")
    .insert({
      tenant_id: input.tenantId,
      provider: "google_ads",
      target: cleanCustomerId,
      strategy: "campaign_performance_30d",
      actor_id: input.actorId ?? null,
      status: "running",
      cost_usd: 0,
    })
    .select("id")
    .single();
  if (runError || !run)
    throw new Error(
      `Could not open a Google Ads measurement run: ${runError?.message ?? "no row"}`,
    );

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
    if (error) throw new Error(`Could not close the Google Ads measurement run: ${error.message}`);
  };

  let authenticationSucceeded = false;
  try {
    const result = await fetchGoogleAdsCampaignReport(cleanCustomerId, env);
    authenticationSucceeded = true;

    if (result.report.rows.length > 0) {
      const { error: upsertError } = await admin.from("google_ads_snapshots").upsert(
        result.report.rows.map((row) => ({
          tenant_id: input.tenantId,
          customer_id: cleanCustomerId,
          campaign_id: row.campaignId,
          campaign_name: row.campaignName,
          campaign_status: row.campaignStatus,
          advertising_channel_type: row.advertisingChannelType,
          segment_date: row.segmentDate,
          impressions: row.impressions,
          clicks: row.clicks,
          cost_micros: row.costMicros,
          conversions: row.conversions,
          conversions_value: row.conversionsValue,
          collected_at: new Date().toISOString(),
        })),
        { onConflict: "tenant_id,customer_id,campaign_id,segment_date" },
      );
      if (upsertError)
        throw new Error(
          `Google Ads responded but the snapshot rows could not be stored: ${upsertError.message}`,
        );
    }

    await finish({
      status: "succeeded",
      http_status: result.httpStatus,
      quota: { authenticationSucceeded: true },
    });
    return {
      runId: run.id,
      status: "succeeded",
      rowCount: result.report.rowCount,
      campaignCount: result.report.campaignCount,
      totalImpressions: result.report.totalImpressions,
      totalClicks: result.report.totalClicks,
      totalCostMicros: result.report.totalCostMicros,
      totalConversions: result.report.totalConversions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus = error instanceof GoogleAdsProviderError ? error.httpStatus : null;
    await finish({
      status: "failed",
      error: message,
      http_status: httpStatus,
      quota: {
        authenticationSucceeded:
          error instanceof GoogleAdsProviderError
            ? error.authenticationSucceeded
            : authenticationSucceeded,
      },
    });
    throw new Error(message);
  }
}
