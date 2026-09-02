import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902130000_code_defined_agent_rows_are_written_by_the_service_role.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Code-defined agent rows are written by the service role only", () => {
  it("drops exactly the two operator write policies and nothing else", () => {
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect(withoutComments).toContain(
      'DROP POLICY IF EXISTS "operators manage agents" ON public.agents;',
    );
    expect(withoutComments).toContain(
      'DROP POLICY IF EXISTS "operators manage agent_capabilities" ON public.agent_capabilities;',
    );
    expect((withoutComments.match(/DROP POLICY/g) ?? []).length).toBe(2);
    expect(withoutComments).not.toMatch(
      /operators read|DELETE|UPDATE|INSERT|CREATE|TRUNCATE|ALTER/,
    );
  });
});
