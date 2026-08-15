import { describe, expect, it } from "vitest";

import {
  GOVERNED_BRANCH,
  GOVERNED_FILE,
  GOVERNED_PROJECT_ID,
  GOVERNED_REPO,
  checkSourceTarget,
} from "./allowlist";
import { GithubStatusError } from "./github-error";
import { parseFieldChanges } from "./source-change";
import type { AttemptRecord, ExecutableRequest, ExecutionStore, GithubApi } from "./execute";
import { runGithubPreflight } from "./preflight";

const changes = parseFieldChanges([
  {
    field: "seo_title",
    label: "SEO title",
    before: "Corporate Relocation | TruMove Inc",
    after: "Employee Relocation Movers | TruMove",
  },
  {
    field: "page_heading",
    label: "Page heading (H1)",
    before: "Corporate Relocation",
    after: "Employee Relocation Moving Services",
  },
]);

const file = `export const services = {
  seoTitle: "Corporate Relocation | TruMove Inc",
  heading: "Corporate Relocation",
};`;

function makeRequest(overrides: Partial<ExecutableRequest> = {}): ExecutableRequest {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    state: "proposed",
    title: "Retitle page",
    targetUrl: "https://trumoveinc.com/services/corporate-relocation",
    repo: GOVERNED_REPO,
    branch: GOVERNED_BRANCH,
    filePath: GOVERNED_FILE,
    projectId: GOVERNED_PROJECT_ID,
    baseRevision: "base-sha",
    changes,
    commitSha: null,
    commitUrl: null,
    publishedProofAt: null,
    ...overrides,
  };
}

function makeStore(request: ExecutableRequest) {
  const attempts: AttemptRecord[] = [];
  const writes: string[] = [];
  const store: ExecutionStore = {
    load: async () => request,
    recordAttempt: async (attempt) => {
      attempts.push(attempt);
    },
    saveCommit: async () => {
      writes.push("saveCommit");
    },
    applyRenderedProof: async () => {
      writes.push("applyRenderedProof");
      return { changed: true };
    },
  };
  return { store, attempts, writes };
}

function makeGithub(options: {
  content?: string;
  head?: string;
  headError?: unknown;
  fileError?: unknown;
}) {
  const commits: unknown[] = [];
  const github: GithubApi = {
    branchHead: async () => {
      if (options.headError) throw options.headError;
      return options.head ?? "base-sha";
    },
    readFile: async () => {
      if (options.fileError) throw options.fileError;
      return { sha: "file-sha", content: options.content ?? file };
    },
    findCommitByMarker: async () => null,
    commitFile: async (input) => {
      commits.push(input);
      return { commitSha: "x", commitUrl: "https://github.com/x/y/commit/x" };
    },
  };
  return { github, commits };
}

describe("checkSourceTarget", () => {
  it("rejects a file outside the single governed file", () => {
    const result = checkSourceTarget({
      repo: GOVERNED_REPO,
      branch: GOVERNED_BRANCH,
      filePath: "src/other.ts",
      projectId: GOVERNED_PROJECT_ID,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a source project outside the governed project", () => {
    const result = checkSourceTarget({
      repo: GOVERNED_REPO,
      branch: GOVERNED_BRANCH,
      filePath: GOVERNED_FILE,
      projectId: "00000000-0000-4000-8000-000000000000",
    });
    expect(result.ok).toBe(false);
  });
});

describe("runGithubPreflight", () => {
  it("proves a readable branch head and unchanged source without writing", async () => {
    const { store, attempts, writes } = makeStore(makeRequest());
    const { github, commits } = makeGithub({});
    const outcome = await runGithubPreflight({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("proved");
    expect(outcome.head).toBe("base-sha");
    expect(commits).toHaveLength(0);
    expect(writes).toHaveLength(0);
    expect(attempts[0]).toMatchObject({ kind: "preflight", status: "proved" });
  });

  it("names a missing executor credential instead of guessing", async () => {
    const { store, attempts } = makeStore(makeRequest());
    const outcome = await runGithubPreflight({
      store,
      github: null,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("Missing credential");
    expect(attempts[0]?.status).toBe("failed");
  });

  it("reports a 401 as a rejected token", async () => {
    const { store } = makeStore(makeRequest());
    const { github } = makeGithub({
      headError: new GithubStatusError(401, "/repos/x/branches/main"),
    });
    const outcome = await runGithubPreflight({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("401");
  });

  it("reports a 403 as a scope or access failure", async () => {
    const { store } = makeStore(makeRequest());
    const { github } = makeGithub({
      headError: new GithubStatusError(403, "/repos/x/branches/main"),
    });
    const outcome = await runGithubPreflight({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("403");
  });

  it("reports a 404 on the governed file", async () => {
    const { store } = makeStore(makeRequest());
    const { github } = makeGithub({ fileError: new GithubStatusError(404, "/repos/x/contents/y") });
    const outcome = await runGithubPreflight({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("404");
  });

  it("fails on branch drift", async () => {
    const { store } = makeStore(makeRequest());
    const { github } = makeGithub({ head: "someone-elses-sha" });
    const outcome = await runGithubPreflight({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("Revision drift");
  });

  it("fails on source-value drift", async () => {
    const { store } = makeStore(makeRequest());
    const { github } = makeGithub({ content: "someone already rewrote this file" });
    const outcome = await runGithubPreflight({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.reason).toContain("Source mismatch");
  });

  it("refuses a request outside the allowlisted file or project", async () => {
    const { store } = makeStore(makeRequest({ filePath: "src/elsewhere.ts" }));
    const { github, commits } = makeGithub({});
    const outcome = await runGithubPreflight({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(commits).toHaveLength(0);
  });
});
