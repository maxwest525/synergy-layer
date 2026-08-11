import { describe, expect, it } from "vitest";

import { reconcileExecutionFacts } from "./timeline";

describe("reconcileExecutionFacts", () => {
  it("uses lifecycle facts from the loaded change while the secondary execution query is pending", () => {
    expect(
      reconcileExecutionFacts(
        {
          sourceCommitSha: "961b222c832b40cecb8cc27a9319e5960ac743f3",
          sourceCommitUrl: "https://github.com/example/repo/commit/961b222c",
          sourceCommittedAt: "2026-08-11T22:23:10.079Z",
          publishedProofAt: "2026-08-11T22:57:55.672Z",
          publishedProofNotes: "Rendered title and H1 matched.",
        },
        undefined,
      ),
    ).toEqual({
      commitSha: "961b222c832b40cecb8cc27a9319e5960ac743f3",
      commitUrl: "https://github.com/example/repo/commit/961b222c",
      committedAt: "2026-08-11T22:23:10.079Z",
      publishedProofAt: "2026-08-11T22:57:55.672Z",
      publishedProofNotes: "Rendered title and H1 matched.",
    });
  });

  it("prefers freshly loaded execution facts when they are present", () => {
    expect(
      reconcileExecutionFacts(
        {
          sourceCommitSha: "stored-sha",
          sourceCommitUrl: null,
          sourceCommittedAt: null,
          publishedProofAt: null,
          publishedProofNotes: null,
        },
        {
          commitSha: "fresh-sha",
          commitUrl: "https://github.com/example/repo/commit/fresh-sha",
          committedAt: "2026-08-11T23:00:00.000Z",
          publishedProofAt: "2026-08-11T23:05:00.000Z",
          publishedProofNotes: "Fresh proof.",
        },
      ),
    ).toMatchObject({
      commitSha: "fresh-sha",
      publishedProofAt: "2026-08-11T23:05:00.000Z",
    });
  });
});
