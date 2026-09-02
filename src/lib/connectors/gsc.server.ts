import {
  GoogleTokenError,
  googleAccessToken,
} from "../google-token.server";
import {
  SEARCH_CONSOLE_CREDENTIAL_NAMES,
  SEARCH_CONSOLE_SCOPE,
  searchConsoleRoute,
} from "../search-console-transport";
import { describeConnectorReadiness, withConnectorDefaults } from "./catalog";
import type { ConnectorProbeResult } from "./probes.server";

type GscProbeResult = ConnectorProbeResult & {
  proof: ConnectorProbeResult["proof"] & {
    credentialKind?: "service_account" | "oauth_refresh_token";
    route?: "direct" | "lovable_gateway";
  };
};

// The credential exchange, not the Search Console API. A token costs nothing and
// proves the server credential end to end; listing sites or reading performance
// data would need a property this probe has no claim on and would spend quota on
// a health check. Same reasoning as ga4.server.ts.
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type Options = {
  env?: Record<string, string | undefined>;
};

/**
 * Search Console previously sat in `noSafeProbe`, so it reported "degraded" on
 * every check no matter what the credential was doing — a working integration
 * and a dead one were indistinguishable, and the ledger said the same thing
 * either way.
 *
 * That blanket claim was only ever true for one of the three credential routes.
 * The two direct-to-Google routes are exchangeable for a token exactly like GA4,
 * which is a real, free, read-only proof. Only the Lovable gateway route has no
 * probe that would not go through someone else's service, so only that route
 * still reports itself unprovable — and it now says which route it means.
 */
export async function probeSearchConsole(options: Options = {}): Promise<GscProbeResult> {
  const env = withConnectorDefaults(options.env ?? process.env);
  const checkedAt = new Date().toISOString();
  const readiness = describeConnectorReadiness(env).find(
    (item) => item.key === "google_search_console",
  )!;
  if (readiness.state === "missing") {
    return {
      key: "google_search_console",
      health: "unknown",
      outcome: "missing_configuration",
      checkedAt,
      missing: readiness.missing,
      proof: {},
    };
  }

  // The same decision the transport makes, so the probe can never disagree with
  // the route the real calls take.
  const route = searchConsoleRoute(env);

  if (route?.kind !== "direct") {
    return {
      key: "google_search_console",
      health: "degraded",
      outcome: "configured_no_safe_probe",
      checkedAt,
      missing: [],
      proof: { route: "lovable_gateway" },
    };
  }

  try {
    const { credentialKind } = await googleAccessToken({
      env,
      names: SEARCH_CONSOLE_CREDENTIAL_NAMES,
      scope: SEARCH_CONSOLE_SCOPE,
    });
    return {
      key: "google_search_console",
      health: "healthy",
      outcome: "success",
      checkedAt,
      missing: [],
      proof: { endpoint: TOKEN_ENDPOINT, credentialKind, route: "direct" },
    };
  } catch (error) {
    if (error instanceof GoogleTokenError) {
      const status = error.httpStatus;
      // Google rejects a bad service-account assertion or a revoked refresh
      // token with 400 invalid_grant or 401 invalid_client. Those are the
      // credential itself failing. Anything else it answered — 403, 429, 5xx —
      // means the credential was not what was refused, which is degraded rather
      // than broken. Same split ga4.server.ts draws.
      const credentialRejected = status === 400 || status === 401;
      return {
        key: "google_search_console",
        health: credentialRejected ? "failing" : "degraded",
        outcome: status === null ? "network_error" : "http_error",
        checkedAt,
        missing: [],
        proof: {
          ...(status === null ? {} : { statusCode: status }),
          endpoint: TOKEN_ENDPOINT,
          route: "direct",
        },
      };
    }
    return {
      key: "google_search_console",
      health: "failing",
      outcome: "network_error",
      checkedAt,
      missing: [],
      proof: { endpoint: TOKEN_ENDPOINT, route: "direct" },
    };
  }
}
