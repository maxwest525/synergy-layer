import { checkSourceTarget } from "./allowlist";
import { describeGithubFailure } from "./github-error";
import type { AttemptRecord, ExecutionStore, GithubApi } from "./execute";
import { countOccurrences } from "./source-change";

/**
 * Read-only GitHub preflight.
 *
 * "A credential is configured" and "a credential can actually read the exact
 * governed file at the exact approved revision" are different claims. This
 * proves the second one using the real token, performs zero writes, and leaves
 * the change request in whatever state it was already in.
 */

export type PreflightOutcome = {
  status: "proved" | "failed";
  reason: string;
  checkedAt: string;
  repo: string | null;
  branch: string | null;
  filePath: string | null;
  head: string | null;
  fileSha: string | null;
};

export async function runGithubPreflight(input: {
  store: ExecutionStore;
  github: GithubApi | null;
  requestId: string;
  actorId: string;
  now?: () => string;
}): Promise<PreflightOutcome> {
  const checkedAt = (input.now ?? (() => new Date().toISOString()))();
  const request = await input.store.load(input.requestId);
  if (!request) throw new Error("That change request is not visible to this account.");

  const base = {
    checkedAt,
    repo: request.repo,
    branch: request.branch,
    filePath: request.filePath,
    head: null as string | null,
    fileSha: null as string | null,
  };

  const record = async (
    outcome: PreflightOutcome,
    detail: Record<string, unknown> = {},
  ): Promise<PreflightOutcome> => {
    const attempt: AttemptRecord = {
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "preflight",
      status: outcome.status,
      error: outcome.status === "failed" ? outcome.reason : null,
      detail: {
        ...detail,
        checkedAt: outcome.checkedAt,
        repo: outcome.repo,
        branch: outcome.branch,
        filePath: outcome.filePath,
        head: outcome.head,
        reason: outcome.reason,
      },
    };
    await input.store.recordAttempt(attempt);
    return outcome;
  };

  const fail = (reason: string, extra: Partial<PreflightOutcome> = {}) =>
    record({ ...base, ...extra, status: "failed", reason });

  const allowed = checkSourceTarget({
    repo: request.repo,
    branch: request.branch,
    filePath: request.filePath,
    projectId: request.projectId,
  });
  if (!allowed.ok) return fail(allowed.reason);

  if (!request.baseRevision) {
    return fail(
      "This change request stores no observed base revision, so there is nothing to prove the branch head against.",
    );
  }
  if (request.changes.length === 0) {
    return fail("This change request stores no exact before/after values to check.");
  }
  if (!input.github) {
    return fail(
      "Missing credential: no GitHub executor token is configured, so no connection test was attempted.",
    );
  }

  const { repo, branch, filePath } = allowed.value;

  let head: string;
  try {
    head = await input.github.branchHead(repo, branch);
  } catch (error) {
    return fail(describeGithubFailure(error, `branch ${branch} of ${repo}`));
  }

  if (head !== request.baseRevision) {
    return fail(
      `Revision drift: the branch head is ${head.slice(0, 10)} but this change was proposed against ${request.baseRevision.slice(0, 10)}. Re-observe the source before approving.`,
      { head },
    );
  }

  let file: { sha: string; content: string };
  try {
    file = await input.github.readFile(repo, filePath, head);
  } catch (error) {
    return fail(describeGithubFailure(error, `${filePath} at ${head.slice(0, 10)}`), { head });
  }

  // The exact same simulation execution would run, so a proved preflight and a
  // refused execution can never disagree about the source.
  const simulated = applyExactReplacements(file.content, request.changes);
  if (!simulated.ok) {
    return fail(`Source mismatch: ${simulated.reason}`, { head, fileSha: file.sha });
  }
  if (simulated.value.alreadyApplied) {
    return fail(
      `Source mismatch: ${filePath} already contains both approved new values, so this change would not be applied again.`,
      { head, fileSha: file.sha },
    );
  }


  return record(
    {
      ...base,
      status: "proved",
      head,
      fileSha: file.sha,
      reason: `Proved with the configured token: ${repo} on ${branch} is at ${head.slice(0, 10)}, which equals the approved base revision, and ${filePath} still contains each approved before value exactly once and none of the new values. No write was made.`,
    },
    { checks: request.changes.length, readOnly: true },
  );
}
