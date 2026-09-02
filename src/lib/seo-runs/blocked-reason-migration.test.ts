import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20260902080000_seo_runs_say_why_they_are_blocked.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("a blocked SEO run says why", () => {
  it("lets the lane carry its current name and moves the stored rows", () => {
    expect(sql).toMatch(/CHECK \(change_type IN \('title_h1', 'page_wording'\)\)/);
    expect(sql).toMatch(/ALTER COLUMN change_type SET DEFAULT 'page_wording'/);
    expect(sql).toMatch(/SET change_type = 'page_wording'\s+WHERE change_type = 'title_h1'/);
  });

  it("backfills the reason from each run's latest preflight event, and only where none is stored", () => {
    expect(sql).toMatch(/'Preflight blocked the run: '/);
    expect(sql).toMatch(/e\.payload->'missingConnectors'/);
    expect(sql).toMatch(/e\.payload->'unhealthyConnectors'/);
    expect(sql).toMatch(/e\.payload->'missingEvidence'/);
    expect(sql).toMatch(
      /WHERE e\.run_id = r\.id AND e\.state = 'preflight_blocked'\s+ORDER BY e\.created_at DESC\s+LIMIT 1/,
    );
    expect(sql).toMatch(/WHERE r\.state = 'preflight_blocked' AND r\.failure_reason IS NULL;/);
  });

  it("deletes nothing", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).not.toMatch(/DELETE|DROP TABLE|DROP COLUMN/);
  });
});
