import {
  applyExactReplacements,
  buildCommitMessage,
  commitMarker,
  type FieldChange,
  verifyPublishedHtml,
  type PublishedProof,
} from "./source-change";

/**
 * The execution loop, with every side effect injected. The rules that decide
 * whether a commit may happen, and whether a live page counts as proof, are
 * therefore testable without touching GitHub or the database.
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
  kind: "source_commit" | "publish_check";
  status: "committed" | "replayed" | "refused" | "failed" | "verified" | "pending";
  commitSha?: string | null;
  commitUrl?: string | null;
  error?: string | null;
  detail?: Record<string, unknown>;
};

export type ExecutionStore = {
  load(id: string): Promise<ExecutableRequest | null>;
  recordAttempt(attempt: AttemptRecord): Promise<void>;
  saveCommit(input: { id: string; commitSha: string; commitUrl: string }): Promise<void>;
  savePublishedProof(input: { id: string; notes: string }): Promise<void>;
  markApplied(input: { id: string; notes: string; revision: string }): Promise<void>;
};

export type GithubApi = {
  branchHead(repo: string, branch: string): Promise<string>;
  readFile(repo: string, path: string, ref: string): Promise<{ sha: string; content: string }>;
  commitFile(input: {
    repo: string;
    branch: string;
    path: string;
    content: string;
    fileSha: string;
    message: string;
  }): Promise<{ commitSha: string; commitUrl: string }>;
};

export type ExecutionOutcome = {
  status: "committed" | "replayed" | "refused" | "failed";
  message: string;
  commitSha?: string;
  commitUrl?: string;
};

export async function executeSourceChange(input: {
  store: ExecutionStore;
  github: GithubApi | null;
  requestId: string;
  actorId: string;
}): Promise<ExecutionOutcome> {
  const request = await input.store.load(input.requestId);
  if (!request) throw new Error("That change request is not visible to this account.");

  const refuse = async (reason: string): Promise<ExecutionOutcome> => {
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "source_commit",
      status: "refused",
      error: reason,
    });
    return { status: "refused", message: reason };
  };

  // Replay: the commit already exists, so the answer is the existing result.
  if (request.commitSha) {
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
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
  if (!input.github) {
    return refuse(
      "Executor credential missing. No GitHub executor token is configured, so no commit was attempted.",
    );
  }
  if (!request.repo || !request.branch || !request.filePath) {
    return refuse("Refused without writing: this change request stores no repository, branch, or file.");
  }

  let head: string;
  let file: { sha: string; content: string };
  try {
    head = await input.github.branchHead(request.repo, request.branch);
    file = await input.github.readFile(request.repo, request.filePath, head);
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub read failed.";
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "source_commit",
      status: "failed",
      error: message,
    });
    return { status: "failed", message: `No commit was created. ${message}` };
  }

  const applied = applyExactReplacements(file.content, request.changes);
  if (!applied.ok) return refuse(applied.reason);
  if (applied.value.alreadyApplied) {
    return refuse(
      "Refused without writing: the file already contains both approved new values, but AOOS has no commit on record for this change request. Record the existing commit before executing again.",
    );
  }

  try {
    const result = await input.github.commitFile({
      repo: request.repo,
      branch: request.branch,
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
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "source_commit",
      status: "committed",
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      detail: {
        headBeforeCommit: head,
        baseRevision: request.baseRevision,
        marker: commitMarker(request.id),
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
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "source_commit",
      status: "failed",
      error: message,
    });
    return { status: "failed", message: `No commit was recorded. ${message}` };
  }
}

export type PublishCheckOutcome = {
  status: "verified" | "pending" | "refused" | "failed";
  message: string;
  proof?: PublishedProof;
};

export async function checkPublishedPage(input: {
  store: ExecutionStore;
  fetchPage: (url: string) => Promise<{ status: number; html: string }>;
  requestId: string;
  actorId: string;
}): Promise<PublishCheckOutcome> {
  const request = await input.store.load(input.requestId);
  if (!request) throw new Error("That change request is not visible to this account.");

  if (!request.commitSha) {
    const reason =
      "There is no recorded source commit for this change request, so there is nothing to prove on the public page.";
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "publish_check",
      status: "refused",
      error: reason,
    });
    return { status: "refused", message: reason };
  }

  let page: { status: number; html: string };
  try {
    page = await input.fetchPage(request.targetUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetching the public page failed.";
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "publish_check",
      status: "failed",
      error: message,
    });
    return { status: "failed", message };
  }

  if (page.status < 200 || page.status >= 300) {
    const message = `The public page returned HTTP ${page.status}, so nothing was proven.`;
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "publish_check",
      status: "failed",
      error: message,
    });
    return { status: "failed", message };
  }

  const proof = verifyPublishedHtml(page.html, request.changes);
  if (!proof.ok) {
    await input.store.recordAttempt({
      tenantId: request.tenantId,
      changeRequestId: request.id,
      actorId: input.actorId,
      kind: "publish_check",
      status: "pending",
      error: proof.reason,
      detail: { foundTitle: proof.foundTitle, foundHeading: proof.foundHeading },
    });
    return { status: "pending", message: proof.reason, proof };
  }

  if (!request.publishedProofAt) {
    await input.store.savePublishedProof({
      id: request.id,
      notes: `Public page served the approved title and H1 for ${request.targetUrl}.`,
    });
    await input.store.markApplied({
      id: request.id,
      notes: `Proven live on ${request.targetUrl}: exact approved title and H1 served.`,
      revision: request.commitSha,
    });
  }

  await input.store.recordAttempt({
    tenantId: request.tenantId,
    changeRequestId: request.id,
    actorId: input.actorId,
    kind: "publish_check",
    status: "verified",
    commitSha: request.commitSha,
    detail: { foundTitle: proof.foundTitle, foundHeading: proof.foundHeading },
  });
  return {
    status: "verified",
    message:
      "The public page serves the approved title and H1. The post-change Search Console window starts now. Outcome is not verified until finalized data arrives.",
    proof,
  };
}
