import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902040000_bridge_secret_per_connection.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("the bridge secret is named per connection", () => {
  it("adds the name with the variable in use today as its default, so the live bridge keeps working", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.openai_ads_connections\s+ADD COLUMN IF NOT EXISTS bridge_secret_name text NOT NULL DEFAULT 'OPENAI_ADS_BRIDGE_SECRET';/,
    );
  });

  it("stores a name, never a value", () => {
    expect(sql).toMatch(/The value never enters the database/);
    expect(sql).not.toMatch(/bridge_secret_hash|bridge_secret text/);
  });
});
