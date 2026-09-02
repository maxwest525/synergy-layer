import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902010000_approval_names_the_change_in_flight.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("approval names the change still in flight on the same page", () => {
  it("replaces the transition routine and retires the old signature so the RPC stays unambiguous", () => {
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.transition_change_request\(uuid, text, text, text\);/,
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.transition_change_request/);
    expect(sql).toMatch(/_acknowledge_in_flight boolean DEFAULT false/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.transition_change_request\(uuid, text, text, text, boolean\) TO authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.transition_change_request\(uuid, text, text, text, boolean\) FROM PUBLIC, anon/,
    );
  });

  it("refuses an unacknowledged approval while a sibling is approved or still being measured", () => {
    expect(sql).toMatch(/IF _action = 'approve' THEN\s+SELECT s\.\* INTO v_sibling/);
    expect(sql).toMatch(/s\.target_url = v_row\.target_url/);
    expect(sql).toMatch(/s\.id <> v_row\.id/);
    expect(sql).toMatch(/s\.state = 'approved'/);
    expect(sql).toMatch(/s\.state = 'applied'/);
    expect(sql).toMatch(/w\.available_after_pt > v_today_pt/);
    expect(sql).toMatch(/IF FOUND AND NOT COALESCE\(_acknowledge_in_flight, false\) THEN/);
    expect(sql).toMatch(/Another change to this page is still in flight/);
  });

  it("reads today as a Pacific calendar date, the same clock the measurement windows use", () => {
    expect(sql).toMatch(/\(now\(\) AT TIME ZONE 'America\/Los_Angeles'\)::date/);
  });

  it("records a deliberate double approval on the audit event", () => {
    expect(sql).toMatch(/'acknowledgedInFlightChangeId'/);
  });

  it("keeps every guard the transition already enforced", () => {
    expect(sql).toMatch(/Only an operator or admin can decide a change request\./);
    expect(sql).toMatch(/A change request that is % cannot move to %\./);
    expect(sql).toMatch(/Waiting for finalized post-change Search Console data\./);
    expect(sql).toMatch(/IF _action = 'roll_back' THEN/);
    expect(sql).toMatch(/e\.status IN \('reverted', 'reconciled'\)/);
    expect(sql).toMatch(/WHEN _action = 'roll_back' THEN v_revert_sha/);
  });
});
