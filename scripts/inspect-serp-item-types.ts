import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/integrations/supabase/types";

/**
 * Read-only. Answers one question before any parser is written: what item
 * types do the SERP payloads AOOS has already stored actually contain, and
 * does a people_also_ask block appear among them?
 *
 * Calls no provider and writes nothing.
 *
 * NOT YET RUN AGAINST REAL DATA (2026-08-21). This environment has no
 * SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY — only SUPABASE_PUBLISHABLE_KEY
 * is set in .env. Two attempts to reach real rows both failed to produce a
 * type histogram:
 *   1. Running this script with SUPABASE_PUBLISHABLE_KEY substituted for the
 *      secret key: "permission denied for function is_tenant_member" — RLS
 *      on dataforseo_snapshots requires an authenticated tenant session the
 *      anon key does not carry.
 *   2. The claude.ai Supabase MCP connector: list_projects does not include
 *      this repo's project (SUPABASE_PROJECT_ID from .env is not among the
 *      12 projects the connector has access to), so execute_sql cannot
 *      target it either.
 * No real-data read was possible from this environment. This is the
 * Outcome-B-adjacent case the task brief names explicitly: stop, do not
 * implement the parser, and report the block rather than guessing at
 * whether people_also_ask items exist in stored payloads.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const client = createClient<Database>(
    required("SUPABASE_URL"),
    process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || required("SUPABASE_SECRET_KEY"),
  );

  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("id, target, reporting_date, endpoint, payload")
    .in("kind", ["serp_organic", "serp_organic_live"])
    .order("reporting_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const typeCounts = new Map<string, number>();
  let paaSample: unknown = null;

  for (const snapshot of data ?? []) {
    const rows = (snapshot.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [];
    for (const row of rows) {
      const type = String(row["type"] ?? "unknown");
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      if (type === "people_also_ask" && paaSample === null) paaSample = row;
    }
  }

  console.log(JSON.stringify({
    snapshotsRead: (data ?? []).length,
    endpoints: [...new Set((data ?? []).map((row) => row.endpoint))],
    itemTypes: Object.fromEntries([...typeCounts.entries()].sort((a, b) => b[1] - a[1])),
    peopleAlsoAskPresent: typeCounts.has("people_also_ask"),
    peopleAlsoAskSample: paaSample,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
