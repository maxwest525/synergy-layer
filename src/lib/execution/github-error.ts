/**
 * Safe response signals for a GitHub failure. These are response HEADER values
 * only. The provider response body is never read into a signal, because it can
 * echo request content or repository contents.
 */
export type GithubResponseSignals = {
  /** x-ratelimit-remaining, when the header was present and numeric. */
  rateLimitRemaining?: number;
  /** x-ratelimit-reset, epoch seconds, when present and numeric. */
  rateLimitReset?: number;
  /** retry-after, seconds, when present and numeric. */
  retryAfter?: number;
  /** True when x-github-sso was present at all. Its value is never surfaced. */
  ssoRequired?: boolean;
};

/** Reads only the safe headers listed above. Never touches the body. */
export function readGithubResponseSignals(headers: Headers): GithubResponseSignals {
  const numeric = (name: string): number | undefined => {
    const raw = headers.get(name);
    if (raw === null) return undefined;
    const value = Number(raw.trim());
    return Number.isFinite(value) ? value : undefined;
  };
  const signals: GithubResponseSignals = {};
  const remaining = numeric("x-ratelimit-remaining");
  if (remaining !== undefined) signals.rateLimitRemaining = remaining;
  const reset = numeric("x-ratelimit-reset");
  if (reset !== undefined) signals.rateLimitReset = reset;
  const retryAfter = numeric("retry-after");
  if (retryAfter !== undefined) signals.retryAfter = retryAfter;
  if (headers.get("x-github-sso") !== null) signals.ssoRequired = true;
  return signals;
}

/**
 * GitHub failures carried as a status code plus safe header signals, never as a
 * provider response body. A response body can echo request content or
 * repository contents, so only the status, the path shape, and the header
 * signals above are ever surfaced or stored.
 */
export class GithubStatusError extends Error {
  readonly status: number;
  readonly path: string;
  readonly signals: GithubResponseSignals;

  constructor(status: number, path: string, signals: GithubResponseSignals = {}) {
    super(`GitHub responded ${status} for ${path}.`);
    this.name = "GithubStatusError";
    this.status = status;
    this.path = path;
    this.signals = signals;
  }
}

/** Human UTC instant, so an operator can read a reset time without conversion. */
function formatUtc(epochSeconds: number): string {
  return `${new Date(epochSeconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Distinguishes the three 403 causes GitHub reports through headers alone:
 * primary rate limit, secondary rate limit, and SSO authorization. Falls back
 * to the scope/access explanation when no header says otherwise.
 */
function describeForbidden(signals: GithubResponseSignals, what: string): string {
  const prefix = `GitHub refused the configured executor token (403 Forbidden) when reading ${what}.`;
  if (signals.rateLimitRemaining === 0) {
    const reset =
      signals.rateLimitReset === undefined
        ? "GitHub did not report a reset time."
        : `The limit resets at ${formatUtc(signals.rateLimitReset)}.`;
    return `${prefix} This is the primary rate limit: the token has no requests remaining. ${reset}`;
  }
  if (signals.retryAfter !== undefined) {
    return `${prefix} This is a secondary rate limit. GitHub asked to retry after ${signals.retryAfter} seconds.`;
  }
  if (signals.ssoRequired) {
    return `${prefix} SSO authorization is required: the token must be authorized for this organization before it can read the repository.`;
  }
  return `${prefix} The token lacks repository scope or access.`;
}

/** Turns a thrown GitHub failure into one safe operator-readable sentence. */
export function describeGithubFailure(error: unknown, what: string): string {
  if (error instanceof GithubStatusError) {
    if (error.status === 401) {
      return `GitHub rejected the configured executor token (401 Unauthorized) when reading ${what}. The token is invalid or expired.`;
    }
    if (error.status === 403) {
      return describeForbidden(error.signals, what);
    }
    if (error.status === 404) {
      return `GitHub returned 404 Not Found for ${what}. Either it does not exist or the configured token cannot see it.`;
    }
    return `GitHub responded ${error.status} when reading ${what}. Nothing was written.`;
  }
  if (error instanceof Error) return `${error.message} Nothing was written.`;
  return `Reading ${what} from GitHub failed for an unknown reason. Nothing was written.`;
}
