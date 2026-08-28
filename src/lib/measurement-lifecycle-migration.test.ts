import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260828100000_measure_page_metadata_changes.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("measurement lifecycle proposal-type contract", () => {
  it("admits both wording lanes, so meta description changes are measured like title/H1 ones", () => {
    const gates = sql.match(
      /IF NEW\.proposal_type NOT IN \('title_h1', 'page_metadata'\) THEN RETURN NEW; END IF;/g,
    );
    expect(gates).toHaveLength(2);
  });

  it("does not open a CTR-shaped cycle for crawl directives, whose outcome is indexation", () => {
    expect(sql).not.toMatch(/proposal_type NOT IN \([^)]*crawl_directives/);
    expect(sql).toMatch(/Deliberately NOT extended: `site\.crawl_directives`/);
  });

  it("keeps the grounded windows and introduces no new number", () => {
    for (const days of [14, 28, 56, 90]) {
      expect(sql).toContain(`${days}, 'rendered_live'`);
    }
    expect(sql).not.toMatch(/\(NEW\.tenant_id, v_cycle_id, 7,/);
  });

  it("backfills already-approved page metadata changes idempotently", () => {
    expect(sql).toMatch(/WHERE cr\.proposal_type = 'page_metadata'/);
    const idempotent = sql.match(
      /ON CONFLICT \((change_request_id|cycle_id, window_days)\) DO NOTHING/g,
    );
    expect(idempotent?.length).toBeGreaterThanOrEqual(3);
  });

  it("restores the live-anchor guard after the backfill, in the same migration", () => {
    expect(sql.indexOf("SET live_at = published_proof_at")).toBeLessThan(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.capture_change_measurement_lifecycle"),
    );
    expect(sql).toMatch(/The live anchor can only be set by a rendered published proof\./);
  });
});
