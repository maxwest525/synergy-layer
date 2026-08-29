import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260828160000_page_wording_accepts_more_than_two_changes.sql",
    import.meta.url,
  ),
  "utf8",
);

/**
 * The operator's oldest complaint was that everything reverts to title and H1.
 * It was true, and it was a constraint rather than a habit: the create RPC
 * refused any change set that was not exactly two entries. These pin the lock
 * being removed without the protection it was crudely standing in for being
 * removed with it.
 */
describe("the page wording lane accepts more than two changes", () => {
  /**
   * Scoped to the create function's own body: the string `<> 2` also appears in
   * this migration's header, which explains the old constraint, and inside the
   * replace() that patches the revision function's stored source. Neither is a
   * live guard, and a whole-file match would fail on both.
   */
  const createBody = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.create_title_h1_proposal"),
    sql.indexOf("-- 3. Revision accepts the same shape"),
  );

  it("replaces the exactly-two equality with a floor of one", () => {
    expect(createBody).toMatch(/jsonb_array_length\(_changes\) < 1/);
    expect(createBody).not.toMatch(/jsonb_array_length\(_changes\) <> 2/);
    expect(createBody).toMatch(/requires at least one exact change/);
  });

  it("still requires the three evidence classes", () => {
    expect(sql).toMatch(/jsonb_array_length\(_evidence\) <> 3/);
  });

  it("keeps an owned-field allowlist, so an unbounded change set cannot slip in", () => {
    expect(sql).toMatch(/page_wording_field_is_owned/);
    expect(sql).toMatch(/'seo_title', 'page_heading', 'subheading'/);
    expect(sql).toMatch(/does not own the field/);
  });

  it("requires both sides of every replacement, so the executor has something to match", () => {
    expect(sql).toMatch(/must record the exact text before and after/);
  });

  it("proves whichever owned fields the row carries, not two by name", () => {
    // The old body demanded both and refused everything else.
    expect(sql).not.toMatch(/does not store both an approved title and heading to prove/);
    expect(sql).toMatch(/stores no wording field to prove/);
  });

  it("leaves the robots and meta-description proof branches alone", () => {
    expect(sql).toMatch(/deployed robots\.txt matching the committed file/);
    expect(sql).toMatch(/exact approved meta description/);
  });

  it("reads the revision function's own body rather than guessing it", () => {
    // Rewriting a function whose body this migration cannot see would silently
    // drop its guards, so it patches the stored source or leaves it alone.
    expect(sql).toMatch(/SELECT prosrc INTO v_src FROM pg_proc/);
    expect(sql).toMatch(/refusing to guess its body/);
  });
});
