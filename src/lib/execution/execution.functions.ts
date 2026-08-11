import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GOVERNED_BRANCH,
  GOVERNED_ORIGIN,
  GOVERNED_PROJECT_ID,
  GOVERNED_REPO,
} from "./allowlist";

const idInput = z.object({ id: z.string().uuid() });

export type ExecutionAttemptView = {
  id: string;
  kind: string;
  status: string;
  commitSha: string | null;
  commitUrl: string | null;
  error: string | null;
  createdAt: string;
};

export type ReadinessFact = {
  label: string;
  ok: boolean;
  detail: string;
};

export type ExecutionStateView = {
  isOperator: boolean;
  operatorCheckFailed: boolean;
  executorCredentialPresent: boolean;
  rendererCredentialPresent: boolean;
  repo: string | null;
  branch: string | null;
  filePath: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  committedAt: string | null;
  publishedProofAt: string | null;
  publishedProofNotes: string | null;
  targetAllowed: boolean;
  readiness: ReadinessFact[];
  attempts: ExecutionAttemptView[];
};

function buildReadiness(input: {
  executorCredentialPresent: boolean;
  rendererCredentialPresent: boolean;
  repo: string | null;
  branch: string | null;
  filePath: string | null;
  baseRevision: string | null;
  targetUrl: string | null;
  changeCount: number;
}): ReadinessFact[] {
  const repoOk = input.repo === GOVERNED_REPO && input.branch === GOVERNED_BRANCH;
  let originOk = false;
  try {
    originOk = new URL(input.targetUrl ?? "").origin === GOVERNED_ORIGIN;
  } catch {
    originOk = false;
  }
  return [
    {
      label: "Write credential",
      ok: input.executorCredentialPresent,
      detail: input.executorCredentialPresent
        ? "A GitHub executor token is configured. Configured is not the same as proven: no write has been attempted."
        : "No GitHub executor token is configured, so AOOS cannot commit this change.",
    },
    {
      label: "Allowlisted source",
      ok: repoOk,
      detail: repoOk
        ? `Writes are restricted to ${GOVERNED_REPO} on ${GOVERNED_BRANCH}, project ${GOVERNED_PROJECT_ID}.`
        : `This request points at ${input.repo ?? "no repository"} on ${input.branch ?? "no branch"}, which is outside the allowlist.`,
    },
    {
      label: "Exact source file",
      ok: Boolean(input.filePath),
      detail: input.filePath
        ? `One file will be edited: ${input.filePath}.`
        : "No source file is recorded, so nothing can be edited.",
    },
    {
      label: "Base revision recorded",
      ok: Boolean(input.baseRevision),
      detail: input.baseRevision
        ? `The branch head must still be ${input.baseRevision.slice(0, 10)} at execution time, or the write is refused.`
        : "No observed base revision is recorded, so a stale write cannot be ruled out.",
    },
    {
      label: "Exact before and after values",
      ok: input.changeCount > 0,
      detail:
        input.changeCount > 0
          ? `${input.changeCount} exact replacement(s). Each approved before value must occur exactly once, or the write is refused.`
          : "No exact before/after values are stored.",
    },
    {
      label: "Rendered-page verification",
      ok: input.rendererCredentialPresent,
      detail: input.rendererCredentialPresent
        ? `A Firecrawl credential is configured. This site renders its title and H1 with JavaScript, so proof is read from ${GOVERNED_ORIGIN} after rendering.`
        : "No Firecrawl credential is configured. Raw HTML from this site is an application shell, so a change could not be proven live.",
    },
    {
      label: "Allowlisted public page",
      ok: originOk,
      detail: originOk
        ? `Verification only reads ${GOVERNED_ORIGIN}.`
        : `The target URL is outside ${GOVERNED_ORIGIN}, so verification would be refused.`,
    },
  ];
}

export const getExecutionState = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }): Promise<ExecutionStateView> => {
    const { createRequestClient } = await import("../tenant.server");
    const { fetchExecutionAttempts } = await import("./execute.server");
    const executorCredentialPresent = Boolean(process.env["GITHUB_EXECUTOR_TOKEN"]);
    const rendererCredentialPresent = Boolean(process.env["FIRECRAWL_API_KEY"]);
    const empty: ExecutionStateView = {
      isOperator: false,
      operatorCheckFailed: false,
      executorCredentialPresent,
      rendererCredentialPresent,
      repo: null,
      branch: null,
      filePath: null,
      commitSha: null,
      commitUrl: null,
      committedAt: null,
      publishedProofAt: null,
      publishedProofNotes: null,
      targetAllowed: false,
      readiness: [],
      attempts: [],
    };
    const { db, authenticated } = createRequestClient();
    if (!authenticated) return empty;

    const { data: operator, error: operatorError } = await db.rpc("is_operator");

    const { data: row, error } = await db
      .from("change_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ...empty, operatorCheckFailed: Boolean(operatorError) };
    const record = row as Record<string, unknown>;
    const text = (key: string): string | null =>
      typeof record[key] === "string" ? (record[key] as string) : null;

    const attempts = await fetchExecutionAttempts(db, data.id);
    const changeCount = Array.isArray(row.changes) ? row.changes.length : 0;
    let targetAllowed = false;
    try {
      targetAllowed = new URL(row.target_url).origin === GOVERNED_ORIGIN;
    } catch {
      targetAllowed = false;
    }

    return {
      ...empty,
      // A failed role check is never treated as "not an operator" silently.
      isOperator: !operatorError && operator === true,
      operatorCheckFailed: Boolean(operatorError),
      repo: text("source_repo"),
      branch: text("source_branch"),
      filePath: row.source_file,
      commitSha: text("source_commit_sha"),
      commitUrl: text("source_commit_url"),
      committedAt: text("source_committed_at"),
      publishedProofAt: text("published_proof_at"),
      publishedProofNotes: text("published_proof_notes"),
      targetAllowed,
      readiness: buildReadiness({
        executorCredentialPresent,
        rendererCredentialPresent,
        repo: text("source_repo"),
        branch: text("source_branch"),
        filePath: row.source_file,
        baseRevision: row.source_revision_before,
        targetUrl: row.target_url,
        changeCount,
      }),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        kind: attempt.kind,
        status: attempt.status,
        commitSha: attempt.commit_sha,
        commitUrl: attempt.commit_url,
        error: attempt.error,
        createdAt: attempt.created_at,
      })),
    };
  });

export const executeChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createExecutionStore, createGithubApi } = await import("./execute.server");
    const { executeSourceChange } = await import("./execute");
    return executeSourceChange({
      store: createExecutionStore(supabaseAdmin, context.supabase),
      github: createGithubApi(),
      requestId: data.id,
      actorId: context.userId,
    });
  });

export const checkChangeRequestPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createExecutionStore, createRenderedVerifier } = await import("./execute.server");
    const { checkPublishedPage } = await import("./execute");
    return checkPublishedPage({
      store: createExecutionStore(supabaseAdmin, context.supabase),
      renderer: createRenderedVerifier(),
      requestId: data.id,
      actorId: context.userId,
    });
  });
