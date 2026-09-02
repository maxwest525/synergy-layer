import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902070000_search_console_runs_are_ledgered.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Search Console attempts are ledgered like every other provider's", () => {
  it("admits gsc as a measurement_runs provider without dropping the others", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.measurement_runs\s+DROP CONSTRAINT IF EXISTS measurement_runs_provider_check;/,
    );
    expect(sql).toMatch(/CHECK \(provider IN \('pagespeed', 'ga4', 'umami', 'gsc'\)\)/);
  });

  it("changes nothing else", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).not.toMatch(/CREATE|UPDATE|DELETE|INSERT|POLICY/);
  });
});
