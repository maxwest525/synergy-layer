import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260902060000_no_invented_impact.sql", import.meta.url),
  "utf8",
);

describe("a finding carries no impact it never estimated", () => {
  it("resets only rule-sourced rows whose two values are copies of the business impact", () => {
    const update = sql.slice(sql.indexOf("UPDATE public.recommendations"));
    expect(update).toMatch(/SET revenue_impact = 'none', traffic_impact = 'none'/);
    expect(update).toMatch(/r\.revenue_impact = r\.business_impact/);
    expect(update).toMatch(/r\.traffic_impact = r\.business_impact/);
    expect(update).toMatch(/AND NOT \(r\.revenue_impact = 'none' AND r\.traffic_impact = 'none'\)/);
    expect(update).toMatch(
      /r\.source_module IN \('search-console', 'ga4', 'dataforseo', 'pagespeed', 'umami',/,
    );
    expect(update).not.toMatch(/'capabilities'|'knowledge'/);
  });

  it("leaves the ids on the activity feed before touching the rows", () => {
    expect(sql).toMatch(/'recommendation\.impact_reset'/);
    expect(sql).toMatch(
      /jsonb_build_object\('reason', 'copied_from_business_impact', 'ids', jsonb_agg\(r\.id\)\)/,
    );
    expect(sql.indexOf("INSERT INTO public.activity_events")).toBeLessThan(
      sql.indexOf("UPDATE public.recommendations"),
    );
  });

  it("changes no schema and deletes nothing", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).not.toMatch(/ALTER TABLE|DROP|DELETE/);
  });
});
