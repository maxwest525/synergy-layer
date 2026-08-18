import { describe, expect, it } from "vitest";

import {
  changeKindForFile,
  checkSourceTarget,
  GOVERNED_BRANCH,
  GOVERNED_CHANGE_KINDS,
  GOVERNED_FILE,
  GOVERNED_FILES,
  GOVERNED_PROJECT_ID,
  GOVERNED_REPO,
  isGovernedChangeKind,
} from "./allowlist";

const target = (filePath: string | null) =>
  checkSourceTarget({
    repo: GOVERNED_REPO,
    branch: GOVERNED_BRANCH,
    filePath,
    projectId: GOVERNED_PROJECT_ID,
  });

describe("governed change kinds", () => {
  it("keeps the original title and H1 target executable", () => {
    const outcome = target(GOVERNED_FILE);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.changeKind).toBe("service.title_h1");
  });

  it("allows every file declared by a governed kind", () => {
    for (const filePath of GOVERNED_FILES) {
      expect(target(filePath).ok).toBe(true);
    }
  });

  it("refuses a file no kind owns", () => {
    const outcome = target("src/pages/Index.tsx");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("no governed change kind owns");
  });

  it("refuses a missing file without writing", () => {
    expect(target(null).ok).toBe(false);
  });

  it("still refuses another repository", () => {
    const outcome = checkSourceTarget({
      repo: "someone/else",
      branch: GOVERNED_BRANCH,
      filePath: GOVERNED_FILE,
      projectId: GOVERNED_PROJECT_ID,
    });
    expect(outcome.ok).toBe(false);
  });

  it("maps files back to exactly one kind", () => {
    for (const [kind, files] of Object.entries(GOVERNED_CHANGE_KINDS)) {
      for (const filePath of files) expect(changeKindForFile(filePath)).toBe(kind);
    }
    expect(changeKindForFile("nope.txt")).toBeNull();
    expect(isGovernedChangeKind("page.metadata")).toBe(true);
    expect(isGovernedChangeKind("page.nonsense")).toBe(false);
  });
});
