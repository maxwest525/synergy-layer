/** GA4 connection truth. Credential presence is not connection proof. */

export const GA4_PROPERTY = "properties/536830122";

export type Ga4CredentialKind =
  | "service_account"
  | "oauth_refresh_token"
  | null;

export type Ga4ConnectionState = {
  configured: boolean;
  connected: boolean;
  credentialKind: Ga4CredentialKind;
  statement: string;
  requirements: string[];
  measurementIdPresent: boolean;
};

export type Ga4EnvPresence = {
  serviceAccountJson: boolean;
  oauthRefreshToken: boolean;
  oauthClientId: boolean;
  oauthClientSecret: boolean;
  measurementId: boolean;
};

export function describeGa4Connection(
  presence: Ga4EnvPresence,
  successfulSnapshot = false,
): Ga4ConnectionState {
  const serviceAccount = presence.serviceAccountJson;
  const oauth =
    presence.oauthRefreshToken &&
    presence.oauthClientId &&
    presence.oauthClientSecret;
  const credentialKind: Ga4CredentialKind = serviceAccount
    ? "service_account"
    : oauth
      ? "oauth_refresh_token"
      : null;

  if (credentialKind) {
    return {
      configured: true,
      connected: successfulSnapshot,
      credentialKind,
      statement: successfulSnapshot
        ? `AOOS has completed a GA4 Data API read for ${GA4_PROPERTY}.`
        : "A complete server credential is configured, but connection remains unproven until the first successful refresh.",
      requirements: [],
      measurementIdPresent: presence.measurementId,
    };
  }

  const requirements: string[] = [];
  if (
    presence.oauthRefreshToken ||
    presence.oauthClientId ||
    presence.oauthClientSecret
  ) {
    if (!presence.oauthClientId)
      requirements.push("GA4_OAUTH_CLIENT_ID is not set on the server.");
    if (!presence.oauthClientSecret)
      requirements.push("GA4_OAUTH_CLIENT_SECRET is not set on the server.");
    if (!presence.oauthRefreshToken)
      requirements.push("GA4_OAUTH_REFRESH_TOKEN is not set on the server.");
  } else {
    requirements.push(
      "A Google service account JSON with Analytics read access, stored as the server secret GA4_SERVICE_ACCOUNT_JSON.",
    );
    requirements.push(
      `That service account must have Viewer access on ${GA4_PROPERTY}.`,
    );
    requirements.push(
      "The Google Analytics Data API must be enabled on the same Google Cloud project.",
    );
  }

  return {
    configured: false,
    connected: false,
    credentialKind: null,
    statement: presence.measurementId
      ? "Only a browser measurement id is available. It can send events but cannot authorize reporting reads."
      : "No server-side GA4 credential is present, so AOOS cannot make a reporting request.",
    requirements,
    measurementIdPresent: presence.measurementId,
  };
}

/** Reads presence only. No value is ever returned or logged. */
export function readGa4EnvPresence(
  env: Record<string, string | undefined>,
): Ga4EnvPresence {
  const has = (key: string) =>
    typeof env[key] === "string" && env[key]!.trim().length > 0;
  return {
    serviceAccountJson: has("GA4_SERVICE_ACCOUNT_JSON"),
    oauthRefreshToken: has("GA4_OAUTH_REFRESH_TOKEN"),
    oauthClientId: has("GA4_OAUTH_CLIENT_ID"),
    oauthClientSecret: has("GA4_OAUTH_CLIENT_SECRET"),
    measurementId:
      has("VITE_GA4_MEASUREMENT_ID") ||
      has("VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"),
  };
}

/** 28 complete days ending yesterday, in UTC. */
export function ga4Window(today: Date): { startDate: string; endDate: string } {
  const end = new Date(today.getTime());
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - 27);
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}