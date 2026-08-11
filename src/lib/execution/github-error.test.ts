import { afterEach, describe, expect, it, vi } from "vitest";

import { createGithubApi, GITHUB_USER_AGENT } from "./execute.server";
import { describeGithubFailure, GithubStatusError, readGithubResponseSignals } from "./github-error";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("GitHub request headers", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env["GITHUB_EXECUTOR_TOKEN"];
  });

  it("sends an explicit stable User-Agent on every GitHub REST request", async () => {
    process.env["GITHUB_EXECUTOR_TOKEN"] = "test-token";
    const seen: Headers[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response(JSON.stringify({ commit: { sha: "a".repeat(40) } }), { status: 200 });
    }) as unknown as typeof fetch;

    const api = createGithubApi();
    expect(api).not.toBeNull();
    await api?.branchHead("owner/repo", "main");

    expect(seen).toHaveLength(1);
    expect(seen[0]?.get("user-agent")).toBe(GITHUB_USER_AGENT);
    expect(GITHUB_USER_AGENT).toBe("AOOS-Marketing-OS/1.0");
    expect(seen[0]?.get("accept")).toBe("application/vnd.github+json");
    expect(seen[0]?.get("x-github-api-version")).toBe("2022-11-28");
  });

  it("carries only safe headers into the thrown failure, never the body", async () => {
    process.env["GITHUB_EXECUTOR_TOKEN"] = "test-token";
    globalThis.fetch = vi.fn(async () =>
      new Response("secret repository contents", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1786483200" },
      }),
    ) as unknown as typeof fetch;

    const api = createGithubApi();
    const error = await api?.branchHead("owner/repo", "main").catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(GithubStatusError);
    const failure = error as GithubStatusError;
    expect(failure.signals.rateLimitRemaining).toBe(0);
    expect(JSON.stringify(failure)).not.toContain("secret repository contents");
    expect(failure.message).not.toContain("test-token");
  });
});

describe("readGithubResponseSignals", () => {
  it("reads the four safe headers and ignores everything else", () => {
    const signals = readGithubResponseSignals(
      headers({
        "x-ratelimit-remaining": "12",
        "x-ratelimit-reset": "1786483200",
        "retry-after": "60",
        "x-github-sso": "required; organizations=abc",
        authorization: "Bearer secret",
      }),
    );
    expect(signals).toEqual({
      rateLimitRemaining: 12,
      rateLimitReset: 1786483200,
      retryAfter: 60,
      ssoRequired: true,
    });
  });

  it("omits absent or non-numeric headers", () => {
    expect(readGithubResponseSignals(headers({ "x-ratelimit-remaining": "nope" }))).toEqual({});
    expect(readGithubResponseSignals(headers({}))).toEqual({});
  });
});

describe("safe 403 classification", () => {
  const what = "branch main of owner/repo";
  const describe403 = (signals: ConstructorParameters<typeof GithubStatusError>[2]) =>
    describeGithubFailure(new GithubStatusError(403, "/repos/owner/repo/branches/main", signals), what);

  it("names the primary rate limit with a human UTC reset time", () => {
    const message = describe403({ rateLimitRemaining: 0, rateLimitReset: 1786483200 });
    expect(message).toContain("primary rate limit");
    expect(message).toContain("2026-08-11 16:00 UTC");
  });

  it("names the primary rate limit even with no reset header", () => {
    const message = describe403({ rateLimitRemaining: 0 });
    expect(message).toContain("primary rate limit");
    expect(message).toContain("did not report a reset time");
  });

  it("names the secondary rate limit and the retry timing", () => {
    const message = describe403({ rateLimitRemaining: 42, retryAfter: 60 });
    expect(message).toContain("secondary rate limit");
    expect(message).toContain("60 seconds");
  });

  it("names SSO authorization without echoing the header value", () => {
    const message = describe403({ ssoRequired: true });
    expect(message).toContain("SSO authorization is required");
    expect(message).not.toContain("organizations=");
  });

  it("falls back to the scope and access explanation", () => {
    const message = describe403({});
    expect(message).toContain("lacks repository scope or access");
    expect(message).not.toContain("rate limit");
  });

  it("leaves 401 and 404 wording unchanged", () => {
    expect(describeGithubFailure(new GithubStatusError(401, "/x"), what)).toContain("401 Unauthorized");
    expect(describeGithubFailure(new GithubStatusError(404, "/x"), what)).toContain("404 Not Found");
  });
});
