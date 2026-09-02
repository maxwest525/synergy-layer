import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseUuidInput } from "../server-input";
import {
  changeKindForFile,
  GOVERNED_BRANCH,
  GOVERNED_FILES,
  GOVERNED_ORIGIN,
  GOVERNED_PROJECT_ID,
  GOVERNED_REPO,
} from "./allowlist";

export type ExecutionAttemptView = {
  id: string;
  kind: string;
  status: string;
  commitSha: string | null;
  commitUrl: string | null;
  error: string | null;
  createdAt: string;
};

/**
 * Readiness states are deliberately not a boolean. A configured environment
 * variable is not a working credential, and only a live read-only check earns
 * the word "proven".
 */
export type ReadinessState = "proven" | "configured" | "stored" | "blocked";

export type ReadinessFact = {
  label: string;
  state: ReadinessState;
  detail: string;
};

export type PreflightView = {
  status: "proved" | "failed";
  checkedAt: string;
  reason: string;
  head: string | null;
  repo: string | null;
  branch: string | null;
  filePath: string | null;
};

export type ExecutionStateView = {
  isOperator: boolean;
  operatorCheckFailed: boolean;
  executorCredentialPresent: boolean;
  rendererCredentialPresent: boolean;
  rendererName: string | null;
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
  preflight: PreflightView | null;
  attempts: ExecutionAttemptView[];
};

export function buildReadiness(input: {
  executorCredentialPresent: boolean;
  rendererCredentialPresent: boolean;
  /** Which renderer would answer, so a proven read is not credited to the wrong one. */
  rendererName?: string | null;
  repo: string | null;
  branch: string | null;
  filePath: string | null;
  projectId: string | null;
  baseRevision: string | null;
  targetUrl: string | null;
  changeCount: number;
  preflight: PreflightView | null;
}): ReadinessFact[] {
  const repoOk =
    input.repo === GOVERNED_REPO &&
    input.branch === GOVERNED_BRANCH &&
    input.projectId === GOVERNED_PROJECT_ID;
  const changeKind = changeKindForFile(input.filePath);
  let originOk = false;
  try {
    originOk = new URL(input.targetUrl ?? "").origin === GOVERNED_ORIGIN;
  } catch {
    originOk = false;
  }

  const proved = input.preflight?.status === "proved" ? input.preflight : null;
  const failed = input.preflight?.status === "failed" ? input.preflight : null;

  const credentialFact: ReadinessFact = !input.executorCredentialPresent
    ? {
        label: "GitHub write credential",
        state: "blocked",
        detail:
          "No GitHub executor token is configured, so AOOS cannot read or commit this change.",
      }
    : proved
      ? {
          label: "GitHub write credential",
          state: "proven",
          detail: `Proven by a read-only connection test on ${proved.checkedAt.slice(0, 16).replace("T", " ")} UTC: the token read ${proved.repo} on ${proved.branch} at head ${proved.head?.slice(0, 10) ?? "unknown"} and the file ${proved.filePath}. No write was made, and a proven read is not a proven write.`,
        }
      : failed
        ? {
            label: "GitHub write credential",
            state: "blocked",
            detail: `The last connection test on ${failed.checkedAt.slice(0, 16).replace("T", " ")} UTC did not prove access: ${failed.reason}`,
          }
        : {
            label: "GitHub write credential",
            state: "configured",
            detail:
              "A GitHub executor token is configured but unproven. Run the connection test to prove it can actually read this repository, branch, and file.",
          };

  return [
    credentialFact,
    {
      label: "Allowlisted source",
      state: repoOk ? "stored" : "blocked",
      detail: repoOk
        ? `Writes are restricted to ${GOVERNED_REPO} on ${GOVERNED_BRANCH}, source project ${GOVERNED_PROJECT_ID}. This is stored configuration, checked again at execution time.`
        : `This request points at ${input.repo ?? "no repository"} on ${input.branch ?? "no branch"} in project ${input.projectId ?? "no project"}, which is outside the allowlist.`,
    },
    {
      label: "Exact source file",
      state: changeKind ? "stored" : "blocked",
      detail: changeKind
        ? `One allowlisted file will be edited: ${input.filePath} (change kind ${changeKind}).`
        : `No governed change kind owns ${input.filePath ?? "no file"}. The executor may only write ${GOVERNED_FILES.join(", ")}.`,
    },
    {
      label: "Base revision recorded",
      state: input.baseRevision ? (proved ? "proven" : "stored") : "blocked",
      detail: input.baseRevision
        ? proved
          ? `The live branch head equalled the approved base revision ${input.baseRevision.slice(0, 10)} at the last connection test.`
          : `Stored only: the branch head must still be ${input.baseRevision.slice(0, 10)} at execution time, or the write is refused.`
        : "No observed base revision is recorded, so a stale write cannot be ruled out.",
    },
    {
      label: "Exact before and after values",
      state: input.changeCount === 0 ? "blocked" : proved ? "proven" : "stored",
      detail:
        input.changeCount === 0
          ? "No exact before/after values are stored."
          : proved
            ? `Each of the ${input.changeCount} approved before values was found exactly once in the live file, and none of the new values were present.`
            : `${input.changeCount} exact replacement(s) are stored. Each approved before value must occur exactly once in the live file, or the write is refused.`,
    },
    {
      label: "Rendered-page verification",
      // The site serves prerendered HTML, so a free direct fetch of the page
      // is always available as the first proof source; a JavaScript renderer
      // is only the fallback for routes the prerender does not cover.
      state: "configured",
      detail: input.rendererCredentialPresent
        ? `Proof reads the page's own prerendered HTML first, at no charge. ${input.rendererName ?? "A renderer"} would render this proof as the fallback for client-only routes. No check has been made, so proof from ${GOVERNED_ORIGIN} has not been attempted.`
        : `Proof reads the page's own prerendered HTML directly, at no charge. No fallback renderer is configured for client-only routes: neither Crawl4AI nor a Firecrawl deployment, self-hosted or cloud.`,
    },

    {
      label: "Allowlisted public page",
      state: originOk ? "stored" : "blocked",
      detail: originOk
        ? `Verification only reads ${GOVERNED_ORIGIN}.`
        : `The target URL is outside ${GOVERNED_ORIGIN}, so verification would be refused.`,
    },
  ];
}

type AttemptRow = {
  id: string;
  kind: string;
  status: string;
  commit_sha: string | null;
  commit_url: string | null;
  error: string | null;
  created_at: string;
  detail?: unknown;
};

/** The most recent read-only preflight, read back from the execution audit. */
function latestPreflight(attempts: AttemptRow[]): PreflightView | null {
  const row = attempts.find((attempt) => attempt.kind === "preflight");
  if (!row) return null;
  const detail = (
    typeof row.detail === "object" && row.detail !== null
      ? (row.detail as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof detail[key] === "string" ? (detail[key] as string) : null;
  return {
    status: row.status === "proved" ? "proved" : "failed",
    checkedAt: text("checkedAt") ?? row.created_at,
    reason: text("reason") ?? row.error ?? "No reason was recorded.",
    head: text("head"),
    repo: text("repo"),
    branch: text("branch"),
    filePath: text("filePath"),
  };
}

export const getExecutionState = createServerFn({ method: "GET" })
  .inputValidator(parseUuidInput)
  .handler(async ({ data }): Promise<ExecutionStateView> => {
    const { createRequestClient } = await import("../tenant.server");
    const { fetchExecutionAttempts, createRenderedVerifier } = await import("./execute.server");
    const executorCredentialPresent = Boolean(process.env["GITHUB_EXECUTOR_TOKEN"]);
    // Ask the verifier's own chooser (Crawl4AI first, Firecrawl fallback), so
    // this view can never disagree with what a render would actually use.
    // Reading only the Firecrawl chooser here reported the renderer absent
    // while Crawl4AI was healthy and doing every audit render.
    const verifier = createRenderedVerifier();
    const rendererCredentialPresent = verifier !== null;
    const rendererName = verifier?.name ?? null;

    const empty: ExecutionStateView = {
      isOperator: false,
      operatorCheckFailed: false,
      executorCredentialPresent,
      rendererCredentialPresent,
      rendererName,
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
      preflight: null,
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

    const attempts = (await fetchExecutionAttempts(db, data.id)) as AttemptRow[];
    const preflight = latestPreflight(attempts);
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
      preflight,
      readiness: buildReadiness({
        executorCredentialPresent,
        rendererCredentialPresent,
        rendererName,
        repo: text("source_repo"),
        branch: text("source_branch"),
        filePath: row.source_file,
        projectId: text("source_project_id"),
        baseRevision: row.source_revision_before,
        targetUrl: row.target_url,
        changeCount,
        preflight,
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

/**
 * Operator-only, strictly read-only GitHub connection test. It makes GET
 * requests only, never transitions the change request, and stores a safe
 * timestamped result so a reload still shows when and what was proven.
 */
export const testGithubConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseUuidInput)
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createExecutionStore, createGithubApi } = await import("./execute.server");
    const { runGithubPreflight } = await import("./preflight");
    return runGithubPreflight({
      store: createExecutionStore(supabaseAdmin, context.supabase, context.userId),
      github: createGithubApi(),
      requestId: data.id,
      actorId: context.userId,
    });
  });

export const executeChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseUuidInput)
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { requireTenantId } = await import("../tenant.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createExecutionStore, createGithubApi } = await import("./execute.server");
    const { executeSourceChange } = await import("./execute");
    const { recordSeoRunExecutionStarted, recordSeoRunSourceExecutionResult } =
      await import("../seo-runs/execution.server");
    await recordSeoRunExecutionStarted(supabaseAdmin, tenantId, data.id, context.userId);
    let result;
    try {
      result = await executeSourceChange({
        store: createExecutionStore(supabaseAdmin, context.supabase, context.userId),
        github: createGithubApi(),
        requestId: data.id,
        actorId: context.userId,
      });
    } catch (error) {
      await recordSeoRunSourceExecutionResult(
        supabaseAdmin,
        tenantId,
        data.id,
        context.userId,
        "failed",
      );
      throw error;
    }
    await recordSeoRunSourceExecutionResult(
      supabaseAdmin,
      tenantId,
      data.id,
      context.userId,
      result.status,
    );
    return result;
  });

/**
 * The revert commit the rolled_back state now depends on. It is a separate
 * operator action from the transition so a refused revert leaves the change
 * request exactly where it was.
 */
export const revertChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseUuidInput)
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createExecutionStore, createGithubApi } = await import("./execute.server");
    const { revertSourceChange } = await import("./execute");
    return revertSourceChange({
      store: createExecutionStore(supabaseAdmin, context.supabase, context.userId),
      github: createGithubApi(),
      requestId: data.id,
      actorId: context.userId,
    });
  });

export const checkChangeRequestPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseUuidInput)
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { requireTenantId } = await import("../tenant.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      createDirectFetchVerifier,
      createExecutionStore,
      createRenderedVerifier,
      createRobotsProver,
    } = await import("./execute.server");
    const { checkPublishedPage } = await import("./execute");
    const result = await checkPublishedPage({
      store: createExecutionStore(supabaseAdmin, context.supabase, context.userId),
      renderer: createRenderedVerifier(),
      directFetcher: createDirectFetchVerifier(),
      robotsProver: createRobotsProver(),
      requestId: data.id,
      actorId: context.userId,
    });
    if (result.status === "verified" && result.proof?.finalUrl) {
      const { recordSeoRunRenderedProof } = await import("../seo-runs/execution.server");
      await recordSeoRunRenderedProof(
        supabaseAdmin,
        tenantId,
        data.id,
        context.userId,
        result.proof.finalUrl,
      );
    }
    // A proof is one of the two moments the group of changes waiting on the
    // site publish can change, so the group's one Inbox item is refreshed here
    // rather than a day later.
    const { reconcilePublishWaitRollup } = await import("../publish-wait-rollup.server");
    await reconcilePublishWaitRollup(supabaseAdmin, tenantId);
    return result;
  });
