import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260903020000_approval_keeps_what_it_was_given.sql",
    import.meta.url,
  ),
  "utf8",
);

const withoutComments = sql.replace(/^--.*$/gm, "");

describe("Approval keeps the evidence it was handed", () => {
  it("adds the three snapshot columns to tracked_keywords and nothing else", () => {
    expect(withoutComments).toContain("ALTER TABLE public.tracked_keywords");
    for (const column of [
      "approved_metrics jsonb",
      "approved_metrics_captured_at timestamptz",
      "approved_metrics_candidate_id uuid",
    ]) {
      expect(withoutComments).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect((withoutComments.match(/ADD COLUMN/g) ?? []).length).toBe(3);
  });

  it("is additive only: no drop, no rewrite of a row that already exists", () => {
    // The 50 keywords approved before today were approved without this column.
    // Backfilling them would date a reading to a click that happened weeks ago.
    expect(withoutComments).not.toMatch(/DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
    expect(withoutComments).not.toMatch(/^\s*UPDATE\s+public\./im);
  });

  it("carries a rollback and says why the columns are untyped jsonb", () => {
    expect(sql).toMatch(/Rollback:/);
    expect(sql).toContain("DROP COLUMN approved_metrics");
    // The shape is the provider's and unverified against a live snapshot, so
    // typed columns would be the invented-schema version of an invented
    // threshold. The migration has to say so.
    expect(sql).toMatch(/not been verified against a live snapshot/);
  });

  it("documents every column it adds", () => {
    expect((sql.match(/COMMENT ON COLUMN public\.tracked_keywords\./g) ?? []).length).toBe(3);
  });
});
