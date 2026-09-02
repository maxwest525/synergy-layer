import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260902110000_google_ads_budget.sql", import.meta.url),
  "utf8",
);

describe("Google Ads rows carry the campaign's budget", () => {
  it("adds a nullable budget column and nothing else", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.google_ads_snapshots\s+ADD COLUMN IF NOT EXISTS budget_micros bigint;/,
    );
    expect(sql).not.toMatch(/NOT NULL|DEFAULT 0/);
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).not.toMatch(/UPDATE|DELETE|DROP|INSERT|CREATE|POLICY/);
  });
});
