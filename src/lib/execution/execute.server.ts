import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { AttemptRecord, ExecutableRequest, ExecutionStore, GithubApi, RenderedVerifier } from "./execute";
import { GithubStatusError } from "./github-error";
import { extractDocumentTitle, extractFirstHeading, extractMarkdownHeading, parseFieldChanges } from "./source-change";


type Client = SupabaseClient<Database>;

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 2_000_000;

/** Bounded, timed fetch. Never lets a provider hang or flood the worker. */
async function boundedFetch(
  url: string,
  init: RequestInit & { label: string },
): Promise<{ status: number; text: string; headers: Headers }> {
  const { label, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, { ...rest, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "failed";
    throw new Error(`${label} request ${reason} after ${REQUEST_TIMEOUT_MS / 1000}s.`);
  }
  const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
  return { status: response.status, text, headers: response.headers };
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
        throw new Error("The publish-proof routine returned an unreadable result. Nothing was assumed.");
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
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (response.status < 200 || response.status >= 300) {
      // Deliberately no response body: it can echo request content.
      throw new GithubStatusError(response.status, path.split("?")[0] ?? path);
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
        throw new Error("GitHub returned an unreadable commit list, so no reconciliation was attempted.");
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

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";

/**
 * The target site renders its title and H1 in the browser, so the origin's raw
 * HTML is only an application shell. Proof therefore needs a renderer.
 * Returns null when no Firecrawl credential is configured.
 */
export function createRenderedVerifier(): RenderedVerifier | null {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) return null;

  return {
    name: "Firecrawl",
    async render(url) {
      const response = await boundedFetch(FIRECRAWL_URL, {
        method: "POST",
        label: "Firecrawl",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          formats: ["rawHtml", "markdown"],
          onlyMainContent: false,
          waitFor: 3000,
        }),
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
        throw new Error(`The public page returned HTTP ${status} when rendered, so nothing was proven.`);
      }
      const html = parsed.data?.rawHtml ?? "";
      const markdown = parsed.data?.markdown ?? "";
      const metaTitle = parsed.data?.metadata?.title?.trim();
      return {
        finalUrl: parsed.data?.metadata?.sourceURL ?? parsed.data?.metadata?.url ?? url,
        title: extractDocumentTitle(html) ?? (metaTitle ? metaTitle : null),
        heading: extractFirstHeading(html) ?? extractMarkdownHeading(markdown),
        renderedBy: "Firecrawl",
      };
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
