import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = [
  "../../supabase/migrations/20260814103007_60f61bc3-b4ce-4ff4-a663-ccea36894966.sql",
  "../../supabase/migrations/20260814104303_bbbbecf6-47d9-46b7-8907-cc40aa0df615.sql",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("change measurement database contract", () => {
  it("keeps all lifecycle tables tenant-consistent and read-only to authenticated users", () => {
    expect(sql).toMatch(/FOREIGN KEY \(cycle_id, tenant_id\)/g);
    expect(sql.match(/FOR SELECT TO authenticated/g)?.length).toBe(4);
    expect(sql).toMatch(
      /REVOKE ALL ON public\.change_measurement_cycles[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE).*authenticated/i);
  });

  it("makes history append-only and provider roles deterministic", () => {
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.change_measurement_observations/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.change_measurement_revisions/);
    expect(sql).toMatch(/WHEN 'ga4' THEN 'source_of_truth'/);
    expect(sql).toMatch(/WHEN 'dataforseo_organic' THEN 'enrichment'/);
    expect(sql).toMatch(/WHEN 'serpapi_paid_serp' THEN 'corroboration'/);
    expect(sql).toMatch(/WHEN 'knowledge' THEN 'devils_advocate'/);
    expect(sql).toMatch(/_source_role IS DISTINCT FROM \(CASE _provider[\s\S]*END\) THEN/);
  });

  it("anchors live_at only from rendered proof and never grants the append RPC to browsers", () => {
    expect(sql).toMatch(
      /OLD\.published_proof_at IS NULL AND NEW\.published_proof_at IS NOT NULL[\s\S]*NEW\.live_at := NEW\.published_proof_at/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.append_change_measurement_observation[\s\S]*authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.append_change_measurement_observation[\s\S]*TO service_role/,
    );
  });
});
