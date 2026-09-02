import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902100000_publishers_rank_alongside_you.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Moving-niche publishers rank alongside you", () => {
  it("moves only the nine named derived rows from surface to competitor", () => {
    expect(sql).toMatch(/UPDATE public\.competitor_candidates\s+SET domain_class = 'competitor'/);
    expect(sql).toMatch(/WHERE source = 'serp\.derived'\s+AND domain_class = 'surface'/);
    for (const domain of [
      "moving.com",
      "movers.com",
      "unpakt.com",
      "hireahelper.com",
      "updater.com",
      "uhaul.com",
      "move.org",
      "movebuddha.com",
      "mymovingreviews.com",
    ]) {
      expect(sql).toContain(`'${domain}'`);
    }
  });

  it("never touches the operator's own classification or review", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).not.toMatch(/company_classification|review_state/);
    expect((withoutComments.match(/UPDATE /g) ?? []).length).toBe(1);
    expect(withoutComments).not.toMatch(/DELETE|DROP|INSERT|CREATE/);
  });
});
