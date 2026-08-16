import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260816120000_openseo_runtime.sql",
);

describe("OpenSEO runtime migration", () => {
  it("creates a tenant-scoped append-only invocation ledger", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.openseo_tool_runs/i);
    expect(sql).toMatch(/tenant_id uuid NOT NULL REFERENCES public\.tenants\(id\)/i);
    expect(sql).toMatch(/operator_id uuid NOT NULL/i);
    expect(sql).toMatch(/classification text NOT NULL[\s\S]*free_read[\s\S]*metered_read/i);
    expect(sql).toMatch(/arguments jsonb NOT NULL/i);
    expect(sql).toMatch(/result jsonb NOT NULL/i);
    expect(sql).toMatch(/credits_charged numeric/i);
    expect(sql).toMatch(/credits_remaining numeric/i);
    expect(sql).toMatch(/ALTER TABLE public\.openseo_tool_runs ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/public\.is_tenant_member\(tenant_id\)/i);
    expect(sql).toMatch(/GRANT SELECT ON public\.openseo_tool_runs TO authenticated/i);
    expect(sql).toMatch(/GRANT ALL ON public\.openseo_tool_runs TO service_role/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.openseo_tool_runs/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'OpenSEO invocation history is append-only\.'/i);
  });
});
