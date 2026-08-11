/**
 * Hard allowlist for the only governed execution target.
 *
 * Stored change-request metadata still drives display and audit, but a
 * malformed or tampered row must never be able to point a broad write token at
 * another repository, branch, file, project, or site. Every write path, every
 * read-only preflight, and every rendered verification path checks these
 * constants first.
 */

import type { ExecutionResult } from "./source-change";

export const GOVERNED_REPO = "maxwest525/brittmove-829a7519";
export const GOVERNED_BRANCH = "main";
export const GOVERNED_PROJECT_ID = "3c0c30e5-798a-425c-b077-6d5e8cb04e5b";
export const GOVERNED_FILE = "src/pages/services/servicesData.ts";
export const GOVERNED_ORIGIN = "https://trumoveinc.com";

export type GovernedTarget = {
  repo: string;
  branch: string;
  filePath: string;
  projectId: string;
};

/**
 * The one repository, branch, file, and source project that may be touched.
 * Used identically by the read-only preflight and by execution, so a preflight
 * can never prove something a commit would not be allowed to write.
 */
export function checkSourceTarget(input: {
  repo: string | null;
  branch: string | null;
  filePath?: string | null;
  projectId?: string | null;
}): ExecutionResult<GovernedTarget> {
  if (input.repo !== GOVERNED_REPO || input.branch !== GOVERNED_BRANCH) {
    return {
      ok: false,
      reason: `Refused without writing: this executor is allowlisted to ${GOVERNED_REPO} on ${GOVERNED_BRANCH}. The stored change request points at ${input.repo ?? "no repository"} on ${input.branch ?? "no branch"}.`,
    };
  }
  if (input.filePath !== GOVERNED_FILE) {
    return {
      ok: false,
      reason: `Refused without writing: this executor is allowlisted to the single file ${GOVERNED_FILE}. The stored change request points at ${input.filePath ?? "no file"}.`,
    };
  }
  if (input.projectId !== GOVERNED_PROJECT_ID) {
    return {
      ok: false,
      reason: `Refused without writing: this executor is allowlisted to source project ${GOVERNED_PROJECT_ID}. The stored change request points at ${input.projectId ?? "no project"}.`,
    };
  }
  return {
    ok: true,
    value: {
      repo: GOVERNED_REPO,
      branch: GOVERNED_BRANCH,
      filePath: GOVERNED_FILE,
      projectId: GOVERNED_PROJECT_ID,
    },
  };
}

/** The public origin a rendered verification may read. */
export function checkTargetUrl(url: string | null): ExecutionResult<string> {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "");
  } catch {
    return { ok: false, reason: `Refused: ${url ?? "no target URL"} is not a valid URL.` };
  }
  if (parsed.origin !== GOVERNED_ORIGIN) {
    return {
      ok: false,
      reason: `Refused: rendered verification is allowlisted to ${GOVERNED_ORIGIN}. This change request targets ${parsed.origin}.`,
    };
  }
  return { ok: true, value: parsed.toString() };
}
