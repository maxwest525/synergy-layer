import { describeConnectorReadiness, withConnectorDefaults } from "./catalog";
import type { ConnectorProbeResult } from "./probes.server";

type GoogleAdsProbeResult = ConnectorProbeResult & {
  proof: ConnectorProbeResult["proof"] & { accessibleCustomerCount?: number };
};

type Options = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

async function boundedFetch(url: string, init: RequestInit, options: Options): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    return await (options.fetcher ?? fetch)(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeGoogleAds(options: Options = {}): Promise<GoogleAdsProbeResult> {
  const env = withConnectorDefaults(options.env ?? process.env);
  const checkedAt = new Date().toISOString();
  const readiness = describeConnectorReadiness(env).find((item) => item.key === "google_ads")!;
  if (readiness.state === "missing") {
    return {
      key: "google_ads",
      health: "unknown",
      outcome: "missing_configuration",
      checkedAt,
      missing: readiness.missing,
      proof: {},
    };
  }

  let accessToken = env["GOOGLE_ADS_ACCESS_TOKEN"]?.trim();
  try {
    if (!accessToken) {
      const tokenResponse = await boundedFetch(
        "https://www.googleapis.com/oauth2/v3/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: env["GOOGLE_ADS_OAUTH_CLIENT_ID"]!,
            client_secret: env["GOOGLE_ADS_OAUTH_CLIENT_SECRET"]!,
            refresh_token: env["GOOGLE_ADS_OAUTH_REFRESH_TOKEN"]!,
          }),
        },
        options,
      );
      const tokenPayload = (await tokenResponse.json()) as { access_token?: unknown };
      if (!tokenResponse.ok || typeof tokenPayload.access_token !== "string") {
        return {
          key: "google_ads",
          health: "failing",
          outcome: "http_error",
          checkedAt,
          missing: [],
          proof: {
            statusCode: tokenResponse.status,
            endpoint: "https://www.googleapis.com/oauth2/v3/token",
          },
        };
      }
      accessToken = tokenPayload.access_token;
    }

    const endpoint = "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers";
    const response = await boundedFetch(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": env["GOOGLE_ADS_DEVELOPER_TOKEN"]!,
        },
      },
      options,
    );
    if (!response.ok) {
      return {
        key: "google_ads",
        health: "failing",
        outcome: "http_error",
        checkedAt,
        missing: [],
        proof: { statusCode: response.status, endpoint },
      };
    }
    const payload = (await response.json()) as { resourceNames?: unknown };
    if (
      !Array.isArray(payload.resourceNames) ||
      !payload.resourceNames.every((name): name is string => typeof name === "string")
    ) {
      return {
        key: "google_ads",
        health: "failing",
        outcome: "schema_error",
        checkedAt,
        missing: [],
        proof: { statusCode: response.status, endpoint },
      };
    }
    const resourceNames = payload.resourceNames;
    return {
      key: "google_ads",
      health: "healthy",
      outcome: "success",
      checkedAt,
      missing: [],
      proof: {
        statusCode: response.status,
        endpoint,
        accessibleCustomerCount: resourceNames.length,
      },
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      key: "google_ads",
      health: "failing",
      outcome: timedOut ? "timeout" : "network_error",
      checkedAt,
      missing: [],
      proof: { endpoint: "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers" },
    };
  }
}
