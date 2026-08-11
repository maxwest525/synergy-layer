import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { AttemptRecord, ExecutableRequest, ExecutionStore, GithubApi } from "./execute";
import { parseFieldChanges } from "./source-change";

type Client = SupabaseClient<Database>;

/**
 * Store backed by the service-role client. Lifecycle writes still go through
 * the transition routine, so the guard, the audit event, and the Inbox gate
 * behave exactly as they do for a manual operator action.
 */
export function createExecutionStore(admin: Client, rls: Client): ExecutionStore {
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
      const { error } = await admin
        .from("change_requests")
        .update({
          source_commit_sha: commitSha,
          source_commit_url: commitUrl,
          source_committed_at: new Date().toISOString(),
          source_revision_after: commitSha,
        } as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    async savePublishedProof({ id, notes }) {
      const { error } = await admin
        .from("change_requests")
        .update({
          published_proof_at: new Date().toISOString(),
          published_proof_notes: notes,
        } as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },

    async markApplied({ id, notes, revision }) {
      const { error } = await rls.rpc("transition_change_request", {
        _id: id,
        _action: "mark_applied",
        _notes: notes,
        _revision: revision,
      });
      if (error) throw new Error(error.message);
    },
  };
}

const API = "https://api.github.com";

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
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GitHub responded ${response.status}: ${text.slice(0, 400)}`);
    }
    return text ? (JSON.parse(text) as unknown) : {};
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

export async function fetchPublicPage(url: string): Promise<{ status: number; html: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AOOS-change-verifier", Accept: "text/html" },
  });
  return { status: response.status, html: await response.text() };
}

export async function fetchExecutionAttempts(client: Client, changeRequestId: string) {
  const { data, error } = await client
    .from("change_request_executions")
    .select("id, kind, status, commit_sha, commit_url, error, created_at")
    .eq("change_request_id", changeRequestId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}
