import { describe, expect, it } from "vitest";

import {
  describeSearchConsoleConnection,
  readSearchConsoleCredentialPresence,
} from "./search-console-connection";
import {
  GOOGLE_API_ORIGIN,
  LOVABLE_SEARCH_CONSOLE_GATEWAY,
  SEARCH_CONSOLE_SCOPE,
  searchConsoleRoute,
} from "./search-console-transport";

const lovablePair = {
  LOVABLE_API_KEY: "lovable",
  GOOGLE_SEARCH_CONSOLE_API_KEY: "connection",
};

describe("which Search Console AOOS talks to", () => {
  it("goes direct to Google on a service account, even when the gateway is also configured", () => {
    expect(
      searchConsoleRoute({ ...lovablePair, GSC_SERVICE_ACCOUNT_JSON: '{"client_email":"a"}' }),
    ).toEqual({ kind: "direct", origin: GOOGLE_API_ORIGIN });
  });

  it("goes direct on a complete OAuth refresh credential", () => {
    expect(
      searchConsoleRoute({
        ...lovablePair,
        GSC_OAUTH_CLIENT_ID: "id",
        GSC_OAUTH_CLIENT_SECRET: "secret",
        GSC_OAUTH_REFRESH_TOKEN: "refresh",
      }),
    ).toEqual({ kind: "direct", origin: GOOGLE_API_ORIGIN });
  });

  it("falls back to the Lovable gateway when no Google credential is set", () => {
    expect(searchConsoleRoute(lovablePair)).toEqual({
      kind: "lovable_gateway",
      origin: LOVABLE_SEARCH_CONSOLE_GATEWAY,
      lovableApiKey: "lovable",
      connectionApiKey: "connection",
    });
  });

  it("treats a half-configured direct credential as absent rather than failing the read", () => {
    expect(searchConsoleRoute({ ...lovablePair, GSC_OAUTH_CLIENT_ID: "id" })?.kind).toBe(
      "lovable_gateway",
    );
  });

  it("ignores whitespace-only values, which a cleared secret leaves behind", () => {
    expect(searchConsoleRoute({ ...lovablePair, GSC_SERVICE_ACCOUNT_JSON: "   " })?.kind).toBe(
      "lovable_gateway",
    );
  });

  it("returns null when neither route is configured", () => {
    expect(searchConsoleRoute({})).toBeNull();
  });

  it("requests the writable scope, because this client submits sitemaps", () => {
    expect(SEARCH_CONSOLE_SCOPE).toBe("https://www.googleapis.com/auth/webmasters");
  });
});

describe("what the operator is told about the connection", () => {
  const facts = (env: Record<string, string | undefined>) =>
    describeSearchConsoleConnection({
      presence: readSearchConsoleCredentialPresence(env),
      authenticatedAt: null,
      readSucceededAt: null,
    });

  it("reports configured on a direct Google credential alone", () => {
    expect(facts({ GSC_SERVICE_ACCOUNT_JSON: '{"client_email":"a"}' }).configured).toBe(true);
  });

  it("still reports configured on the Lovable pair alone", () => {
    expect(facts(lovablePair).configured).toBe(true);
  });

  it("reports unconfigured when only half of either credential is present", () => {
    expect(facts({ LOVABLE_API_KEY: "lovable" }).configured).toBe(false);
    expect(facts({ GSC_OAUTH_CLIENT_ID: "id" }).configured).toBe(false);
  });
});
