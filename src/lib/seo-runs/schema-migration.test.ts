import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20260814170000_seo_runs.sql", import.meta.url),
  "utf8",
);

describe("visible SEO run persistence contract", () => {
  it("stores the full visible workflow and links the concrete proposal", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.seo_runs/i);
    expect(sql).toMatch(/connector_snapshot jsonb NOT NULL/i);
    expect(sql).toMatch(/evidence_snapshot jsonb NOT NULL/i);
    expect(sql).toMatch(/knowledge_chunk_ids uuid\[\] NOT NULL/i);
    expect(sql).toMatch(/authority_finding_ids uuid\[\] NOT NULL/i);
    expect(sql).toMatch(/change_request_id uuid REFERENCES public\.change_requests/i);
  });

  it("preserves the governed run states without treating approval as execution", () => {
    expect(sql).toContain("'preflight_blocked'");
    expect(sql).toContain("'awaiting_approval'");
    expect(sql).toContain("'approved'");
    expect(sql).toContain("'executing'");
    expect(sql).toContain("'executed'");
    expect(sql).toContain("'verified'");
    expect(sql).toContain("'rolled_back'");
    expect(sql).toContain("'rejected'");
  });

  it("records append-only idempotent run events", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.seo_run_events/i);
    expect(sql).toMatch(/UNIQUE \(tenant_id, run_id, event_key\)/i);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.seo_run_events/i);
  });

  it("uses tenant RLS and service-side writes", () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(2);
    expect(sql.match(/FOR SELECT TO authenticated/g)?.length).toBe(2);
    expect(sql).not.toMatch(/GRANT (INSERT|DELETE) .* TO authenticated/i);
  });

  it("projects proposal decisions back into the visible run without collapsing approval into execution", () => {
    expect(sql).toMatch(/WHEN 'approved' THEN 'approved'/i);
    expect(sql).toMatch(/WHEN 'applied' THEN 'executed'/i);
    expect(sql).toMatch(/AFTER UPDATE OF state ON public\.change_requests/i);
  });
});
