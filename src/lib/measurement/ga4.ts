/**
 * GA4 connection truth.
 *
 * AOOS will not call the GA4 Data API until a runtime credential actually exists
 * on the server. The Lovable Google Analytics connector only supplies a browser
 * measurement id, which cannot read reporting data, so its presence is never
 * treated as a connection. Anything short of a real server credential leaves GA4
 * in "Ready to connect" and shows exactly what is missing.
 */

export const GA4_PROPERTY = "properties/536830122";

export type Ga4CredentialKind = "service_account" | "oauth_refresh_token" | null;

export type Ga4ConnectionState = {
  connected: boolean;
  credentialKind: Ga4CredentialKind;
  /** Plain-language statement of what is true right now. */
  statement: string;
  /** Exactly what must be enabled before a real request can be attempted. */
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

export function describeGa4Connection(presence: Ga4EnvPresence): Ga4ConnectionState {
  if (presence.serviceAccountJson) {
    return {
      connected: true,
      credentialKind: "service_account",
      statement: "A server side service account credential is present for the GA4 Data API.",
      requirements: [],
      measurementIdPresent: presence.measurementId,
    };
  }

  if (presence.oauthRefreshToken && presence.oauthClientId && presence.oauthClientSecret) {
    return {
      connected: true,
      credentialKind: "oauth_refresh_token",
      statement: "A server side OAuth refresh credential is present for the GA4 Data API.",
      requirements: [],
      measurementIdPresent: presence.measurementId,
    };
  }

  const requirements: string[] = [];
  if (presence.oauthRefreshToken || presence.oauthClientId || presence.oauthClientSecret) {
    if (!presence.oauthClientId) requirements.push("GA4_OAUTH_CLIENT_ID is not set on the server.");
    if (!presence.oauthClientSecret) requirements.push("GA4_OAUTH_CLIENT_SECRET is not set on the server.");
    if (!presence.oauthRefreshToken) requirements.push("GA4_OAUTH_REFRESH_TOKEN is not set on the server.");
  } else {
    requirements.push(
      "A Google service account JSON with Analytics read access, stored as the server secret GA4_SERVICE_ACCOUNT_JSON.",
    );
    requirements.push(
      `That service account must be granted Viewer access on ${GA4_PROPERTY} in Google Analytics admin.`,
    );
    requirements.push("The Google Analytics Data API must be enabled on the same Google Cloud project.");
  }

  return {
    connected: false,
    credentialKind: null,
    statement: presence.measurementId
      ? "Only a browser measurement id is available. That can send events but cannot read reporting data, so GA4 is not connected for reads."
      : "No server side GA4 credential is present, so AOOS has never made a GA4 request.",
    requirements,
    measurementIdPresent: presence.measurementId,
  };
}

/** Reads presence only. No value is ever returned or logged. */
export function readGa4EnvPresence(env: Record<string, string | undefined>): Ga4EnvPresence {
  const has = (key: string) => typeof env[key] === "string" && env[key]!.trim().length > 0;
  return {
    serviceAccountJson: has("GA4_SERVICE_ACCOUNT_JSON"),
    oauthRefreshToken: has("GA4_OAUTH_REFRESH_TOKEN"),
    oauthClientId: has("GA4_OAUTH_CLIENT_ID"),
    oauthClientSecret: has("GA4_OAUTH_CLIENT_SECRET"),
    measurementId: has("VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"),
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
