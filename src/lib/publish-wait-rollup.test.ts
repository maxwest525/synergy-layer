import { describe, expect, it } from "vitest";

import {
  isWaitingOnPublish,
  publishWaitRollup,
  type WaitingChangeRow,
} from "./publish-wait-rollup";

function row(overrides: Partial<WaitingChangeRow> & { id: string }): WaitingChangeRow {
  return {
    title: `Change ${overrides.id}`,
    state: "approved",
    target_url: "https://trumoveinc.com/research",
    source_commit_sha: "abc123",
    source_committed_at: "2026-08-28T10:00:00Z",
    published_proof_at: null,
    ...overrides,
  };
}

describe("several approved changes waiting on one publish become one item", () => {
  it("counts only changes that are approved, committed, and not yet proven live", () => {
    expect(isWaitingOnPublish(row({ id: "a" }))).toBe(true);
    expect(isWaitingOnPublish(row({ id: "b", source_commit_sha: null }))).toBe(false);
    expect(isWaitingOnPublish(row({ id: "c", published_proof_at: "2026-08-30T00:00:00Z" }))).toBe(
      false,
    );
    expect(isWaitingOnPublish(row({ id: "d", state: "applied" }))).toBe(false);
    expect(isWaitingOnPublish(row({ id: "e", state: "proposed", source_commit_sha: null }))).toBe(
      false,
    );
  });

  it("files nothing for a single waiting change, which its own page already shows", () => {
    expect(publishWaitRollup([row({ id: "a" }), row({ id: "b", state: "applied" })])).toBeNull();
  });

  it("rolls two or more into one item that names the count, the blocker, and how long", () => {
    const rollup = publishWaitRollup([
      row({ id: "later", source_committed_at: "2026-08-29T09:00:00Z" }),
      row({ id: "earlier", source_committed_at: "2026-08-25T09:00:00Z" }),
      row({ id: "live", state: "applied", published_proof_at: "2026-08-14T00:00:00Z" }),
      row({ id: "uncommitted", source_commit_sha: null, source_committed_at: null }),
    ]);
    expect(rollup).not.toBeNull();
    expect(rollup?.count).toBe(2);
    expect(rollup?.changeIds).toEqual(["earlier", "later"]);
    expect(rollup?.waitingSince).toBe("2026-08-25T09:00:00Z");
    expect(rollup?.title).toBe(
      "2 approved changes are committed and waiting for the site to be published",
    );
    expect(rollup?.summary).toContain("share one blocker");
    expect(rollup?.summary).toContain("waited since 2026-08-25");
  });

  it("says nothing about how long when no commit time is recorded", () => {
    const rollup = publishWaitRollup([
      row({ id: "a", source_committed_at: null }),
      row({ id: "b", source_committed_at: null }),
    ]);
    expect(rollup?.waitingSince).toBeNull();
    expect(rollup?.summary).not.toContain("waited since");
  });
});
