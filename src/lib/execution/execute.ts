import { checkSourceTarget, checkTargetUrl } from "./allowlist";
import {
  applyExactReplacements,
  buildCommitMessage,
  buildRevertCommitMessage,
  commitMarker,
  type FieldChange,
  revertCommitMarker,
  verifyRenderedPage,
  type PublishedProof,
  type RenderedPage,
} from "./source-change";

/**
 * The execution loop, with every side effect injected. The rules that decide
 * whether a commit may happen, and whether a live page counts as proof, are
 * therefore testable without touching GitHub, Firecrawl, or the database.
 */

export type ExecutableRequest = {
  id: string;
  tenantId: string;
  state: string;
  title: string;
  targetUrl: string;
  repo: string | null;
  branch: string | null;
  filePath: string | null;
  projectId: string | null;
  baseRevision: string | null;
  changes: FieldChange[];
  commitSha: string | null;
  commitUrl: string | null;
  publishedProofAt: string | null;
};

export type AttemptRecord = {
  tenantId: string;
  changeRequestId: string;
  actorId: string;
  kind: "source_commit" | "source_revert" | "publish_check" | "preflight";
  status:
    | "committed"
    | "reconciled"
    | "replayed"
    | "refused"
    | "failed"
    | "verified"
    | "pending"
    | "proved"
    | "reverted";
  commitSha?: string | null;
  commitUrl?: string | null;
  error?: string | null;
  detail?: Record<string, unknown>;
};

export type ExecutionStore = {
  load(id: string): Promise<ExecutableRequest | null>;
  recordAttempt(attempt: AttemptRecord): Promise<void>;
  /** Must affect exactly one row or throw. */
  saveCommit(input: { id: string; commitSha: string; commitUrl: string }): Promise<void>;
  /**
   * One database routine that records the rendered proof and moves the request
   * to applied together, or does neither.
   */
  applyRenderedProof(input: {
    id: string;
    notes: string;
    revision: string;
    proof: PublishedProof;
  }): Promise<{ changed: boolean; warning?: string }>;
};

export type GithubApi = {
  branchHead(repo: string, branch: string): Promise<string>;
  readFile(repo: string, path: string, ref: string): Promise<{ sha: string; content: string }>;
  /** Recent commits touching the file, newest first, for marker reconciliation. */
  findCommitByMarker(input: {
    repo: string;
    branch: string;
    path: string;
    marker: string;
  }): Promise<{ commitSha: string; commitUrl: string } | null>;
  commitFile(input: {
    repo: string;
    branch: string;
    path: string;
    content: string;
    fileSha: string;
    message: string;
  }): Promise<{ commitSha: string; commitUrl: string }>;
};

/** Reads one rendered page. Returns null when no renderer credential exists. */
export type RenderedVerifier = {
  name: string;
  render(url: string): Promise<RenderedPage>;
};

export type ExecutionOutcome = {
  status: "committed" | "reconciled" | "replayed" | "refused" | "failed";
  message: string;
  commitSha?: string;
  commitUrl?: string;
};

/**
 * One drift rule for both directions of a write. A forward commit is computed
 * against the revision the change was proposed on; a revert is computed against
 * the commit it undoes. Either way the branch head must still be that revision.
 */
function branchHeadDrift(input: {
  head: string;
  expected: string;
  expectedDescription: string;
}): string | null {
  if (input.head === input.expected) return null;
  return `Refused without writing: the branch head is ${input.head.slice(0, 10)} but ${input.expectedDescription} ${input.expected.slice(0, 10)}. Re-observe the source before executing.`;
}

export async function executeSourceChange(input: {
  store: ExecutionStore;
  github: GithubApi | null;
  requestId: string;
  actorId: string;
}): Promise<ExecutionOutcome> {
  const request = await input.store.load(input.requestId);
  if (!request) throw new Error("That change request is not visible to this account.");

  const record = async (
    attempt: Omit<AttemptRecord, "tenantId" | "changeRequestId" | "actorId">,
  ) => {
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      ...attempt,
    });
  };

  const refuse = async (reason: string): Promise<ExecutionOutcome> => {
    await record({ kind: "source_commit", status: "refused", error: reason });
    return { status: "refused", message: reason };
  };

  const fail = async (message: string): Promise<ExecutionOutcome> => {
    await record({ kind: "source_commit", status: "failed", error: message });
    return { status: "failed", message: `No commit was created. ${message}` };
  };

  // Replay: the commit already exists, so the answer is the existing result.
  if (request.commitSha) {
    await record({
      kind: "source_commit",
      status: "replayed",
      commitSha: request.commitSha,
      commitUrl: request.commitUrl,
    });
    return {
      status: "replayed",
      message: "This change was already committed. No second commit was created.",
      commitSha: request.commitSha,
      ...(request.commitUrl ? { commitUrl: request.commitUrl } : {}),
    };
  }

  if (request.state !== "approved") {
    return refuse(
      `Refused without writing: only an approved change request can be executed. This one is ${request.state}.`,
    );
  }

  const allowed = checkSourceTarget({
    repo: request.repo,
    branch: request.branch,
    filePath: request.filePath,
    projectId: request.projectId,
  });
  if (!allowed.ok) return refuse(allowed.reason);
  if (!request.filePath) {
    return refuse("Refused without writing: this change request stores no source file.");
  }

  if (!request.baseRevision) {
    return refuse(
      "Refused without writing: this change request stores no observed base revision, so a stale write cannot be ruled out.",
    );
  }
  if (!input.github) {
    return refuse(
      "Executor credential missing. No GitHub executor token is configured, so no commit was attempted.",
    );
  }

  const { repo, branch } = allowed.value;
  const marker = commitMarker(request.id);

  // Unrecorded-commit hole: a previous attempt may have written and then failed
  // to record. Look for our exact marker before considering another write.
  let existing: { commitSha: string; commitUrl: string } | null;
  let head: string;
  try {
    existing = await input.github.findCommitByMarker({
      repo,
      branch,
      path: request.filePath,
      marker,
    });
    head = await input.github.branchHead(repo, branch);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "GitHub read failed.");
  }

  if (existing) {
    await input.store.saveCommit({
      id: request.id,
      commitSha: existing.commitSha,
      commitUrl: existing.commitUrl,
    });
    await record({
      kind: "source_commit",
      status: "reconciled",
      commitSha: existing.commitSha,
      commitUrl: existing.commitUrl,
      detail: { marker, reason: "commit_found_by_marker" },
    });
    return {
      status: "reconciled",
      message:
        "A commit carrying this change request's marker already existed in the branch. AOOS recorded it instead of writing a second time.",
      commitSha: existing.commitSha,
      commitUrl: existing.commitUrl,
    };
  }

  const drift = branchHeadDrift({
    head,
    expected: request.baseRevision,
    expectedDescription: "this change was proposed against",
  });
  if (drift) return refuse(drift);

  let file: { sha: string; content: string };
  try {
    file = await input.github.readFile(repo, request.filePath, head);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "GitHub read failed.");
  }

  const applied = applyExactReplacements(file.content, request.changes);
  if (!applied.ok) return refuse(applied.reason);
  if (applied.value.alreadyApplied) {
    return refuse(
      "Refused without writing: the file already contains both approved new values, but no commit carrying this change request's marker exists. Record the existing commit before executing again.",
    );
  }

  try {
    const result = await input.github.commitFile({
      repo,
      branch,
      path: request.filePath,
      content: applied.value.content,
      fileSha: file.sha,
      message: buildCommitMessage(request.id, request.title),
    });
    await input.store.saveCommit({
      id: request.id,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
    });
    await record({
      kind: "source_commit",
      status: "committed",
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      detail: {
        headBeforeCommit: head,
        baseRevision: request.baseRevision,
        marker,
        replacements: applied.value.replaced,
      },
    });
    return {
      status: "committed",
      message:
        "Source committed. The public page is not proven changed yet, so this is not applied and not live.",
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub write failed.";
    await record({ kind: "source_commit", status: "failed", error: message });
    return {
      status: "failed",
      message: `The write was attempted and did not complete cleanly. ${message} Run this again: AOOS checks for an existing commit carrying this change request's marker before writing anything.`,
    };
  }
}

export type RevertOutcome = {
  status: "reverted" | "reconciled" | "refused" | "failed";
  message: string;
  commitSha?: string;
  commitUrl?: string;
};

/**
 * Undo a committed change by writing its recorded before values back. The
 * rollback state is only allowed to claim a revert happened once this has
 * recorded a revert commit, so a refusal here has to leave the state alone.
 */
export async function revertSourceChange(input: {
  store: ExecutionStore;
  github: GithubApi | null;
  requestId: string;
  actorId: string;
}): Promise<RevertOutcome> {
  const request = await input.store.load(input.requestId);
  if (!request) throw new Error("That change request is not visible to this account.");

  const record = async (
    attempt: Omit<AttemptRecord, "tenantId" | "changeRequestId" | "actorId">,
  ) => {
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      ...attempt,
    });
  };

  const refuse = async (reason: string): Promise<RevertOutcome> => {
    await record({ kind: "source_revert", status: "refused", error: reason });
    return { status: "refused", message: reason };
  };

  const fail = async (message: string): Promise<RevertOutcome> => {
    await record({ kind: "source_revert", status: "failed", error: message });
    return { status: "failed", message: `No revert commit was created. ${message}` };
  };

  // The executor's own precondition has to match the states the roll_back
  // transition accepts, or this writes production commits for a request the
  // database will then refuse to move.
  if (request.state !== "applied" && request.state !== "verified") {
    return refuse(
      `Refused without writing: only an applied or verified change request can be reverted. This one is ${request.state}.`,
    );
  }

  if (!request.commitSha) {
    return refuse(
      "Refused without writing: no source commit is recorded for this change request, so there is nothing to revert.",
    );
  }

  const allowed = checkSourceTarget({
    repo: request.repo,
    branch: request.branch,
    filePath: request.filePath,
    projectId: request.projectId,
  });
  if (!allowed.ok) return refuse(allowed.reason);
  if (!request.filePath) {
    return refuse("Refused without writing: this change request stores no source file.");
  }
  if (!input.github) {
    return refuse(
      "Executor credential missing. No GitHub executor token is configured, so no revert was attempted.",
    );
  }

  const { repo, branch } = allowed.value;
  const marker = revertCommitMarker(request.id);

  // A revert that lands leaves the head past the commit it undid, so the drift
  // rule below would refuse every retry. Searching for the revert marker first
  // is the only way an unrecorded revert commit can still be recorded.
  let existing: { commitSha: string; commitUrl: string } | null;
  let head: string;
  try {
    existing = await input.github.findCommitByMarker({
      repo,
      branch,
      path: request.filePath,
      marker,
    });
    head = await input.github.branchHead(repo, branch);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "GitHub read failed.");
  }

  if (existing) {
    await record({
      kind: "source_revert",
      status: "reconciled",
      commitSha: existing.commitSha,
      commitUrl: existing.commitUrl,
      detail: { marker, revertedCommitSha: request.commitSha, reason: "commit_found_by_marker" },
    });
    return {
      status: "reconciled",
      message:
        "A commit carrying this change request's revert marker already existed in the branch. AOOS recorded it instead of writing a second time.",
      commitSha: existing.commitSha,
      commitUrl: existing.commitUrl,
    };
  }

  const drift = branchHeadDrift({
    head,
    expected: request.commitSha,
    expectedDescription: "this change was committed as",
  });
  if (drift) return refuse(drift);

  let file: { sha: string; content: string };
  try {
    file = await input.github.readFile(repo, request.filePath, head);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "GitHub read failed.");
  }

  // Undoing a sequence of edits runs it backwards: the replacement applied last
  // is the one whose result is still intact, so it is the one undone first.
  const reversed = [...request.changes].reverse().map((change) => ({
    ...change,
    before: change.after,
    after: change.before,
  }));
  const applied = applyExactReplacements(file.content, reversed);
  if (!applied.ok) return refuse(applied.reason);
  if (applied.value.alreadyApplied) {
    return refuse(
      "Refused without writing: the file already holds the values this change replaced, so no revert commit is needed and none was created.",
    );
  }

  try {
    const result = await input.github.commitFile({
      repo,
      branch,
      path: request.filePath,
      content: applied.value.content,
      fileSha: file.sha,
      message: buildRevertCommitMessage(request.id, request.title),
    });
    await record({
      kind: "source_revert",
      status: "reverted",
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      detail: {
        revertedCommitSha: request.commitSha,
        headBeforeCommit: head,
        marker,
        replacements: applied.value.replaced,
      },
    });
    return {
      status: "reverted",
      message:
        "The previous wording was committed back to the site source. The public page is not proven reverted until it is rendered again.",
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
    };
  } catch (error) {
    // A write that errors after GitHub applied it leaves a real revert commit,
    // so this must not claim none exists.
    const message = error instanceof Error ? error.message : "GitHub write failed.";
    await record({ kind: "source_revert", status: "failed", error: message });
    return {
      status: "failed",
      message: `The write was attempted and did not complete cleanly. ${message} Run this again: AOOS checks for an existing commit carrying this change request's revert marker before writing anything.`,
    };
  }
}

export type PublishCheckOutcome = {
  status: "verified" | "pending" | "refused" | "failed";
  message: string;
  proof?: PublishedProof;
  warning?: string;
};

export async function checkPublishedPage(input: {
  store: ExecutionStore;
  renderer: RenderedVerifier | null;
  requestId: string;
  actorId: string;
}): Promise<PublishCheckOutcome> {
  const request = await input.store.load(input.requestId);
  if (!request) throw new Error("That change request is not visible to this account.");

  const record = async (
    attempt: Omit<AttemptRecord, "tenantId" | "changeRequestId" | "actorId">,
  ) => {
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      ...attempt,
    });
  };

  const refuse = async (reason: string): Promise<PublishCheckOutcome> => {
    await record({ kind: "publish_check", status: "refused", error: reason });
    return { status: "refused", message: reason };
  };

  if (!request.commitSha) {
    return refuse(
      "There is no recorded source commit for this change request, so there is nothing to prove on the public page.",
    );
  }

  const target = checkTargetUrl(request.targetUrl);
  if (!target.ok) return refuse(target.reason);

  if (!input.renderer) {
    return refuse(
      "Rendered-page verification is not connected. This site renders its title and H1 with JavaScript, so raw HTML cannot prove anything. Connect the Firecrawl credential (FIRECRAWL_API_KEY) to enable this check.",
    );
  }

  let page: RenderedPage;
  try {
    page = await input.renderer.render(target.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rendering the public page failed.";
    await record({ kind: "publish_check", status: "failed", error: message });
    return { status: "failed", message };
  }

  const finalUrl = checkTargetUrl(page.finalUrl);
  if (!finalUrl.ok) {
    const message = `The rendered page resolved to ${page.finalUrl}, which is outside the allowlisted site. Nothing was proven.`;
    await record({ kind: "publish_check", status: "failed", error: message });
    return { status: "failed", message };
  }

  const proof = verifyRenderedPage(page, request.changes);
  const provenValues = proof.expectedDescription ? "meta description" : "title and H1";
  if (!proof.ok) {
    await record({
      kind: "publish_check",
      status: "pending",
      error: proof.reason,
      detail: {
        foundTitle: proof.foundTitle,
        foundHeading: proof.foundHeading,
        foundDescription: proof.foundDescription,
        renderedBy: proof.renderedBy,
      },
    });
    return { status: "pending", message: proof.reason, proof };
  }

  let changed = false;
  let warning: string | undefined;
  if (!request.publishedProofAt) {
    const result = await input.store.applyRenderedProof({
      id: request.id,
      notes: `Rendered page at ${proof.finalUrl} served the approved ${provenValues}, as rendered by ${proof.renderedBy}.`,
      revision: request.commitSha,
      proof,
    });
    changed = result.changed;
    warning = result.warning;
  }

  await record({
    kind: "publish_check",
    status: "verified",
    commitSha: request.commitSha,
    detail: {
      foundTitle: proof.foundTitle,
      foundHeading: proof.foundHeading,
      foundDescription: proof.foundDescription,
      renderedBy: proof.renderedBy,
      appliedNow: changed,
      ...(warning ? { measurementFollowupWarning: warning } : {}),
    },
  });
  return {
    status: "verified",
    message: warning
      ? `The rendered public page serves the approved ${provenValues}. The change is applied, but measurement follow-up needs a retry: ${warning}`
      : `The rendered public page serves the approved ${provenValues}. The post-change Search Console window starts now. Outcome is not verified until finalized data arrives.`,
    proof,
    ...(warning ? { warning } : {}),
  };
}
