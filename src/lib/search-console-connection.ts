export type SearchConsoleCredentialPresence = {
  lovableApiKey: boolean;
  connectionApiKey: boolean;
  /** A direct Google credential, which does not involve Lovable at all. */
  googleDirect: boolean;
};

export type SearchConsoleConnectionFacts = {
  configured: boolean;
  authenticated: boolean;
  readSucceeded: boolean;
  authenticatedAt: string | null;
  readSucceededAt: string | null;
  lastAttemptState: string | null;
  lastAttemptAt: string | null;
  lastAttemptError: string | null;
};

/** Reads presence only; no credential value is returned or logged. */
export function readSearchConsoleCredentialPresence(
  env: Record<string, string | undefined>,
): SearchConsoleCredentialPresence {
  const has = (key: string) => typeof env[key] === "string" && env[key]!.trim().length > 0;
  return {
    lovableApiKey: has("LOVABLE_API_KEY"),
    connectionApiKey: has("GOOGLE_SEARCH_CONSOLE_API_KEY"),
    googleDirect:
      has("GSC_SERVICE_ACCOUNT_JSON") ||
      (has("GSC_OAUTH_CLIENT_ID") &&
        has("GSC_OAUTH_CLIENT_SECRET") &&
        has("GSC_OAUTH_REFRESH_TOKEN")),
  };
}

export function describeSearchConsoleConnection(input: {
  presence: SearchConsoleCredentialPresence;
  authenticatedAt: string | null;
  readSucceededAt: string | null;
  lastAttemptState?: string | null;
  lastAttemptAt?: string | null;
  lastAttemptError?: string | null;
}): SearchConsoleConnectionFacts {
  return {
    // Either route counts as configured. Reporting only the Lovable pair would
    // tell an operator running direct that Search Console is unconfigured while
    // it is collecting.
    configured:
      input.presence.googleDirect ||
      (input.presence.lovableApiKey && input.presence.connectionApiKey),
    authenticated: Boolean(input.authenticatedAt),
    readSucceeded: Boolean(input.readSucceededAt),
    authenticatedAt: input.authenticatedAt,
    readSucceededAt: input.readSucceededAt,
    lastAttemptState: input.lastAttemptState ?? null,
    lastAttemptAt: input.lastAttemptAt ?? null,
    lastAttemptError: input.lastAttemptError ?? null,
  };
}
