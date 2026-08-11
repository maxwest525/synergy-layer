import { describe, expect, it } from "vitest";

import { GOVERNED_BRANCH, GOVERNED_FILE, GOVERNED_PROJECT_ID, GOVERNED_REPO } from "./allowlist";
import { applyExactReplacements, parseFieldChanges, verifyRenderedPage } from "./source-change";
import {
  checkPublishedPage,
  executeSourceChange,
  type AttemptRecord,
  type ExecutableRequest,
  type ExecutionStore,
  type GithubApi,
  type RenderedVerifier,
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
    applyRenderedProof: async (input) => {
      saved.push({ kind: "applied", id: input.id, notes: input.notes, revision: input.revision });
      return { changed: true };
    },
  };
  return { store, attempts, saved };
}

function makeGithub(
  content: string,
  options: { head?: string; markerHit?: { commitSha: string; commitUrl: string } | null } = {},
) {
  const writes: unknown[] = [];
  const github: GithubApi = {
    branchHead: async () => options.head ?? "base-sha",
    readFile: async () => ({ sha: "file-sha", content }),
    findCommitByMarker: async () => options.markerHit ?? null,
    commitFile: async (input) => {
      writes.push(input);
      return { commitSha: "new-sha", commitUrl: "https://github.com/acme/site/commit/new-sha" };
    },
  };
  return { github, writes };
}

function makeRenderer(page: { title: string | null; heading: string | null; finalUrl?: string }): RenderedVerifier {
  return {
    name: "TestRenderer",
    render: async (url) => ({
      finalUrl: page.finalUrl ?? url,
      title: page.title,
      heading: page.heading,
      renderedBy: "TestRenderer",
    }),
  };
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

  it("refuses when the branch head no longer matches the observed base revision", async () => {
    const { store, attempts } = makeStore(makeRequest());
    const { github, writes } = makeGithub(file, { head: "someone-elses-sha" });
    const outcome = await executeSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("branch head");
    expect(writes).toHaveLength(0);
    expect(attempts[0]?.status).toBe("refused");
  });

  it("refuses a repository or branch outside the allowlist", async () => {
    const { store } = makeStore(makeRequest({ repo: "someone/else", branch: "main" }));
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

  it("reconciles an unrecorded commit instead of writing a second time", async () => {
    const { store, attempts, saved } = makeStore(makeRequest());
    const { github, writes } = makeGithub(file, {
      head: "advanced-sha",
      markerHit: { commitSha: "found-sha", commitUrl: "https://github.com/x/y/commit/found-sha" },
    });
    const outcome = await executeSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("reconciled");
    expect(writes).toHaveLength(0);
    expect(saved[0]).toMatchObject({ kind: "commit", commitSha: "found-sha" });
    expect(attempts[0]?.status).toBe("reconciled");
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

describe("verifyRenderedPage", () => {
  it("only passes on an exact match of both values", () => {
    const page = {
      finalUrl: "https://trumoveinc.com/services/corporate-relocation",
      title: "Employee Relocation Movers | TruMove",
      heading: "Employee Relocation Moving Services",
      renderedBy: "TestRenderer",
    };
    expect(verifyRenderedPage(page, changes).ok).toBe(true);
    expect(verifyRenderedPage({ ...page, title: "Old" }, changes).ok).toBe(false);
  });

  it("treats an unrendered shell as unproven, not as a failure of the change", () => {
    const proof = verifyRenderedPage(
      {
        finalUrl: "https://trumoveinc.com/services/corporate-relocation",
        title: "TruMove, AI-Powered Moving Made Simple",
        heading: null,
        renderedBy: "TestRenderer",
      },
      changes,
    );
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("application shell");
  });
});

describe("checkPublishedPage", () => {
  it("marks applied through one atomic routine when the rendered page proves the change", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      renderer: makeRenderer({
        title: "Employee Relocation Movers | TruMove",
        heading: "Employee Relocation Moving Services",
      }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("verified");
    expect(saved.map((row) => row["kind"])).toEqual(["applied"]);
  });

  it("stays pending and does not mark applied when the page is unchanged", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      renderer: makeRenderer({ title: "Old", heading: "Old" }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("pending");
    expect(saved).toHaveLength(0);
  });

  it("refuses when no rendered verifier is connected", async () => {
    const { store } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      renderer: null,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("FIRECRAWL_API_KEY");
  });

  it("refuses a target URL outside the allowlisted site", async () => {
    const { store } = makeStore(
      makeRequest({ commitSha: "new-sha", targetUrl: "https://example.com/page" }),
    );
    const outcome = await checkPublishedPage({
      store,
      renderer: makeRenderer({ title: "x", heading: "y" }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
  });

  it("fails when the rendered page redirects off the allowlisted site", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      renderer: makeRenderer({
        title: "Employee Relocation Movers | TruMove",
        heading: "Employee Relocation Moving Services",
        finalUrl: "https://elsewhere.example/page",
      }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(saved).toHaveLength(0);
  });

  it("refuses a publish check when no commit exists", async () => {
    const { store } = makeStore(makeRequest());
    const outcome = await checkPublishedPage({
      store,
      renderer: makeRenderer({ title: "x", heading: "y" }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
  });
});
