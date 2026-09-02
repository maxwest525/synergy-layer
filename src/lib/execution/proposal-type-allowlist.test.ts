import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GOVERNED_PROPOSAL_TYPES, SITE_LEVEL_CHANGE_KINDS } from "./allowlist";

/**
 * The third list, and the one that had no test.
 *
 * `change_requests.proposal_type` carries a CHECK constraint the application
 * cannot see. CODE-90 added a change kind, moved the executor's file allowlist
 * and the rendered proof routine's to match, and was still refused -- by this
 * constraint, at the moment the operator pressed Draft. A refusal there costs
 * the operator a click and their trust in the control; a failure here costs a
 * test run.
 *
 * Same mechanic as `proof-target-allowlist.test.ts`: read the latest migration
 * that states the constraint and require it to equal what the code can emit.
 */

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));
const DEFINITION = "change_requests_proposal_type_check";

function latestConstraintSql(): string {
  const file = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => readFileSync(`${MIGRATIONS}/${name}`, "utf8").includes(DEFINITION))
    .at(-1);
  if (!file) throw new Error(`No migration states ${DEFINITION}.`);
  return readFileSync(`${MIGRATIONS}/${file}`, "utf8");
}

function acceptedTypes(sql: string): string[] {
  const block = /CHECK \(proposal_type IN \(([^)]*)\)\)/.exec(sql)?.[1];
  if (!block) throw new Error("The constraint no longer lists proposal types inline.");
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] as string);
}

describe("change_requests.proposal_type", () => {
  const sql = latestConstraintSql();

  it("accepts exactly the proposal types the application can write", () => {
    const accepted = acceptedTypes(sql);
    expect(accepted.length).toBeGreaterThan(0);
    expect([...accepted].sort()).toEqual([...GOVERNED_PROPOSAL_TYPES].sort());
  });

  it("carries every site-level change kind, which is the half that is derived", () => {
    const accepted = acceptedTypes(sql);
    for (const kind of SITE_LEVEL_CHANGE_KINDS) {
      expect(accepted).toContain(kind);
    }
    // The two page lanes are named by their SQL writers, not by a change kind,
    // so they are asserted by name rather than derived.
    expect(accepted).toContain("page_wording");
    expect(accepted).toContain("page_metadata");
  });
});
