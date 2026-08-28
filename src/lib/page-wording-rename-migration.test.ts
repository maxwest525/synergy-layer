import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260828140000_rename_title_h1_lane_to_page_wording.sql",
    import.meta.url,
  ),
  "utf8",
);

/**
 * The rename itself is mechanical. What is worth pinning is the property that
 * makes it safe to deploy: code and database can land in either order without
 * a window where proposals cannot be filed.
 */
describe("the lane rename is safe in either deploy order", () => {
  it("accepts both the old and the new proposal type while the deploy settles", () => {
    expect(sql).toMatch(
      /CHECK \(proposal_type IN \('title_h1', 'page_wording', 'page_metadata', 'site\.crawl_directives'\)\)/,
    );
  });

  it("opens a measurement cycle under either name, so no change goes ungraded", () => {
    const gates = sql.match(
      /IF NEW\.proposal_type NOT IN \('title_h1', 'page_wording', 'page_metadata'\) THEN RETURN NEW; END IF;/g,
    );
    expect(gates).toHaveLength(2);
  });

  it("adds the new RPC names without removing the old ones", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_page_wording_proposal/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.revise_page_wording_proposal/);
    // Wrappers, not renames: both names must resolve during the window.
    expect(sql).toMatch(/SELECT public\.create_title_h1_proposal\(/);
    expect(sql).toMatch(/SELECT public\.revise_title_h1_proposal\(/);
    expect(sql).not.toMatch(/DROP FUNCTION/);
  });

  it("re-enables the approved-content guard it had to switch off to move the rows", () => {
    // Every stored row has left the proposed state, so the guard refuses a
    // proposal_type change; it cannot tell a rename from a tamper. It is off
    // for one statement and must be on again immediately after.
    const disabled = sql.indexOf("DISABLE TRIGGER lock_approved_title_h1_content");
    const update = sql.indexOf("SET proposal_type = 'page_wording'");
    const enabled = sql.indexOf("ENABLE TRIGGER lock_approved_title_h1_content");
    expect(disabled).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(disabled);
    expect(enabled).toBeGreaterThan(update);
  });

  it("leaves the narrowing cleanup to its own migration", () => {
    // Narrowing the constraint and dropping the old names in the same file is
    // what would make this risky, so it is deliberately absent.
    expect(sql).toMatch(/follow-up migration narrows the constraint/i);
  });
});
