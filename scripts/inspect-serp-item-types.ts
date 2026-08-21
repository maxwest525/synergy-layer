import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/integrations/supabase/types";

/**
 * Read-only. Answers one question before any parser is written: what item
 * types do the SERP payloads AOOS has already stored actually contain, and
 * does a people_also_ask block appear among them?
 *
 * Calls no provider and writes nothing.
 *
 * This implementer's local environment had no SUPABASE_SECRET_KEY /
 * SUPABASE_SERVICE_ROLE_KEY, and the connected Supabase MCP project list
 * did not include this repo's project, so this script itself could not be
 * run here. The verification was instead completed by the controller via
 * a read-only SQL query over the project database (Lovable DB connection,
 * 2026-08-21):
 *
 *   select (elem->>'type') as type, count(*)
 *   from dataforseo_snapshots, jsonb_array_elements(payload->'rows') as elem
 *   where kind in ('serp_organic', 'serp_organic_live')
 *   group by 1;
 *
 * VERIFIED RESULT — OUTCOME B: 40 stored snapshots of kind serp_organic.
 * Item-type histogram: { organic: 741 }. No other type appears; count for
 * people_also_ask is 0. peopleAlsoAskPresent = false.
 *
 * Why: `payload->'rows'` (see `ingestSerpPostback`, serp.server.ts:154-158)
 * is a pre-filtered projection written at ingest time, not the raw
 * `result[0].items` DataForSEO returns — non-organic item types, including
 * people_also_ask, are stripped before storage. Their absence here reflects
 * what AOOS chose to keep, not what Google returned.
 *
 * Conclusion: question mining from already-stored payloads does not ship.
 * `readQuestionsFromRows` / `detectQuestionsWithoutPage` /
 * `question_asked_no_page` were not implemented, per the task brief's gate.
 *
 * Two separate, uncosted follow-ups (neither implemented here):
 *   (a) Widen `ingestSerpPostback` to retain non-organic item types. This
 *       needs the `task_get/advanced` endpoint (serp.server.ts:158, :170)
 *       in place of `task_get/regular`; nobody in this repo has measured
 *       whether that endpoint is billed differently, so it must not be
 *       promised as free.
 *   (b) SerpAPI's `google_related_questions` endpoint — a metered call,
 *       out of this lane's scope, requiring an explicit operator-approved
 *       spend gate before use.
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

  console.log(
    JSON.stringify(
      {
        snapshotsRead: (data ?? []).length,
        endpoints: [...new Set((data ?? []).map((row) => row.endpoint))],
        itemTypes: Object.fromEntries([...typeCounts.entries()].sort((a, b) => b[1] - a[1])),
        peopleAlsoAskPresent: typeCounts.has("people_also_ask"),
        peopleAlsoAskSample: paaSample,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
