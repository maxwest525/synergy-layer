import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createHash } from "node:crypto";

import type {
  AttemptRecord,
  ExecutableRequest,
  ExecutionStore,
  GithubApi,
  RenderedVerifier,
  RobotsProver,
} from "./execute";
import { visibleText } from "../broker-licence";
import { firecrawlEndpoint } from "../firecrawl-endpoint";
import { scrapePageWithVps, vpsScraperConfigured } from "../connectors/vps-scraper.server";
import { GithubStatusError, readGithubResponseSignals } from "./github-error";
import {
  extractDocumentTitle,
  extractFirstHeading,
  extractMarkdownHeading,
  extractMetaDescription,
  extractSubheadings,
  parseFieldChanges,
  type RenderedPage,
} from "./source-change";

type Client = SupabaseClient<Database>;

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 2_000_000;

export async function captureMeasurementFollowupWarning(
  followup: () => Promise<void>,
): Promise<string | undefined> {
  try {
    await followup();
    return undefined;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The measurement anchor could not be recorded.";
    return `Measurement anchor follow-up failed: ${message}`;
  }
}

/** Bounded, timed fetch. Never lets a provider hang or flood the worker. */
async function boundedFetch(
  url: string,
  init: RequestInit & { label: string },
): Promise<{ status: number; text: string; headers: Headers; finalUrl: string }> {
  const { label, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, { ...rest, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "failed";
    throw new Error(`${label} request ${reason} after ${REQUEST_TIMEOUT_MS / 1000}s.`);
  }
  const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
  // response.url is where redirects actually landed; empty in some test mocks.
  return {
    status: response.status,
    text,
    headers: response.headers,
    finalUrl: response.url || url,
  };
}

const EXECUTION_SOURCE_MODULE = "execution";

/**
 * A failed or refused source attempt used to be stored and shown only on the
 * change page's history; nothing filed it where the operator looks (MON-10).
 * One open item per change; a later attempt that lands closes it.
 */
async function reflectAttemptInInbox(admin: Client, attempt: AttemptRecord): Promise<void> {
  if (attempt.kind !== "source_commit" && attempt.kind !== "source_revert") return;
  const verb = attempt.kind === "source_revert" ? "revert" : "commit";
  if (attempt.status === "failed" || attempt.status === "refused") {
    const { data: open, error: openError } = await admin
      .from("inbox_items")
      .select("id")
      .eq("tenant_id", attempt.tenantId)
      .eq("source_module", EXECUTION_SOURCE_MODULE)
      .eq("subject_id", attempt.changeRequestId)
      .is("resolved_at", null)
      .limit(1);
    if (openError) throw new Error(openError.message);
    if ((open ?? []).length > 0) return;
    const { fileInboxItem } = await import("../os.server");
    await fileInboxItem(admin, {
      lane: "needs_attention",
      sourceModule: EXECUTION_SOURCE_MODULE,
      title: `The governed ${verb} was ${attempt.status}`,
      summary:
        attempt.error ??
        `The ${verb} did not land and recorded no reason; the change page holds the attempt.`,
      priority: 2,
      subjectKind: "change_request",
      subjectId: attempt.changeRequestId,
      actions: [
        { kind: "review", label: "Open the change", href: `/changes/${attempt.changeRequestId}` },
      ],
      metadata: { category: "failure", kind: attempt.kind, status: attempt.status },
      tenantId: attempt.tenantId,
    });
    return;
  }
  if (attempt.status === "committed" || attempt.status === "reverted") {
    const { error } = await admin
      .from("inbox_items")
      .update({ lane: "completed", resolved_at: new Date().toISOString() })
      .eq("tenant_id", attempt.tenantId)
      .eq("source_module", EXECUTION_SOURCE_MODULE)
      .eq("subject_id", attempt.changeRequestId)
      .is("resolved_at", null);
    if (error) throw new Error(error.message);
  }
}

/**
 * Store backed by the service-role client. The rendered-proof transition is
 * service-only at the database level, so the authenticated actor id is carried
 * explicitly across that boundary for audit instead of being inferred.
 */
export function createExecutionStore(admin: Client, rls: Client, actorId: string): ExecutionStore {
  return {
    async load(id: string): Promise<ExecutableRequest | null> {
      // Read through the operator's own client so tenant visibility is enforced.
      const { data, error } = await rls
        .from("change_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as Record<string, unknown>;
      const text = (key: string): string | null =>
        typeof row[key] === "string" ? (row[key] as string) : null;
      return {
        id: data.id,
        tenantId: data.tenant_id,
        state: data.state,
        title: data.title,
        targetUrl: data.target_url,
        repo: text("source_repo"),
        branch: text("source_branch"),
        filePath: data.source_file,
        projectId: text("source_project_id"),
        baseRevision: data.source_revision_before,
        changes: parseFieldChanges(data.changes),
        commitSha: text("source_commit_sha"),
        commitUrl: text("source_commit_url"),
        publishedProofAt: text("published_proof_at"),
      };
    },

    async recordAttempt(attempt: AttemptRecord) {
      const { error } = await admin.from("change_request_executions").insert({
        tenant_id: attempt.tenantId,
        change_request_id: attempt.changeRequestId,
        actor_id: attempt.actorId,
        kind: attempt.kind,
        status: attempt.status,
        commit_sha: attempt.commitSha ?? null,
        commit_url: attempt.commitUrl ?? null,
        error: attempt.error ?? null,
        detail: (attempt.detail ?? {}) as never,
      } as never);
      if (error) throw new Error(error.message);
      await reflectAttemptInInbox(admin, attempt);
    },

    async saveCommit({ id, commitSha, commitUrl }) {
      const { data, error } = await admin
        .from("change_requests")
        .update({
          source_commit_sha: commitSha,
          source_commit_url: commitUrl,
          source_committed_at: new Date().toISOString(),
          source_revision_after: commitSha,
        } as never)
        .eq("id", id)
        .is("source_commit_sha", null)
        .select("id");
      if (error) throw new Error(error.message);
      if ((data ?? []).length !== 1) {
        throw new Error(
          `Recording commit ${commitSha.slice(0, 10)} changed ${(data ?? []).length} rows instead of exactly one. The commit exists in GitHub but AOOS has not recorded it.`,
        );
      }
    },

    async applyRenderedProof({ id, notes, revision, proof }) {
      // Service-only routine: a browser-authenticated client cannot invoke it,
      // so a forged proof cannot manufacture an applied transition.
      const { data, error } = await admin.rpc("apply_change_request_rendered_proof", {
        _id: id,
        _actor: actorId,
        _proof: proof,
        _notes: notes,
        _revision: revision,
      } as never);
      if (error) throw new Error(error.message);
      const payload = data as { changed?: unknown } | null;
      if (!payload || typeof payload.changed !== "boolean") {
        throw new Error(
          "The publish-proof routine returned an unreadable result. Nothing was assumed.",
        );
      }
      if (payload.changed) {
        const warning = await captureMeasurementFollowupWarning(async () => {
          const { recordRenderedLiveAnchor } = await import("../change-measurements.server");
          await recordRenderedLiveAnchor(admin, id, actorId, proof);
        });
        if (warning) return { changed: true, warning };
      }
      return { changed: payload.changed };
    },
  };
}

const API = "https://api.github.com";

/**
 * GitHub REST requires a valid User-Agent. Node/undici supplies one locally,
 * but the deployed worker runtime does not, which GitHub answers with 403.
 * Sending it explicitly makes both environments behave identically.
 */
export const GITHUB_USER_AGENT = "AOOS-Marketing-OS/1.0";

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Returns null when no executor credential is configured. Never throws for that. */
export function createGithubApi(): GithubApi | null {
  const token = process.env["GITHUB_EXECUTOR_TOKEN"];
  if (!token) return null;

  const call = async (path: string, init?: RequestInit): Promise<unknown> => {
    const response = await boundedFetch(`${API}${path}`, {
      ...init,
      label: "GitHub",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": GITHUB_USER_AGENT,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (response.status < 200 || response.status >= 300) {
      // Deliberately no response body: it can echo request content. Only the
      // safe rate-limit and SSO headers are carried.
      throw new GithubStatusError(
        response.status,
        path.split("?")[0] ?? path,
        readGithubResponseSignals(response.headers),
      );
    }

    return response.text ? (JSON.parse(response.text) as unknown) : {};
  };

  return {
    async branchHead(repo, branch) {
      const data = (await call(`/repos/${repo}/branches/${encodeURIComponent(branch)}`)) as {
        commit?: { sha?: string };
      };
      const sha = data.commit?.sha;
      if (!sha) throw new Error(`Branch ${branch} has no head commit.`);
      return sha;
    },
    async readFile(repo, path, ref) {
      const data = (await call(
        `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      )) as { sha?: string; content?: string; encoding?: string };
      if (!data.sha || typeof data.content !== "string") {
        throw new Error(`File ${path} was not readable on ${ref}.`);
      }
      return { sha: data.sha, content: decodeBase64(data.content) };
    },
    async findCommitByMarker({ repo, branch, path, marker }) {
      const data = (await call(
        `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&per_page=30`,
      )) as { sha?: string; html_url?: string; commit?: { message?: string } }[];
      if (!Array.isArray(data)) {
        throw new Error(
          "GitHub returned an unreadable commit list, so no reconciliation was attempted.",
        );
      }
      const hit = data.find((entry) => (entry.commit?.message ?? "").includes(marker));
      if (!hit?.sha) return null;
      return {
        commitSha: hit.sha,
        commitUrl: hit.html_url ?? `https://github.com/${repo}/commit/${hit.sha}`,
      };
    },
    async commitFile({ repo, branch, path, content, fileSha, message }) {
      const data = (await call(
        `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message,
            branch,
            sha: fileSha,
            content: encodeBase64(content),
          }),
        },
      )) as { commit?: { sha?: string; html_url?: string } };
      const sha = data.commit?.sha;
      if (!sha) throw new Error("GitHub accepted the write but returned no commit sha.");
      return {
        commitSha: sha,
        commitUrl: data.commit?.html_url ?? `https://github.com/${repo}/commit/${sha}`,
      };
    },
  };
}

/**
 * The name every direct-fetch proof carries, so an audit row states its source.
 */
export const DIRECT_FETCH_NAME = "Direct fetch of the page HTML";

/**
 * The target site serves prerendered HTML (brittmove PR #5, verified live on
 * the production origin 2026-09-01), so a plain fetch of the page carries each
 * route's real title, H1 and meta description and is itself a proof source.
 * No credential, no charge. A route that is still client-only yields a shell
 * here, which under-proves and falls through to the JavaScript renderers —
 * the same safety direction as a stale render: the approved new wording
 * cannot exist in any cache older than the commit, so a stale copy can only
 * under-prove a forward change, never falsely prove one.
 */
export function createDirectFetchVerifier(
  deps: { fetchPage?: typeof boundedFetch } = {},
): RenderedVerifier {
  const fetchPage = deps.fetchPage ?? boundedFetch;
  return {
    name: DIRECT_FETCH_NAME,
    async render(url) {
      const response = await fetchPage(url, {
        method: "GET",
        label: "Direct page fetch",
        // The page may sit behind a CDN; ask for the origin's copy.
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `The public page returned HTTP ${response.status} to a direct fetch, so nothing was proven.`,
        );
      }
      return {
        finalUrl: response.finalUrl ?? url,
        title: extractDocumentTitle(response.text),
        heading: extractFirstHeading(response.text),
        metaDescription: extractMetaDescription(response.text),
        subheadings: extractSubheadings(response.text),
        visibleText: visibleText(response.text),
        renderedBy: DIRECT_FETCH_NAME,
      };
    },
  };
}

/**
 * Scrape request for the JavaScript renderers, which remain the fallback for
 * routes the prerender does not cover. Returns null when no Firecrawl
 * credential is configured.
 */
export function buildRenderedScrapeRequest(url: string) {
  return {
    url,
    formats: ["rawHtml", "markdown"],
    onlyMainContent: false,
    waitFor: 3000,
    // Publish proof must never use Firecrawl's two-day default cache.
    maxAge: 0,
  };
}

/**
 * Crawl4AI first, Firecrawl only as fallback — the same precedence the page
 * audit has used since the metered-crawl correction (PRs #55/#56). This
 * verifier previously consulted only Firecrawl, so proposal drafting and
 * publish proof paid for (or failed on) Firecrawl while the operator's own
 * Crawl4AI box sat healthy and preferred everywhere else in the product.
 *
 * Freshness: Crawl4AI renders on request. A stale render cannot falsely prove
 * a forward change live — the approved new wording cannot exist in any cache
 * older than the commit — so staleness only under-proves, and the Firecrawl
 * fallback still sends maxAge: 0.
 */
export function createRenderedVerifier(
  env: Record<string, string | undefined> = process.env,
  deps: {
    scrapeCrawl4ai?: (url: string) => Promise<{ html: string; markdown: string; finalUrl: string }>;
    fetchRendered?: typeof boundedFetch;
  } = {},
): RenderedVerifier | null {
  const endpoint = firecrawlEndpoint(env);
  const crawl4aiConfigured = vpsScraperConfigured(env);
  if (!crawl4aiConfigured && !endpoint) return null;

  const scrape = deps.scrapeCrawl4ai ?? ((url: string) => scrapePageWithVps(url, { env }));
  const fetchRendered = deps.fetchRendered ?? boundedFetch;
  const firecrawlName = endpoint
    ? endpoint.selfHosted
      ? "Firecrawl (self-hosted)"
      : "Firecrawl"
    : null;

  async function renderWithFirecrawl(url: string, renderedBy: string): Promise<RenderedPage> {
    if (!endpoint) throw new Error("No Firecrawl deployment is configured.");
    const response = await fetchRendered(endpoint.url, {
      method: "POST",
      label: "Firecrawl",
      headers: { Authorization: `Bearer ${endpoint.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRenderedScrapeRequest(url)),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Firecrawl responded ${response.status}, so nothing was proven.`);
    }
    let parsed: {
      success?: boolean;
      error?: string;
      data?: {
        rawHtml?: string;
        markdown?: string;
        metadata?: { title?: string; sourceURL?: string; url?: string; statusCode?: number };
      };
    };
    try {
      parsed = JSON.parse(response.text) as typeof parsed;
    } catch {
      throw new Error("Firecrawl returned an unreadable response, so nothing was proven.");
    }
    if (parsed.success === false) {
      throw new Error(`Firecrawl could not render the page: ${parsed.error ?? "no reason given"}.`);
    }
    const status = parsed.data?.metadata?.statusCode;
    if (typeof status === "number" && (status < 200 || status >= 300)) {
      throw new Error(
        `The public page returned HTTP ${status} when rendered, so nothing was proven.`,
      );
    }
    const html = parsed.data?.rawHtml ?? "";
    const markdown = parsed.data?.markdown ?? "";
    const metaTitle = parsed.data?.metadata?.title?.trim();
    return {
      finalUrl: parsed.data?.metadata?.sourceURL ?? parsed.data?.metadata?.url ?? url,
      title: extractDocumentTitle(html) ?? (metaTitle ? metaTitle : null),
      heading: extractFirstHeading(html) ?? extractMarkdownHeading(markdown),
      metaDescription: extractMetaDescription(html),
      subheadings: extractSubheadings(html),
      visibleText: visibleText(html),
      renderedBy,
    };
  }

  if (!crawl4aiConfigured) {
    const name = firecrawlName as string;
    return { name, render: (url) => renderWithFirecrawl(url, name) };
  }

  return {
    name: firecrawlName ? `Crawl4AI, then ${firecrawlName}` : "Crawl4AI",
    async render(url) {
      let crawl4aiFailure: string;
      try {
        const page = await scrape(url);
        return {
          finalUrl: page.finalUrl,
          title: extractDocumentTitle(page.html),
          heading: extractFirstHeading(page.html) ?? extractMarkdownHeading(page.markdown),
          metaDescription: extractMetaDescription(page.html),
          subheadings: extractSubheadings(page.html),
          visibleText: visibleText(page.html),
          renderedBy: "Crawl4AI",
        };
      } catch (error) {
        if (!endpoint) throw error;
        crawl4aiFailure = error instanceof Error ? error.message : "no reason given";
      }
      // Same provenance wording the page audit stores, so a fallback render is
      // attributable from the row alone.
      return renderWithFirecrawl(url, `${firecrawlName} after Crawl4AI failed: ${crawl4aiFailure}`);
    },
  };
}

/**
 * The crawl-directives prover: a plain fetch of the deployed static file, the
 * committed file read through the GitHub executor, and a SHA-256 for each so
 * the database routine can re-check the comparison. Null without the executor
 * token, because the committed half cannot be read without it.
 */
export function createRobotsProver(): RobotsProver | null {
  const github = createGithubApi();
  if (!github) return null;
  return {
    async fetchDeployed(url) {
      const response = await boundedFetch(url, {
        method: "GET",
        label: "robots.txt fetch",
        // The deployed file may sit behind a CDN; ask for the origin's copy.
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `The public site returned HTTP ${response.status} for robots.txt, so nothing was proven.`,
        );
      }
      return { content: response.text, finalUrl: url };
    },
    async readCommitted(repo, path, ref) {
      const file = await github.readFile(repo, path, ref);
      return file.content;
    },
    hash(text) {
      return createHash("sha256").update(text, "utf8").digest("hex");
    },
  };
}

export async function fetchExecutionAttempts(client: Client, changeRequestId: string) {
  const { data, error } = await client
    .from("change_request_executions")
    .select("id, kind, status, commit_sha, commit_url, error, detail, created_at")
    .eq("change_request_id", changeRequestId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}
