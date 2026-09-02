import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902090000_scheduler_firings_are_durable.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Scheduler firings are durable", () => {
  it("keeps one row per firing, written by the tick or the hook, never changed", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.schedule_runs \(/);
    expect(sql).toMatch(/fired_by text NOT NULL CHECK \(fired_by IN \('pg_cron', 'operator'\)\)/);
    expect(sql).toMatch(
      /state text NOT NULL CHECK \(state IN \('succeeded', 'failed', 'blocked'\)\)/,
    );
    expect(sql).toMatch(
      /schedule_id uuid NOT NULL REFERENCES public\.schedules\(id\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(/ALTER TABLE public\.schedule_runs ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.schedule_runs TO authenticated;/);
    expect(sql).not.toMatch(/GRANT (UPDATE|DELETE|ALL) ON public\.schedule_runs TO authenticated/);
  });

  it("lets a tenant member read and only an operator of that tenant insert", () => {
    expect(sql).toMatch(
      /CREATE POLICY schedule_runs_read ON public\.schedule_runs\s+FOR SELECT TO authenticated\s+USING \(public\.is_tenant_member\(tenant_id\)\);/,
    );
    expect(sql).toMatch(
      /CREATE POLICY schedule_runs_insert ON public\.schedule_runs\s+FOR INSERT TO authenticated\s+WITH CHECK \(\s+public\.is_operator\(\)\s+AND tenant_id IS NOT NULL\s+AND public\.is_tenant_member\(tenant_id\)\s+\);/,
    );
    expect(sql).not.toMatch(/FOR (UPDATE|DELETE)/);
  });

  it("moves the two schedule rows to the minute their cron entries actually fire, and only those", () => {
    expect(sql).toMatch(
      /UPDATE public\.schedules SET cron = '5 16 \* \* \*'\s+WHERE key = 'gsc-daily-observe' AND cron = '0 16 \* \* \*';/,
    );
    expect(sql).toMatch(
      /UPDATE public\.schedules SET cron = '35 16 \* \* \*'\s+WHERE key = 'ga4-daily-observe' AND cron = '30 16 \* \* \*';/,
    );
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect((withoutComments.match(/UPDATE /g) ?? []).length).toBe(2);
    expect(withoutComments).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/);
  });
});
