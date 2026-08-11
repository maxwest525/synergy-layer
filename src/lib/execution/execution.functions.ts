import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type ExecutionStateView = {
  isOperator: boolean;
  executorCredentialPresent: boolean;
  repo: string | null;
  branch: string | null;
  filePath: string | null;
  commitSha: string | null;
  commitUrl: string | null;
  committedAt: string | null;
  publishedProofAt: string | null;
  publishedProofNotes: string | null;
  attempts: ExecutionAttemptView[];
};

export const getExecutionState = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ data }): Promise<ExecutionStateView> => {
    const { createRequestClient } = await import("../tenant.server");
    const { fetchExecutionAttempts } = await import("./execute.server");
    const empty: ExecutionStateView = {
      isOperator: false,
      executorCredentialPresent: Boolean(process.env["GITHUB_EXECUTOR_TOKEN"]),
      repo: null,
      branch: null,
      filePath: null,
      commitSha: null,
      commitUrl: null,
      committedAt: null,
      publishedProofAt: null,
      publishedProofNotes: null,
      attempts: [],
    };
    const { db, authenticated } = createRequestClient();
    if (!authenticated) return empty;

    const { data: operator } = await db.rpc("is_operator");

    const { data: row, error } = await db
      .from("change_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return empty;
    const record = row as Record<string, unknown>;
    const text = (key: string): string | null =>
      typeof record[key] === "string" ? (record[key] as string) : null;

    const attempts = await fetchExecutionAttempts(db, data.id);
    return {
      ...empty,
      isOperator: await isOperator(db, userId),
      repo: text("source_repo"),
      branch: text("source_branch"),
      filePath: row.source_file,
      commitSha: text("source_commit_sha"),
      commitUrl: text("source_commit_url"),
      committedAt: text("source_committed_at"),
      publishedProofAt: text("published_proof_at"),
      publishedProofNotes: text("published_proof_notes"),
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
    const { createExecutionStore, fetchPublicPage } = await import("./execute.server");
    const { checkPublishedPage } = await import("./execute");
    return checkPublishedPage({
      store: createExecutionStore(supabaseAdmin, context.supabase),
      fetchPage: fetchPublicPage,
      requestId: data.id,
      actorId: context.userId,
    });
  });
