/**
 * Reading real numbers out of Google Ads.
 *
 * The google_ads connector has existed since the estate was first mapped, with
 * a credential probe and nothing behind it. `connections.ts` recorded
 * `table: null` and `findingSources: []` for it, and the systems screen said so
 * out loud: "nothing in this system calls it". A connector that can prove its
 * key and never asks a question is the same failure the Firecrawl base URL had
 * — registered, probed, and read by nothing.
 *
 * Two things this gets right that the probe did not have to:
 *
 * - **`login-customer-id`.** The operator's account is a client under a manager.
 *   `customers:listAccessibleCustomers` does not need the header, which is why
 *   the probe passes without it, but every reporting query against a client
 *   account does. Omitting it returns a permission error that reads like a bad
 *   credential and is not one.
 * - **Micros stay micros.** Google returns cost as an integer number of
 *   millionths. Converting on the way in would make the stored figure a derived
 *   number nobody can trace to the provider; the conversion belongs at the
 *   point of display.
 */

const API_VERSION = "v25";
const DEFAULT_TIMEOUT_MS = 30_000;

type Fetcher = typeof fetch;

export type GoogleAdsCampaignRow = {
  readonly customerId: string;
  readonly segmentDate: string;
  readonly campaignId: string;
  readonly campaignName: string;
  readonly campaignStatus: string;
  readonly advertisingChannelType: string | null;
  readonly impressions: number;
  readonly clicks: number;
  readonly costMicros: number;
  readonly conversions: number;
  readonly conversionsValue: number;
};

export type GoogleAdsReportOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: Fetcher;
  timeoutMs?: number;
  /** How many days back to ask for. The API segments by day either way. */
  days?: number;
};

type Resolved = {
  customerId: string;
  loginCustomerId: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

/** Google is given digits. A pasted id often carries the dashes it displays with. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function resolve(env: Record<string, string | undefined>): Resolved {
  const required = [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_OAUTH_CLIENT_ID",
    "GOOGLE_ADS_OAUTH_CLIENT_SECRET",
    "GOOGLE_ADS_OAUTH_REFRESH_TOKEN",
  ] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Google Ads configuration is missing: ${missing.join(", ")}.`);
  }
  const customerId = digits(env["GOOGLE_ADS_CUSTOMER_ID"]!);
  return {
    customerId,
    // Falling back to the customer's own id is correct for a standalone
    // account: Google accepts the header naming itself and it is a no-op.
    loginCustomerId: digits(env["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]?.trim() || customerId),
    developerToken: env["GOOGLE_ADS_DEVELOPER_TOKEN"]!.trim(),
    clientId: env["GOOGLE_ADS_OAUTH_CLIENT_ID"]!.trim(),
    clientSecret: env["GOOGLE_ADS_OAUTH_CLIENT_SECRET"]!.trim(),
    refreshToken: env["GOOGLE_ADS_OAUTH_REFRESH_TOKEN"]!.trim(),
  };
}

/** Exchange the long-lived refresh token for a short-lived access token. */
async function accessToken(config: Resolved, fetcher: Fetcher): Promise<string> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Google refused the Ads refresh token (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error("Google returned no access token for the Ads refresh token.");
  }
  return payload.access_token;
}

function number(value: unknown): number {
  // Google sends 64-bit fields as strings. Number() on a missing field yields
  // NaN, which would be stored as a real figure, so absence becomes zero here.
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Campaign performance for the last `days` days, one row per campaign per day.
 *
 * `LAST_30_DAYS` and friends are deliberately not used: the caller says how far
 * back it wants, and an explicit window is what makes a re-run reproducible.
 */
export async function fetchCampaignPerformance(
  options: GoogleAdsReportOptions = {},
): Promise<GoogleAdsCampaignRow[]> {
  const env = options.env ?? process.env;
  const config = resolve(env);
  const fetcher = options.fetcher ?? fetch;
  const days = Math.max(1, Math.min(options.days ?? 30, 365));

  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${iso(start)}' AND '${iso(end)}'
    ORDER BY segments.date DESC
  `.trim();

  const token = await accessToken(config, fetcher);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetcher(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${config.customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": config.developerToken,
          // The header this whole module exists to get right.
          "login-customer-id": config.loginCustomerId,
          "Content-Type": "application/json",
        },
        // No pageSize. v25 rejects it on googleAds:search outright —
        // PAGE_SIZE_NOT_SUPPORTED, HTTP 400 — and a mocked test cannot catch
        // that because the mock answers whatever it is sent. Confirmed against
        // the live account on 2026-08-31.
        body: JSON.stringify({ query }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Google Ads timed out.");
    throw new Error("Google Ads could not be reached.", { cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // 403 here is very often the manager header, not the credential — say so,
    // because the obvious reading sends the reader to rotate a working key.
    const hint =
      response.status === 403
        ? " Check GOOGLE_ADS_LOGIN_CUSTOMER_ID: a client account under a manager is refused without it."
        : "";
    throw new Error(`Google Ads returned HTTP ${response.status}.${hint}`);
  }

  const payload = (await response.json()) as {
    results?: {
      segments?: { date?: unknown };
      campaign?: {
        id?: unknown;
        name?: unknown;
        status?: unknown;
        advertisingChannelType?: unknown;
      };
      metrics?: Record<string, unknown>;
    }[];
  };

  return (payload.results ?? []).flatMap((row) => {
    const date = row.segments?.date;
    const id = row.campaign?.id;
    if (typeof date !== "string" || (typeof id !== "string" && typeof id !== "number")) return [];
    return [
      {
        customerId: config.customerId,
        segmentDate: date,
        campaignId: String(id),
        campaignName: typeof row.campaign?.name === "string" ? row.campaign.name : String(id),
        campaignStatus:
          typeof row.campaign?.status === "string" ? row.campaign.status : "UNSPECIFIED",
        advertisingChannelType:
          typeof row.campaign?.advertisingChannelType === "string"
            ? row.campaign.advertisingChannelType
            : null,
        impressions: number(row.metrics?.["impressions"]),
        clicks: number(row.metrics?.["clicks"]),
        costMicros: number(row.metrics?.["costMicros"]),
        conversions: number(row.metrics?.["conversions"]),
        conversionsValue: number(row.metrics?.["conversionsValue"]),
      },
    ];
  });
}

/** Micros to currency, at the point of display and nowhere earlier. */
export function costFromMicros(costMicros: number): number {
  return costMicros / 1_000_000;
}
