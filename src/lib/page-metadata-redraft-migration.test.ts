import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902140000_page_metadata_proposals_can_be_redrafted.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Page metadata proposals can be redrafted", () => {
  it("adds one service-role function that accepts only a proposed metadata draft", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).toContain(
      "CREATE OR REPLACE FUNCTION public.revise_page_metadata_proposal(",
    );
    expect(withoutComments).toContain("IF v_change.proposal_type <> 'page_metadata' THEN");
    expect(withoutComments).toContain("IF v_change.state <> 'proposed' THEN");
    expect(withoutComments).toContain("IF _revision_kind <> 'regenerate' THEN");
    expect(withoutComments).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.revise_page_metadata_proposal\([^)]*\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(withoutComments).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.revise_page_metadata_proposal\([^)]*\) TO service_role;/,
    );
    expect((withoutComments.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(1);
    expect(withoutComments).not.toMatch(/DROP|TRUNCATE|DELETE FROM/);
  });
});
