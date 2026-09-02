/**
 * Google Ads connection truth and the exact report shape AOOS reads.
 *
 * Unlike GA4, there is no per-tenant property lookup: `GOOGLE_ADS_CUSTOMER_ID`
 * is a single server-side value (AOOS is single-tenant via env vars today,
 * same constraint recorded elsewhere for the other provider integrations).
 * Credential presence is not connection proof, same rule as every other
 * provider here.
 */

export type GoogleAdsCredentialKind = "access_token" | "oauth_refresh_token" | null;

export type GoogleAdsEnvPresence = {
  developerToken: boolean;
  customerId: boolean;
  accessToken: boolean;
  oauthClientId: boolean;
  oauthClientSecret: boolean;
  oauthRefreshToken: boolean;
};

export type GoogleAdsConnectionState = {
  configured: boolean;
  authenticated: boolean;
  connected: boolean;
  credentialKind: GoogleAdsCredentialKind;
  statement: string;
  requirements: string[];
};

/** Reads presence only. No value is ever returned or logged. */
export function readGoogleAdsEnvPresence(
  env: Record<string, string | undefined>,
): GoogleAdsEnvPresence {
  const has = (key: string) => typeof env[key] === "string" && env[key]!.trim().length > 0;
  return {
    developerToken: has("GOOGLE_ADS_DEVELOPER_TOKEN"),
    customerId: has("GOOGLE_ADS_CUSTOMER_ID"),
    accessToken: has("GOOGLE_ADS_ACCESS_TOKEN"),
    oauthClientId: has("GOOGLE_ADS_OAUTH_CLIENT_ID"),
    oauthClientSecret: has("GOOGLE_ADS_OAUTH_CLIENT_SECRET"),
    oauthRefreshToken: has("GOOGLE_ADS_OAUTH_REFRESH_TOKEN"),
  };
}

export function describeGoogleAdsConnection(
  presence: GoogleAdsEnvPresence,
  successfulReport = false,
  authenticationProven = false,
): GoogleAdsConnectionState {
  const oauth = presence.oauthRefreshToken && presence.oauthClientId && presence.oauthClientSecret;
  const credentialKind: GoogleAdsCredentialKind = presence.accessToken
    ? "access_token"
    : oauth
      ? "oauth_refresh_token"
      : null;

  if (!presence.developerToken || !presence.customerId || !credentialKind) {
    const requirements: string[] = [];
    if (!presence.developerToken) requirements.push("GOOGLE_ADS_DEVELOPER_TOKEN is not set.");
    if (!presence.customerId) requirements.push("GOOGLE_ADS_CUSTOMER_ID is not set.");
    if (!credentialKind) {
      if (presence.oauthClientId || presence.oauthClientSecret || presence.oauthRefreshToken) {
        if (!presence.oauthClientId) requirements.push("GOOGLE_ADS_OAUTH_CLIENT_ID is not set.");
        if (!presence.oauthClientSecret)
          requirements.push("GOOGLE_ADS_OAUTH_CLIENT_SECRET is not set.");
        if (!presence.oauthRefreshToken)
          requirements.push("GOOGLE_ADS_OAUTH_REFRESH_TOKEN is not set.");
      } else {
        requirements.push(
          "Either GOOGLE_ADS_ACCESS_TOKEN, or the OAuth trio (GOOGLE_ADS_OAUTH_CLIENT_ID, GOOGLE_ADS_OAUTH_CLIENT_SECRET, GOOGLE_ADS_OAUTH_REFRESH_TOKEN), must be set.",
        );
      }
    }
    return {
      configured: false,
      authenticated: false,
      connected: false,
      credentialKind,
      statement: "No complete server-side Google Ads credential is present.",
      requirements,
    };
  }

  return {
    configured: true,
    authenticated: authenticationProven || successfulReport,
    connected: successfulReport,
    credentialKind,
    statement: successfulReport
      ? "AOOS has completed a Google Ads campaign-performance read."
      : authenticationProven
        ? "Google authentication succeeded, but a campaign report has not succeeded yet."
        : "A complete server credential is configured, but authentication and account access remain unproven until Refresh Google Ads succeeds.",
    requirements: [],
  };
}

/** Google Ads customer ids are often formatted with dashes (123-456-7890); the API wants digits only. */
export function normalizeCustomerId(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * The exact GAQL this integration sends. Every campaign, day by day, for the
 * pooled window. The campaign's budget rides along (PAID-1): spend against
 * nothing is a number without a ceiling, and the operator sets that ceiling in
 * Google Ads, not here.
 */
export function buildGoogleAdsCampaignQuery(): string {
  return [
    "SELECT",
    "  campaign.id,",
    "  campaign.name,",
    "  campaign.status,",
    "  campaign.advertising_channel_type,",
    "  campaign_budget.amount_micros,",
    "  segments.date,",
    "  metrics.impressions,",
    "  metrics.clicks,",
    "  metrics.cost_micros,",
    "  metrics.conversions,",
    "  metrics.conversions_value",
    "FROM campaign",
    "WHERE segments.date DURING LAST_30_DAYS",
    "ORDER BY segments.date DESC",
  ].join("\n");
}

export type GoogleAdsCampaignDayRow = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  advertisingChannelType: string | null;
  /** The campaign's daily budget in micros, or null when the API sent none. Never 0 for absent. */
  budgetMicros: number | null;
  segmentDate: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
};

export type GoogleAdsReport = {
  rowCount: number;
  campaignCount: number;
  totalImpressions: number;
  totalClicks: number;
  totalCostMicros: number;
  totalConversions: number;
  rows: GoogleAdsCampaignDayRow[];
};

function numeric(value: unknown): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalizes one page of `googleAds:search` results into report rows. Never throws on a malformed row; it is skipped. */
export function normalizeGoogleAdsReport(payload: unknown): GoogleAdsReport {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const results = Array.isArray(body["results"]) ? body["results"] : [];

  const rows: GoogleAdsCampaignDayRow[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const result = raw as Record<string, unknown>;
    const campaign =
      result["campaign"] && typeof result["campaign"] === "object"
        ? (result["campaign"] as Record<string, unknown>)
        : {};
    const segments =
      result["segments"] && typeof result["segments"] === "object"
        ? (result["segments"] as Record<string, unknown>)
        : {};
    const metrics =
      result["metrics"] && typeof result["metrics"] === "object"
        ? (result["metrics"] as Record<string, unknown>)
        : {};
    const budget =
      result["campaignBudget"] && typeof result["campaignBudget"] === "object"
        ? (result["campaignBudget"] as Record<string, unknown>)
        : {};
    const budgetRaw = budget["amountMicros"];
    const budgetMicros =
      typeof budgetRaw === "string" || typeof budgetRaw === "number"
        ? Number.isFinite(Number(budgetRaw))
          ? Number(budgetRaw)
          : null
        : null;
    const campaignId = text(campaign["id"]);
    const segmentDate = text(segments["date"]);
    if (!campaignId || !segmentDate) continue;
    rows.push({
      campaignId,
      campaignName: text(campaign["name"]),
      campaignStatus: text(campaign["status"]) || "UNKNOWN",
      advertisingChannelType: text(campaign["advertisingChannelType"]) || null,
      budgetMicros,
      segmentDate,
      impressions: numeric(metrics["impressions"]),
      clicks: numeric(metrics["clicks"]),
      costMicros: numeric(metrics["costMicros"]),
      conversions: numeric(metrics["conversions"]),
      conversionsValue: numeric(metrics["conversionsValue"]),
    });
  }

  return {
    rowCount: rows.length,
    campaignCount: new Set(rows.map((row) => row.campaignId)).size,
    totalImpressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    totalClicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    totalCostMicros: rows.reduce((sum, row) => sum + row.costMicros, 0),
    totalConversions: rows.reduce((sum, row) => sum + row.conversions, 0),
    rows,
  };
}
