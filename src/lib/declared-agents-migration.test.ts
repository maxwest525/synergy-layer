import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260902120000_declared_agents_that_cannot_run_are_gone.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("The two declared agents that could not run are gone", () => {
  it("removes exactly the two agents and nothing else", () => {
    expect(sql).toMatch(
      /DELETE FROM public\.agents\s+WHERE key IN \('growth\.analyst', 'content\.strategist'\);/,
    );
    const withoutComments = sql.replace(/^--.*$/gm, "");
    expect((withoutComments.match(/DELETE FROM/g) ?? []).length).toBe(1);
    expect(withoutComments).not.toMatch(
      /workflows|workflow_runs|DROP|UPDATE|INSERT|CREATE|TRUNCATE/,
    );
  });
});
