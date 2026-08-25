import type { Ga4CredentialKind } from "../measurement/ga4";
import {
  Ga4ProviderError,
  ga4AccessToken,
  ga4ResponseProvesAuthentication,
} from "../measurement/ga4.server";
import { describeConnectorReadiness, withConnectorDefaults } from "./catalog";
import type { ConnectorProbeResult } from "./probes.server";

type Ga4ProbeResult = ConnectorProbeResult & {
  proof: ConnectorProbeResult["proof"] & { credentialKind?: Exclude<Ga4CredentialKind, null> };
};

// The credential exchange, not the Data API. Google charges nothing for a token
// and it proves the server credential end to end; a runReport would need a
// property this probe has no claim on and would spend GA4 quota on a health
// check.
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type Options = {
  env?: Record<string, string | undefined>;
};

export async function probeGa4(options: Options = {}): Promise<Ga4ProbeResult> {
  const env = withConnectorDefaults(options.env ?? process.env);
  const checkedAt = new Date().toISOString();
  const readiness = describeConnectorReadiness(env).find(
    (item) => item.key === "google_analytics_4",
  )!;
  if (readiness.state === "missing") {
    return {
      key: "google_analytics_4",
      health: "unknown",
      outcome: "missing_configuration",
      checkedAt,
      missing: readiness.missing,
      proof: {},
    };
  }

  try {
    // The kind is on the ledger because it names which of the two configured
    // credentials actually answered.
    const { credentialKind } = await ga4AccessToken(env);
    return {
      key: "google_analytics_4",
      health: "healthy",
      outcome: "success",
      checkedAt,
      missing: [],
      proof: { endpoint: TOKEN_ENDPOINT, credentialKind },
    };
  } catch (error) {
    if (error instanceof Ga4ProviderError) {
      const status = error.httpStatus;
      // A 401 is Google rejecting the credential itself. Anything else it
      // answered means the credential was accepted and the request was refused
      // for another reason, which is a degraded connector rather than a broken
      // credential — the same line the measurement runs record.
      const authenticated = status !== null && ga4ResponseProvesAuthentication(status);
      return {
        key: "google_analytics_4",
        health: authenticated ? "degraded" : "failing",
        outcome: status === null ? "schema_error" : "http_error",
        checkedAt,
        missing: [],
        proof: { ...(status === null ? {} : { statusCode: status }), endpoint: TOKEN_ENDPOINT },
      };
    }
    return {
      key: "google_analytics_4",
      health: "failing",
      outcome: "network_error",
      checkedAt,
      missing: [],
      proof: { endpoint: TOKEN_ENDPOINT },
    };
  }
}
