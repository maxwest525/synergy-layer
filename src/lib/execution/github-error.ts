/**
 * GitHub failures carried as a status code, never as a provider response body.
 * A response body can echo request content or repository contents, so only the
 * status and the path shape are ever surfaced or stored.
 */
export class GithubStatusError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string) {
    super(`GitHub responded ${status} for ${path}.`);
    this.name = "GithubStatusError";
    this.status = status;
    this.path = path;
  }
}

/** Turns a thrown GitHub failure into one safe operator-readable sentence. */
export function describeGithubFailure(error: unknown, what: string): string {
  if (error instanceof GithubStatusError) {
    if (error.status === 401) {
      return `GitHub rejected the configured executor token (401 Unauthorized) when reading ${what}. The token is invalid or expired.`;
    }
    if (error.status === 403) {
      return `GitHub refused the configured executor token (403 Forbidden) when reading ${what}. The token lacks repository scope or access, or is rate limited.`;
    }
    if (error.status === 404) {
      return `GitHub returned 404 Not Found for ${what}. Either it does not exist or the configured token cannot see it.`;
    }
    return `GitHub responded ${error.status} when reading ${what}. Nothing was written.`;
  }
  if (error instanceof Error) return `${error.message} Nothing was written.`;
  return `Reading ${what} from GitHub failed for an unknown reason. Nothing was written.`;
}
