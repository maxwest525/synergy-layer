import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20260814160000_authority_findings.sql", import.meta.url),
  "utf8",
);

describe("Authority Science persistence contract", () => {
  it("creates tenant-scoped finding, evidence, and permitted-action tables", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.authority_findings/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.authority_finding_evidence/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.authority_actions/i);
    expect(sql.match(/tenant_id uuid NOT NULL REFERENCES public\.tenants/g)?.length).toBe(3);
  });

  it("keeps findings and evidence append-only and idempotent", () => {
    expect(sql).toMatch(/UNIQUE \(tenant_id, target_url, rule_key, fingerprint\)/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.authority_findings/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.authority_finding_evidence/i);
  });

  it("separates a permitted action from a concrete change request", () => {
    expect(sql).toMatch(/requires_exact_change boolean NOT NULL/i);
    expect(sql).toMatch(/change_request_id uuid REFERENCES public\.change_requests/i);
    expect(sql).toMatch(/CHECK \(state IN \('suggested','proposed','dismissed'\)\)/i);
  });

  it("uses RLS and service-side writes", () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(3);
    expect(sql.match(/FOR SELECT TO authenticated/g)?.length).toBe(3);
    expect(sql).not.toMatch(/GRANT (INSERT|DELETE) .* TO authenticated/i);
    expect(sql).toMatch(/GRANT ALL ON public\.authority_actions TO service_role/i);
  });
});
