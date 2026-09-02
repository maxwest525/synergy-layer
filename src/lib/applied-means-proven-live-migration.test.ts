import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902050000_applied_means_proven_live.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("applied means proven live, and there is no other way in", () => {
  it("refuses mark_applied by name before any state is read", () => {
    expect(sql).toMatch(
      /IF _action = 'mark_applied' THEN\s+RAISE EXCEPTION 'Applied means proven live on the public page\./,
    );
    expect(sql.indexOf("IF _action = 'mark_applied' THEN")).toBeLessThan(
      sql.indexOf("v_to := CASE _action"),
    );
  });

  it("drops the action from the result map, the allowed matrix, and the applied columns", () => {
    const body = sql.slice(sql.indexOf("v_to := CASE _action"));
    expect(body).not.toMatch(/WHEN 'mark_applied' THEN 'applied'/);
    expect(body).not.toMatch(/v_from = 'approved' AND _action = 'mark_applied'/);
    expect(body).not.toMatch(/applied_by = CASE WHEN _action = 'mark_applied'/);
    expect(body).not.toMatch(/applied_at = CASE WHEN _action = 'mark_applied'/);
    expect(body).not.toMatch(/applied_notes = CASE WHEN _action = 'mark_applied'/);
    expect(body).not.toMatch(/'mark_applied'/);
  });

  it("keeps every other guard of 20260902010000", () => {
    expect(sql).toMatch(/Only an operator or admin can decide a change request\./);
    expect(sql).toMatch(/Another change to this page is still in flight/);
    expect(sql).toMatch(/Waiting for finalized post-change Search Console data\./);
    expect(sql).toMatch(/rolling back is a commit, not a label\./);
    expect(sql).toMatch(/WHEN _action = 'roll_back' THEN v_revert_sha/);
    expect(sql).toMatch(/'acknowledgedInFlightChangeId'/);
    expect(sql).toMatch(/\(v_from = 'proposed' AND _action IN \('approve','reject'\)\)/);
    expect(sql).toMatch(/\(v_from = 'applied' AND _action IN \('verify','roll_back'\)\)/);
    expect(sql).toMatch(/\(v_from = 'verified' AND _action = 'roll_back'\)/);
  });
});
