import { createSign } from "node:crypto";

/**
 * A Google server-to-server access token, from whichever credential is configured.
 *
 * This is the mechanism `measurement/ga4.server.ts` has used since GA4 was wired:
 * a service-account JWT signed with RS256, or an OAuth refresh exchange. It is
 * lifted here so a second Google integration does not have to reimplement it.
 *
 * GA4 deliberately still carries its own copy. Its token path has no test around
 * the signing itself, so switching it to this module could not be verified in the
 * same change that introduced the module. Move it when there is a test to prove
 * the swap, not before.
 */

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type GoogleCredentialKind = "service_account" | "oauth_refresh_token";

export class GoogleTokenError extends Error {
  readonly httpStatus: number | null;

  constructor(message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "GoogleTokenError";
    this.httpStatus = httpStatus;
  }
}

/** Which env var holds each part of a credential, so one helper serves many APIs. */
export type GoogleCredentialNames = {
  readonly serviceAccountJson: string;
  readonly oauthClientId: string;
  readonly oauthClientSecret: string;
  readonly oauthRefreshToken: string;
};

function trimmed(env: Record<string, string | undefined>, name: string): string {
  return env[name]?.trim() ?? "";
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function exchange(
  body: URLSearchParams,
  fetcher: typeof fetch,
  tokenUri: string,
): Promise<string> {
  const response = await fetcher(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  let payload: { access_token?: string } = {};
  try {
    payload = (await response.json()) as { access_token?: string };
  } catch {
    // The status alone is enough to report a failed exchange without echoing a body.
  }
  if (!response.ok || !payload.access_token) {
    throw new GoogleTokenError(
      `Google OAuth token exchange failed [${response.status}].`,
      response.status,
    );
  }
  return payload.access_token;
}

async function serviceAccountToken(
  raw: string,
  scope: string,
  varName: string,
  fetcher: typeof fetch,
): Promise<string> {
  let account: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    account = JSON.parse(raw) as typeof account;
  } catch {
    throw new GoogleTokenError(`${varName} is not valid JSON.`);
  }
  if (!account.client_email || !account.private_key) {
    throw new GoogleTokenError(`${varName} is missing client_email or private_key.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? GOOGLE_TOKEN_ENDPOINT;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;

  return exchange(
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    fetcher,
    tokenUri,
  );
}

/** True when enough of a credential is present to attempt an exchange. */
export function googleCredentialConfigured(
  env: Record<string, string | undefined>,
  names: GoogleCredentialNames,
): boolean {
  if (trimmed(env, names.serviceAccountJson) !== "") return true;
  return (
    trimmed(env, names.oauthClientId) !== "" &&
    trimmed(env, names.oauthClientSecret) !== "" &&
    trimmed(env, names.oauthRefreshToken) !== ""
  );
}

/**
 * The token, and which credential produced it. The kind is reported so a caller
 * can tell the operator which of two configured credentials actually answered
 * rather than leaving them to guess.
 */
export async function googleAccessToken(input: {
  env: Record<string, string | undefined>;
  names: GoogleCredentialNames;
  scope: string;
  fetcher?: typeof fetch;
}): Promise<{ token: string; credentialKind: GoogleCredentialKind }> {
  const { env, names, scope } = input;
  const fetcher = input.fetcher ?? fetch;

  const serviceAccount = trimmed(env, names.serviceAccountJson);
  if (serviceAccount !== "") {
    return {
      token: await serviceAccountToken(serviceAccount, scope, names.serviceAccountJson, fetcher),
      credentialKind: "service_account",
    };
  }

  if (googleCredentialConfigured(env, names)) {
    return {
      token: await exchange(
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: trimmed(env, names.oauthClientId),
          client_secret: trimmed(env, names.oauthClientSecret),
          refresh_token: trimmed(env, names.oauthRefreshToken),
        }),
        fetcher,
        GOOGLE_TOKEN_ENDPOINT,
      ),
      credentialKind: "oauth_refresh_token",
    };
  }

  throw new GoogleTokenError("No complete Google server credential is configured.");
}
