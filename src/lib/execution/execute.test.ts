import { describe, expect, it } from "vitest";

import { GOVERNED_BRANCH, GOVERNED_FILE, GOVERNED_PROJECT_ID, GOVERNED_REPO } from "./allowlist";
import {
  applyExactReplacements,
  extractMetaDescription,
  normalizeTextFile,
  parseFieldChanges,
  verifyPublishedRobots,
  verifyRenderedPage,
} from "./source-change";
import {
  checkPublishedPage,
  executeSourceChange,
  revertSourceChange,
  type AttemptRecord,
  type ExecutableRequest,
  type ExecutionStore,
  type GithubApi,
  type RenderedVerifier,
  type RobotsProver,
} from "./execute";
import {
  buildRenderedScrapeRequest,
  captureMeasurementFollowupWarning,
  createDirectFetchVerifier,
  createRenderedVerifier,
} from "./execute.server";

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

function makeStore(
  request: ExecutableRequest | null,
  options: { proofResult?: { changed: boolean; warning?: string } } = {},
) {
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
      return options.proofResult ?? { changed: true };
    },
  };
  return { store, attempts, saved };
}

function makeGithub(
  content: string,
  options: {
    head?: string;
    markerHit?: { commitSha: string; commitUrl: string } | null;
    writeError?: string;
  } = {},
) {
  const writes: unknown[] = [];
  const github: GithubApi = {
    branchHead: async () => options.head ?? "base-sha",
    readFile: async () => ({ sha: "file-sha", content }),
    findCommitByMarker: async () => options.markerHit ?? null,
    commitFile: async (input) => {
      writes.push(input);
      if (options.writeError) throw new Error(options.writeError);
      return { commitSha: "new-sha", commitUrl: "https://github.com/acme/site/commit/new-sha" };
    },
  };
  return { github, writes };
}

function makeRenderer(page: {
  title: string | null;
  heading: string | null;
  metaDescription?: string | null;
  finalUrl?: string;
}): RenderedVerifier {
  return {
    name: "TestRenderer",
    render: async (url) => ({
      finalUrl: page.finalUrl ?? url,
      title: page.title,
      heading: page.heading,
      metaDescription: page.metaDescription ?? null,
      subheadings: [],
      renderedBy: "TestRenderer",
    }),
  };
}

const metaChanges = parseFieldChanges([
  {
    field: "meta_description",
    label: "Meta description",
    before: "Old corporate relocation description.",
    after: "Employee relocation movers with dedicated coordinators and guaranteed dates.",
  },
]);

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

const appliedFile = `export const services = {
  seoTitle: "Employee Relocation Movers | TruMove",
  heading: "Employee Relocation Moving Services",
};`;

describe("revertSourceChange", () => {
  it("commits the recorded before values back", async () => {
    const { store, attempts } = makeStore(makeRequest({ commitSha: "live-sha", state: "applied" }));
    const { github, writes } = makeGithub(appliedFile, { head: "live-sha" });
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("reverted");
    expect(outcome.commitSha).toBe("new-sha");
    expect(writes).toHaveLength(1);
    const write = writes[0] as { content: string; message: string };
    expect(write.content).toBe(file);
    expect(write.message).toContain("AOOS-revert-of-change-request:");
    expect(attempts[0]).toMatchObject({
      kind: "source_revert",
      status: "reverted",
      commitSha: "new-sha",
    });
  });

  it("refuses without writing when the branch head has moved past the commit it undoes", async () => {
    const { store, attempts } = makeStore(makeRequest({ commitSha: "live-sha", state: "applied" }));
    const { github, writes } = makeGithub(appliedFile, { head: "someone-elses-sha" });
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("branch head");
    expect(writes).toHaveLength(0);
    expect(attempts[0]).toMatchObject({ kind: "source_revert", status: "refused" });
  });

  it("refuses without writing when the file no longer holds the values it committed", async () => {
    const { store } = makeStore(makeRequest({ commitSha: "live-sha", state: "applied" }));
    const { github, writes } = makeGithub("someone already rewrote this file", {
      head: "live-sha",
    });
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("refused");
    expect(writes).toHaveLength(0);
  });

  it("refuses a second revert instead of re-committing the before values", async () => {
    const { store } = makeStore(
      makeRequest({
        commitSha: "live-sha",
        state: "applied",
        changes: metaChanges,
        filePath: "src/components/seo/SeoHead.tsx",
      }),
    );
    const { github, writes } = makeGithub('description: "Old corporate relocation description.",', {
      head: "live-sha",
    });
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("already holds the values");
    expect(writes).toHaveLength(0);
  });

  it("refuses when no source commit was ever recorded", async () => {
    const { store } = makeStore(makeRequest({ state: "applied" }));
    const { github, writes } = makeGithub(appliedFile);
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("nothing to revert");
    expect(writes).toHaveLength(0);
  });

  it("refuses a change request in a state the roll_back transition would not accept", async () => {
    const { store, attempts } = makeStore(makeRequest({ commitSha: "live-sha" }));
    const { github, writes } = makeGithub(appliedFile, { head: "live-sha" });
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("only an applied or verified change request");
    expect(writes).toHaveLength(0);
    expect(attempts[0]).toMatchObject({ kind: "source_revert", status: "refused" });
  });

  it("records a revert commit already in the branch instead of refusing on head drift", async () => {
    const { store, attempts } = makeStore(makeRequest({ commitSha: "live-sha", state: "applied" }));
    const { github, writes } = makeGithub(file, {
      head: "revert-sha",
      markerHit: {
        commitSha: "revert-sha",
        commitUrl: "https://github.com/acme/site/commit/revert-sha",
      },
    });
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("reconciled");
    expect(outcome.commitSha).toBe("revert-sha");
    expect(writes).toHaveLength(0);
    expect(attempts[0]).toMatchObject({
      kind: "source_revert",
      status: "reconciled",
      commitSha: "revert-sha",
    });
  });

  it("does not claim no revert commit exists when the write itself failed", async () => {
    const { store, attempts } = makeStore(makeRequest({ commitSha: "live-sha", state: "applied" }));
    const { github } = makeGithub(appliedFile, {
      head: "live-sha",
      writeError: "502 Bad Gateway",
    });
    const outcome = await revertSourceChange({
      store,
      github,
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.message).not.toContain("No revert commit was created");
    expect(outcome.message).toContain("did not complete cleanly");
    expect(outcome.message).toContain("502 Bad Gateway");
    expect(attempts[0]).toMatchObject({ kind: "source_revert", status: "failed" });
  });
});

describe("buildRenderedScrapeRequest", () => {
  it("forces a fresh Firecrawl render for publish proof", () => {
    expect(
      buildRenderedScrapeRequest("https://trumoveinc.com/services/corporate-relocation"),
    ).toEqual({
      url: "https://trumoveinc.com/services/corporate-relocation",
      formats: ["rawHtml", "markdown"],
      onlyMainContent: false,
      waitFor: 3000,
      maxAge: 0,
    });
  });
});

describe("createRenderedVerifier", () => {
  const bothRenderers = {
    VPS_SCRAPER_BASE_URL: "https://crawl.example",
    VPS_SCRAPER_API_KEY: "vps-secret",
    SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example",
    SELFHOSTED_FIRECRAWL_API_KEY: "fire-secret",
  };
  const pageHtml =
    "<html><head><title>Employee Relocation Movers | TruMove</title>" +
    '<meta name="description" content="Movers you trust."></head>' +
    "<body><h1>Employee relocation, moved by TruMove</h1></body></html>";
  const firecrawlSuccess = {
    status: 200,
    text: JSON.stringify({
      success: true,
      data: {
        rawHtml: pageHtml,
        markdown: "",
        metadata: { sourceURL: "https://trumoveinc.com/services/corporate-relocation" },
      },
    }),
    headers: new Headers(),
    finalUrl: "https://fire.example/v2/scrape",
  };

  it("renders through Crawl4AI first and never touches Firecrawl when the box answers", async () => {
    const firecrawlCalls: string[] = [];
    const verifier = createRenderedVerifier(bothRenderers, {
      scrapeCrawl4ai: async () => ({
        html: pageHtml,
        markdown: "",
        finalUrl: "https://trumoveinc.com/services/corporate-relocation",
      }),
      fetchRendered: async (url) => {
        firecrawlCalls.push(url);
        return firecrawlSuccess;
      },
    });
    const page = await verifier!.render("https://trumoveinc.com/services/corporate-relocation");
    expect(page.renderedBy).toBe("Crawl4AI");
    expect(page.title).toBe("Employee Relocation Movers | TruMove");
    expect(page.heading).toBe("Employee relocation, moved by TruMove");
    expect(page.metaDescription).toBe("Movers you trust.");
    expect(firecrawlCalls).toEqual([]);
  });

  it("falls back to Firecrawl when Crawl4AI fails, and the stored provenance says so", async () => {
    const firecrawlCalls: string[] = [];
    const verifier = createRenderedVerifier(bothRenderers, {
      scrapeCrawl4ai: async () => {
        throw new Error("Crawl4AI request timed out.");
      },
      fetchRendered: async (url) => {
        firecrawlCalls.push(url);
        return firecrawlSuccess;
      },
    });
    const page = await verifier!.render("https://trumoveinc.com/services/corporate-relocation");
    expect(page.renderedBy).toBe(
      "Firecrawl (self-hosted) after Crawl4AI failed: Crawl4AI request timed out.",
    );
    expect(firecrawlCalls).toEqual(["https://fire.example/v2/scrape"]);
  });

  it("still renders through Firecrawl alone when Crawl4AI is unconfigured", async () => {
    const verifier = createRenderedVerifier(
      {
        SELFHOSTED_FIRECRAWL_BASE_URL: "https://fire.example",
        SELFHOSTED_FIRECRAWL_API_KEY: "fire-secret",
      },
      { fetchRendered: async () => firecrawlSuccess },
    );
    const page = await verifier!.render("https://trumoveinc.com/services/corporate-relocation");
    expect(page.renderedBy).toBe("Firecrawl (self-hosted)");
  });

  it("returns null only when neither renderer is configured", () => {
    expect(createRenderedVerifier({})).toBeNull();
    expect(createRenderedVerifier({ VPS_SCRAPER_API_KEY: "vps-secret" })).not.toBeNull();
  });
});

describe("extractMetaDescription", () => {
  it("reads the description meta tag in either attribute order", () => {
    expect(
      extractMetaDescription('<head><meta name="description" content="Movers you trust."></head>'),
    ).toBe("Movers you trust.");
    expect(extractMetaDescription("<meta content='Movers you trust.' name='DESCRIPTION' />")).toBe(
      "Movers you trust.",
    );
  });

  it("decodes entities and ignores other meta tags", () => {
    const html =
      '<meta property="og:description" content="wrong"><meta name="description" content="Moving &amp; storage">';
    expect(extractMetaDescription(html)).toBe("Moving & storage");
  });

  it("returns null when the tag is absent or empty", () => {
    expect(extractMetaDescription("<title>x</title>")).toBeNull();
    expect(extractMetaDescription('<meta name="description" content="">')).toBeNull();
  });
});

describe("createDirectFetchVerifier", () => {
  it("reads title, H1, description and subheadings from the page's own HTML", async () => {
    const html = `<html><head><title>Employee Relocation Movers | TruMove</title><meta name="description" content="Movers with dedicated coordinators."></head><body><h1>Employee Relocation Moving Services</h1><h2>Why choose us</h2></body></html>`;
    const verifier = createDirectFetchVerifier({
      fetchPage: async (url) => ({
        status: 200,
        text: html,
        headers: new Headers(),
        finalUrl: url,
      }),
    });
    const page = await verifier.render("https://trumoveinc.com/services/corporate-relocation");
    expect(page.title).toBe("Employee Relocation Movers | TruMove");
    expect(page.heading).toBe("Employee Relocation Moving Services");
    expect(page.metaDescription).toBe("Movers with dedicated coordinators.");
    expect(page.subheadings).toEqual(["Why choose us"]);
    expect(page.renderedBy).toContain("Direct fetch");
  });

  it("throws on a non-2xx response instead of reading an error page as content", async () => {
    const verifier = createDirectFetchVerifier({
      fetchPage: async (url) => ({
        status: 503,
        text: "<h1>Service unavailable</h1>",
        headers: new Headers(),
        finalUrl: url,
      }),
    });
    await expect(verifier.render("https://trumoveinc.com/")).rejects.toThrow("HTTP 503");
  });
});

describe("verifyRenderedPage", () => {
  it("only passes on an exact match of both values", () => {
    const page = {
      finalUrl: "https://trumoveinc.com/services/corporate-relocation",
      title: "Employee Relocation Movers | TruMove",
      heading: "Employee Relocation Moving Services",
      metaDescription: null,
      subheadings: [],
      renderedBy: "TestRenderer",
    };
    expect(verifyRenderedPage(page, changes).ok).toBe(true);
    expect(verifyRenderedPage({ ...page, title: "Old" }, changes).ok).toBe(false);
  });

  it("proves a meta description change without requiring a title or heading", () => {
    const page = {
      finalUrl: "https://trumoveinc.com/services/corporate-relocation",
      title: null,
      heading: null,
      metaDescription:
        "Employee relocation movers with dedicated coordinators and guaranteed dates.",
      subheadings: [],
      renderedBy: "TestRenderer",
    };
    const proof = verifyRenderedPage(page, metaChanges);
    expect(proof.ok).toBe(true);
    expect(proof.foundDescription).toBe(page.metaDescription);
    expect(verifyRenderedPage({ ...page, metaDescription: "Old wording" }, metaChanges).ok).toBe(
      false,
    );
  });

  it("treats a missing meta description as unproven, not as a failure of the change", () => {
    const proof = verifyRenderedPage(
      {
        finalUrl: "https://trumoveinc.com/services/corporate-relocation",
        title: "TruMove, AI-Powered Moving Made Simple",
        heading: "Corporate Relocation",
        metaDescription: null,
        subheadings: [],
        renderedBy: "TestRenderer",
      },
      metaChanges,
    );
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("no meta description");
  });

  it("treats an unrendered shell as unproven, not as a failure of the change", () => {
    const proof = verifyRenderedPage(
      {
        finalUrl: "https://trumoveinc.com/services/corporate-relocation",
        title: "TruMove, AI-Powered Moving Made Simple",
        heading: null,
        metaDescription: null,
        subheadings: [],
        renderedBy: "TestRenderer",
      },
      changes,
    );
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("application shell");
  });
});

describe("checkPublishedPage", () => {
  it("turns a failed measurement-anchor follow-up into a warning", async () => {
    const warning = await captureMeasurementFollowupWarning(async () => {
      throw new Error("temporary database error");
    });

    expect(warning).toBe("Measurement anchor follow-up failed: temporary database error");
  });

  it("marks applied through one atomic routine when the rendered page proves the change", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
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

  it("keeps a proven change verified when measurement follow-up needs a retry", async () => {
    const warning = "Measurement anchor follow-up failed: temporary database error";
    const { store, attempts, saved } = makeStore(makeRequest({ commitSha: "new-sha" }), {
      proofResult: { changed: true, warning },
    });
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      renderer: makeRenderer({
        title: "Employee Relocation Movers | TruMove",
        heading: "Employee Relocation Moving Services",
      }),
      requestId: "x",
      actorId: "operator",
    });

    expect(outcome.status).toBe("verified");
    expect(outcome.warning).toBe(warning);
    expect(outcome.message).toContain("measurement follow-up needs a retry");
    expect(saved.map((row) => row["kind"])).toEqual(["applied"]);
    expect(attempts.at(-1)?.detail).toMatchObject({ measurementFollowupWarning: warning });
  });

  it("marks a meta description change applied when the rendered page serves it", async () => {
    const { store, saved } = makeStore(
      makeRequest({
        commitSha: "new-sha",
        changes: metaChanges,
        filePath: "src/components/seo/SeoHead.tsx",
      }),
    );
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      renderer: makeRenderer({
        title: null,
        heading: null,
        metaDescription:
          "Employee relocation movers with dedicated coordinators and guaranteed dates.",
      }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("verified");
    expect(outcome.message).toContain("meta description");
    expect(saved.map((row) => row["kind"])).toEqual(["applied"]);
  });

  it("stays pending and does not mark applied when the page is unchanged", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
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
      robotsProver: null,
      renderer: null,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("SELFHOSTED_FIRECRAWL_API_KEY");
  });

  it("refuses a target URL outside the allowlisted site", async () => {
    const { store } = makeStore(
      makeRequest({ commitSha: "new-sha", targetUrl: "https://example.com/page" }),
    );
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
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
      robotsProver: null,
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
      robotsProver: null,
      renderer: makeRenderer({ title: "x", heading: "y" }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
  });
});

function makeFailingRenderer(message: string): RenderedVerifier {
  return {
    name: "BrokenRenderer",
    render: async () => {
      throw new Error(message);
    },
  };
}

describe("checkPublishedPage with a direct page fetch", () => {
  it("proves a change from the page's own prerendered HTML with no renderer configured", async () => {
    const { store, saved, attempts } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      renderer: null,
      directFetcher: makeRenderer({
        title: "Employee Relocation Movers | TruMove",
        heading: "Employee Relocation Moving Services",
      }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("verified");
    expect(saved.map((row) => row["kind"])).toEqual(["applied"]);
    expect(attempts.at(-1)?.detail).toMatchObject({ renderedBy: "TestRenderer" });
  });

  it("falls through to the renderer when the direct fetch sees a client-only shell", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      directFetcher: makeRenderer({ title: "TruMove | AI-Powered Moving", heading: null }),
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

  it("reports the page the direct fetch actually saw, not a broken renderer's shell", async () => {
    const { store, attempts } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      directFetcher: makeRenderer({ title: "Old title", heading: "Old heading" }),
      renderer: makeRenderer({ title: null, heading: null }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("pending");
    expect(outcome.message).toContain("does not yet serve");
    expect(outcome.message).not.toContain("application shell");
    expect(attempts.at(-1)?.detail).toMatchObject({ foundTitle: "Old title" });
  });

  it("still proves through the renderer when the direct fetch itself fails", async () => {
    const { store, saved, attempts } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      directFetcher: makeFailingRenderer("The public page returned HTTP 500 to a direct fetch."),
      renderer: makeRenderer({
        title: "Employee Relocation Movers | TruMove",
        heading: "Employee Relocation Moving Services",
      }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("verified");
    expect(saved.map((row) => row["kind"])).toEqual(["applied"]);
    expect(attempts.at(-1)?.status).toBe("verified");
  });

  it("fails with every source's own reason when nothing could read the page", async () => {
    const { store, saved } = makeStore(makeRequest({ commitSha: "new-sha" }));
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      directFetcher: makeFailingRenderer("Direct page fetch request timed out after 20s."),
      renderer: makeFailingRenderer("Crawl4AI request failed with HTTP 401."),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.message).toContain("timed out");
    expect(outcome.message).toContain("HTTP 401");
    expect(saved).toHaveLength(0);
  });
});

const robotsChanges = parseFieldChanges([
  {
    field: "robots_txt",
    label: "robots.txt site wide block",
    before: "Disallow: /",
    after: "Disallow:",
  },
]);

function makeRobotsRequest(overrides: Partial<ExecutableRequest> = {}): ExecutableRequest {
  return makeRequest({
    targetUrl: "https://trumoveinc.com",
    filePath: "public/robots.txt",
    changes: robotsChanges,
    commitSha: "robots-sha",
    ...overrides,
  });
}

function makeProver(input: { deployed: string; committed: string }): {
  prover: RobotsProver;
  fetchedUrls: string[];
  readRefs: string[];
} {
  const fetchedUrls: string[] = [];
  const readRefs: string[] = [];
  const prover: RobotsProver = {
    fetchDeployed: async (url) => {
      fetchedUrls.push(url);
      return { content: input.deployed, finalUrl: url };
    },
    readCommitted: async (_repo, _path, ref) => {
      readRefs.push(ref);
      return input.committed;
    },
    hash: (text) => `sha256-of:${text}`,
  };
  return { prover, fetchedUrls, readRefs };
}

describe("verifyPublishedRobots", () => {
  it("proves a deployed file that matches the committed one, ignoring line-ending artifacts", () => {
    const proof = verifyPublishedRobots({
      deployedContent: "User-agent: *\r\nDisallow:\r\n",
      committedContent: "User-agent: *\nDisallow:",
      finalUrl: "https://trumoveinc.com/robots.txt",
      fetchedBy: "Direct fetch",
      commitSha: "robots-sha",
    });
    expect(proof.ok).toBe(true);
    expect(proof.matchedCommitSha).toBe("robots-sha");
  });

  it("reports a mismatch as a pending publish, never as a failure of the change", () => {
    const proof = verifyPublishedRobots({
      deployedContent: "User-agent: *\nDisallow: /",
      committedContent: "User-agent: *\nDisallow:",
      finalUrl: "https://trumoveinc.com/robots.txt",
      fetchedBy: "Direct fetch",
      commitSha: "robots-sha",
    });
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("publish or sync is still pending");
  });

  it("refuses to prove anything against an unreadable committed file", () => {
    const proof = verifyPublishedRobots({
      deployedContent: "User-agent: *",
      committedContent: "   ",
      finalUrl: "https://trumoveinc.com/robots.txt",
      fetchedBy: "Direct fetch",
      commitSha: "robots-sha",
    });
    expect(proof.ok).toBe(false);
    expect(proof.reason).toContain("could not be read");
  });

  it("normalizes only transport artifacts, never directive content", () => {
    expect(normalizeTextFile("Disallow: /a\r\nAllow: /b  \n")).toBe("Disallow: /a\nAllow: /b");
    expect(normalizeTextFile("Disallow: /a")).not.toBe(normalizeTextFile("Disallow: /b"));
  });
});

describe("checkPublishedPage crawl-directives lane", () => {
  it("refuses plainly when the executor credential needed to read the committed file is absent", async () => {
    const { store } = makeStore(makeRobotsRequest());
    const outcome = await checkPublishedPage({
      store,
      robotsProver: null,
      renderer: makeRenderer({ title: "irrelevant", heading: "irrelevant" }),
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.message).toContain("GITHUB_EXECUTOR_TOKEN");
  });

  it("proves the lane by comparing the deployed file to the committed one, with no renderer involved", async () => {
    const { store, saved } = makeStore(makeRobotsRequest());
    const { prover, fetchedUrls, readRefs } = makeProver({
      deployed: "User-agent: *\nDisallow:",
      committed: "User-agent: *\nDisallow:",
    });
    const outcome = await checkPublishedPage({
      store,
      robotsProver: prover,
      renderer: null,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("verified");
    expect(fetchedUrls).toEqual(["https://trumoveinc.com/robots.txt"]);
    expect(readRefs).toEqual(["robots-sha"]);
    expect(outcome.proof?.matchedCommitSha).toBe("robots-sha");
    expect(outcome.proof?.deployedSha256).toBe(outcome.proof?.committedSha256);
    expect(saved.map((row) => row["kind"])).toEqual(["applied"]);
  });

  it("stays pending while the deployed file has not caught up with the commit", async () => {
    const { store, saved, attempts } = makeStore(makeRobotsRequest());
    const { prover } = makeProver({
      deployed: "User-agent: *\nDisallow: /",
      committed: "User-agent: *\nDisallow:",
    });
    const outcome = await checkPublishedPage({
      store,
      robotsProver: prover,
      renderer: null,
      requestId: "x",
      actorId: "operator",
    });
    expect(outcome.status).toBe("pending");
    expect(saved).toHaveLength(0);
    expect(attempts[0]?.status).toBe("pending");
  });
});
