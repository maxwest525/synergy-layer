import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902030000_postback_token_and_shared_rows.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("a callback is authenticated by something only the task knows", () => {
  it("stores the token's hash, never the token, and one task per hash", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.dataforseo_serp_tasks\s+ADD COLUMN IF NOT EXISTS postback_token_hash text;/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS dataforseo_serp_tasks_postback_token_hash_key\s+ON public\.dataforseo_serp_tasks \(postback_token_hash\)\s+WHERE postback_token_hash IS NOT NULL;/,
    );
    expect(sql).not.toMatch(/postback_token text/);
  });
});

describe("a row with no tenant belongs to the admins", () => {
  it("reads: members see their tenant's rows; shared audit rows are the admins' and the actor's", () => {
    const read = sql.slice(
      sql.indexOf("CREATE POLICY activity_read"),
      sql.indexOf("DROP POLICY IF EXISTS activity_write"),
    );
    expect(read).toMatch(/\(tenant_id IS NOT NULL AND public\.is_tenant_member\(tenant_id\)\)/);
    expect(read).toMatch(
      /tenant_id IS NULL\s+AND \(\s+public\.has_role\(auth\.uid\(\), 'admin'::app_role\)/,
    );
    expect(read).toMatch(/OR actor_id = auth\.uid\(\)::text/);
    expect(read).toMatch(/OR subject_id::text = auth\.uid\(\)::text/);
  });

  it("writes: the three tables that hold shared rows need the admin role for a row with no tenant", () => {
    for (const policy of ["activity_write", "kcoll_write", "sched_write"]) {
      const block = sql.slice(sql.indexOf(`CREATE POLICY ${policy}`));
      const body = block.slice(0, block.indexOf(";") + 1);
      expect(body).toMatch(/FOR ALL TO authenticated/);
      const guards = body.match(
        /AND \(tenant_id IS NOT NULL OR public\.has_role\(auth\.uid\(\), 'admin'::app_role\)\)/g,
      );
      // Once in USING, once in WITH CHECK.
      expect(guards).toHaveLength(2);
    }
  });

  it("drops nothing but the policies it replaces", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).not.toMatch(/DROP (TABLE|COLUMN|INDEX|FUNCTION)/i);
    expect(withoutComments).not.toMatch(/\bDELETE\b|\bUPDATE\b/);
  });
});
