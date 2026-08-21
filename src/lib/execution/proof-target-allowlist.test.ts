import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  GOVERNED_BRANCH,
  GOVERNED_FILES,
  GOVERNED_PROJECT_ID,
  GOVERNED_REPO,
} from "./allowlist";

/**
 * The executor and the database-side rendered-proof routine each re-check the
 * execution target, and neither can see the other's list. A file the executor
 * will commit but the proof routine rejects means a real commit on the client's
 * site that nothing is then able to record. Migrations are applied by hand here,
 * so nothing generates one list from the other; this test is what makes the two
 * fail together instead of drifting apart silently.
 */

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));
const DEFINITION = "CREATE OR REPLACE FUNCTION public.apply_change_request_rendered_proof";

function latestProofRoutineSql(): string {
  const file = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => readFileSync(`${MIGRATIONS}/${name}`, "utf8").includes(DEFINITION))
    .at(-1);
  if (!file) throw new Error("No migration defines apply_change_request_rendered_proof.");
  return readFileSync(`${MIGRATIONS}/${file}`, "utf8");
}

function acceptedFiles(sql: string): string[] {
  const block = /v_row\.source_file NOT IN \(([^)]*)\)/.exec(sql)?.[1];
  if (!block) throw new Error("The proof routine no longer checks source_file against a list.");
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] as string);
}

describe("rendered proof execution target", () => {
  const sql = latestProofRoutineSql();

  it("accepts exactly the files a governed change kind may commit", () => {
    const accepted = acceptedFiles(sql);
    expect(accepted.length).toBeGreaterThan(0);
    expect([...accepted].sort()).toEqual([...GOVERNED_FILES].sort());
  });

  it("still pins the repository, branch, and source project the executor pins", () => {
    expect(sql).toContain(`v_row.source_repo IS DISTINCT FROM '${GOVERNED_REPO}'`);
    expect(sql).toContain(`v_row.source_branch IS DISTINCT FROM '${GOVERNED_BRANCH}'`);
    expect(sql).toContain(`v_row.source_project_id::text IS DISTINCT FROM '${GOVERNED_PROJECT_ID}'`);
  });
});
