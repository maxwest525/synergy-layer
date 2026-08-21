import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260821100000_rollback_requires_revert_commit.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("rollback transition contract", () => {
  it("replaces the transition routine without editing the original migration", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.transition_change_request/);
  });

  it("refuses a rollback that has no recorded revert commit", () => {
    expect(sql).toMatch(/IF _action = 'roll_back' THEN/);
    expect(sql).toMatch(/FROM public\.change_request_executions e/);
    expect(sql).toMatch(/e\.kind = 'source_revert'/);
    expect(sql).toMatch(/e\.status = 'reverted'/);
    expect(sql).toMatch(/e\.commit_sha IS NOT NULL/);
    expect(sql).toMatch(/IF v_revert_sha IS NULL THEN\s+RAISE EXCEPTION/);
  });

  it("leaves the revision the source now sits at pointing at the revert commit", () => {
    expect(sql).toMatch(/WHEN _action = 'roll_back' THEN v_revert_sha/);
  });

  it("keeps every other guard the transition already enforced", () => {
    expect(sql).toMatch(/Only an operator or admin can decide a change request\./);
    expect(sql).toMatch(/A change request that is % cannot move to %\./);
    expect(sql).toMatch(/Waiting for finalized post-change Search Console data\./);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.transition_change_request\(uuid, text, text, text\) TO authenticated/,
    );
  });
});
