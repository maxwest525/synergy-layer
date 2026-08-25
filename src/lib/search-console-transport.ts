import type { GoogleCredentialNames } from "./google-token.server";

/**
 * Which Search Console AOOS talks to, and whether Lovable is in the path.
 *
 * Every request this client builds uses Google's own `webmasters/v3` paths. The
 * Lovable connector gateway is a transparent proxy in front of
 * `googleapis.com` -- it changes the base URL and the two auth headers and
 * nothing else. So going direct is a base URL and a bearer token, not a rewrite.
 *
 * Direct wins whenever a Google credential is configured, because the gateway
 * route dies with the Lovable connector: deleting the connector leaves the
 * injected variable alive inside the already-running deployment, so collection
 * keeps working until the next publish and then stops with no change to explain
 * it. That is what happened on 2026-08-24.
 *
 * The gateway stays as the fallback so nothing breaks before a Google credential
 * is placed. Same shape as `firecrawlEndpoint`: the self-owned route first, the
 * vendor-owned one only when the first is unconfigured.
 */

export const GOOGLE_API_ORIGIN = "https://www.googleapis.com";
export const LOVABLE_SEARCH_CONSOLE_GATEWAY =
  "https://connector-gateway.lovable.dev/google_search_console";

/**
 * `webmasters` rather than `webmasters.readonly`: this client submits sitemaps
 * (`PUT .../sitemaps/{feedpath}`), which the read-only scope refuses.
 */
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters";

export const SEARCH_CONSOLE_CREDENTIAL_NAMES: GoogleCredentialNames = {
  serviceAccountJson: "GSC_SERVICE_ACCOUNT_JSON",
  oauthClientId: "GSC_OAUTH_CLIENT_ID",
  oauthClientSecret: "GSC_OAUTH_CLIENT_SECRET",
  oauthRefreshToken: "GSC_OAUTH_REFRESH_TOKEN",
};

export type SearchConsoleRoute =
  | { readonly kind: "direct"; readonly origin: string }
  | {
      readonly kind: "lovable_gateway";
      readonly origin: string;
      readonly lovableApiKey: string;
      readonly connectionApiKey: string;
    };

function trimmed(env: Record<string, string | undefined>, name: string): string {
  return env[name]?.trim() ?? "";
}

function directConfigured(env: Record<string, string | undefined>): boolean {
  if (trimmed(env, SEARCH_CONSOLE_CREDENTIAL_NAMES.serviceAccountJson) !== "") return true;
  return (
    trimmed(env, SEARCH_CONSOLE_CREDENTIAL_NAMES.oauthClientId) !== "" &&
    trimmed(env, SEARCH_CONSOLE_CREDENTIAL_NAMES.oauthClientSecret) !== "" &&
    trimmed(env, SEARCH_CONSOLE_CREDENTIAL_NAMES.oauthRefreshToken) !== ""
  );
}

/** The route to use, or null when neither credential set is present. */
export function searchConsoleRoute(
  env: Record<string, string | undefined>,
): SearchConsoleRoute | null {
  if (directConfigured(env)) {
    return { kind: "direct", origin: GOOGLE_API_ORIGIN };
  }

  const lovableApiKey = trimmed(env, "LOVABLE_API_KEY");
  const connectionApiKey = trimmed(env, "GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (lovableApiKey !== "" && connectionApiKey !== "") {
    return {
      kind: "lovable_gateway",
      origin: LOVABLE_SEARCH_CONSOLE_GATEWAY,
      lovableApiKey,
      connectionApiKey,
    };
  }

  return null;
}
