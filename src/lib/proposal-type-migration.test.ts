import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260819213000_widen_proposal_type_check.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("change request proposal type contract", () => {
  it("replaces the title-only CHECK without editing the original migration", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.change_requests\s+DROP CONSTRAINT IF EXISTS change_requests_proposal_type_check/,
    );
    expect(sql).toMatch(/ADD CONSTRAINT change_requests_proposal_type_check/);
  });

  it("admits every proposal type a governed writer files, and nothing else", () => {
    expect(sql).toMatch(
      /CHECK \(proposal_type IN \('title_h1', 'page_metadata', 'site\.crawl_directives'\)\)/,
    );
  });

  it("locks approved wording for every proposal type, not only title/H1", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.lock_approved_title_h1_content/);
    expect(sql).not.toMatch(/OLD\.proposal_type = 'title_h1'/);
    expect(sql).toMatch(/IF OLD\.state <> 'proposed' AND \(/);
  });

  it("teaches the rendered-proof routine the page metadata lane", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_change_request_rendered_proof/);
    expect(sql).toMatch(/'src\/components\/seo\/SeoHead\.tsx'/);
    expect(sql).toMatch(/'src\/components\/seo\/DefaultSeo\.tsx'/);
    expect(sql).toMatch(/c->>'field' = 'meta_description'/);
    expect(sql).toMatch(/_proof->>'foundDescription' IS DISTINCT FROM v_expected_description/);
  });
});
