import { describe, expect, it } from "vitest";

import {
  applyExactReplacements,
  parseFieldChanges,
  verifyPublishedHtml,
} from "./source-change";
import {
  checkPublishedPage,
  executeSourceChange,
  type AttemptRecord,
  type ExecutableRequest,
  type ExecutionStore,
  type GithubApi,
} from "./execute";

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
    state: "approved",
    title: "Retitle page",
    targetUrl: "https://example.com/page",
    repo: "acme/site",
    branch: "main",
    filePath: "src/data.ts",
    baseRevision: "base-sha",
    changes,
    commitSha: null,
    commitUrl: null,
    publishedProofAt: null,
    ...overrides,
  };
}

function makeStore(request: ExecutableRequest | null) {
  const attempts: AttemptRecord[] = [];
  const saved: Record<string, unknown>[] = [];
  const store: ExecutionStore = {
    load: async () => request,
    recordAttempt: async (attempt) => {
      attempts.push(attempt);
    },
    saveCommit: async (input) => {
      saved.push({ kind: "commit", ...input });
    },
    savePublishedProof: async (input) => {
      saved.push({ kind: "proof", ...input });
    },
    markApplied: async (input) => {
      saved.push({ kind: "applied", ...input });
    },
  };
  return { store, attempts, saved };
}

function makeGithub(content: string) {
  const writes: unknown[] = [];
  const github: GithubApi = {
    branchHead: async () => "base-sha",
    readFile: async () => ({ sha: "file-sha", content }),
    commitFile: async (input) => {
      writes.push(input);
      return { commitSha: "new-sha", commitUrl: "https://github.com/acme/site/commit/new-sha" };
    },
  };
  return { github, writes };
}

describe("applyExactReplacements", () => {
  it("applies both approved values exactly once", () => {
    const result = applyExactReplacements(file, changes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain("Employee Relocation Movers | TruMove");
      expect(result.value.content).toContain("Employee Relocation Moving Services");
    }
  });

  it("refuses when a before value is missing", () => {
    const result = applyExactReplacements("nothing familiar here", changes);
    expect(result.ok).toBe(false);
  });
});

describe("executeSourceChange", () => {
  it("commits once for an approved request", async () => {
    const { store, attempts, saved } = makeStore(makeRequest());
    const { github, writes } = makeGithub(file);
    const outcome = await executeSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("committed");
    expect(writes).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: "commit", commitSha: "new-sha" });
    expect(attempts[0]?.status).toBe("committed");
  });

  it("refuses and writes nothing when the source has drifted", async () => {
    const { store, attempts } = makeStore(makeRequest());
    const { github, writes } = makeGithub("someone already rewrote this file");
    const outcome = await executeSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
    expect(writes).toHaveLength(0);
    expect(attempts[0]?.status).toBe("refused");
  });

  it("refuses a request that is not approved", async () => {
    const { store } = makeStore(makeRequest({ state: "proposed" }));
    const { github, writes } = makeGithub(file);
    const outcome = await executeSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
    expect(writes).toHaveLength(0);
  });

  it("names the missing executor credential instead of guessing", async () => {
    const { store } = makeStore(makeRequest());
    const outcome = await executeSourceChange({
      store,
      github: null,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("Executor credential missing");
  });

  it("replays instead of creating a second commit", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha", state: "applied" }));
    const { github, writes } = makeGithub(file);
    const outcome = await executeSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("replayed");
    expect(writes).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });
});

describe("verifyPublishedHtml", () => {
  it("only passes on an exact match of both values", () => {
    const html =
      "<html><head><title>Employee Relocation Movers | TruMove</title></head><body><h1>Employee Relocation Moving Services</h1></body></html>";
    expect(verifyPublishedHtml(html, changes).ok).toBe(true);
    expect(verifyPublishedHtml("<title>Old</title><h1>Old</h1>", changes).ok).toBe(false);
  });
});

describe("checkPublishedPage", () => {
  it("marks applied only when the live page proves the change", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      fetchPage: async () => ({
        status: 200,
        html: "<title>Employee Relocation Movers | TruMove</title><h1>Employee Relocation Moving Services</h1>",
      }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("verified");
    expect(saved.map((row) => row["kind"])).toEqual(["proof", "applied"]);
  });

  it("stays pending and does not mark applied when the page is unchanged", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      fetchPage: async () => ({ status: 200, html: "<title>Old</title><h1>Old</h1>" }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("pending");
    expect(saved).toHaveLength(0);
  });

  it("refuses a publish check when no commit exists", async () => {
    const { store } = makeStore(makeRequest());
    const outcome = await checkPublishedPage({
      store,
      fetchPage: async () => ({ status: 200, html: "" }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
  });
});
