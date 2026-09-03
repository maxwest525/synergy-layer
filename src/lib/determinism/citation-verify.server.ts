import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { type AuthorityKey, type RuleCitationReport, verifyRuleCitations } from "./citation";
import { RULE_CITATIONS, citedSources } from "./rule-citations";

type Client = SupabaseClient<Database>;

/**
 * Resolve every declared citation against the chunks actually in the database
 * (CODE-98).
 *
 * This is the half that cannot be a unit test. `citation.ts` answers whether a
 * quote appears in text it is handed; this answers whether the text is there at
 * all, on this tenant, today. A source that was re-ingested, re-chunked or
 * removed takes its citations down with it, and that has to surface as a
 * failure rather than as a rule quietly resting on nothing.
 *
 * Reads only active source versions, because an inactive version is history:
 * a rule cited against wording that has since been superseded is exactly the
 * drift worth catching.
 */
export async function loadCitedChunks(
  client: Client,
): Promise<Map<AuthorityKey, { ordinal: number; body: string }[]>> {
  const sources = citedSources();
  const byKey = new Map<AuthorityKey, { ordinal: number; body: string }[]>();
  if (sources.length === 0) return byKey;

  const { data: sourceRows, error: sourceError } = await client
    .from("knowledge_sources")
    .select("id, stable_key")
    .in("stable_key", sources);
  if (sourceError) throw new Error(sourceError.message);

  const keyById = new Map((sourceRows ?? []).map((row) => [row.id, row.stable_key]));
  if (keyById.size === 0) return byKey;

  const { data: versionRows, error: versionError } = await client
    .from("knowledge_source_versions")
    .select("id, source_id")
    .in("source_id", [...keyById.keys()])
    .eq("status", "active");
  if (versionError) throw new Error(versionError.message);

  const keyByVersion = new Map<string, AuthorityKey>();
  for (const row of versionRows ?? []) {
    const key = keyById.get(row.source_id);
    if (key) keyByVersion.set(row.id, key);
  }
  if (keyByVersion.size === 0) return byKey;

  const { data: chunkRows, error: chunkError } = await client
    .from("knowledge_chunks")
    .select("source_version_id, ordinal, body")
    .in("source_version_id", [...keyByVersion.keys()])
    .order("ordinal", { ascending: true });
  if (chunkError) throw new Error(chunkError.message);

  for (const row of chunkRows ?? []) {
    const key = keyByVersion.get(row.source_version_id);
    if (!key) continue;
    const held = byKey.get(key) ?? [];
    held.push({ ordinal: row.ordinal, body: row.body });
    byKey.set(key, held);
  }
  return byKey;
}

export type CitationAudit = {
  reports: RuleCitationReport[];
  /** Rules whose every citation resolved. */
  verified: string[];
  /** Rules citing wording no active source carries. */
  broken: string[];
};

export async function auditRuleCitations(client: Client): Promise<CitationAudit> {
  const chunks = await loadCitedChunks(client);
  const reports = Object.entries(RULE_CITATIONS)
    .map(([rule, citations]) => verifyRuleCitations(rule, citations, chunks))
    .sort((a, b) => a.rule.localeCompare(b.rule));
  return {
    reports,
    verified: reports.filter((report) => report.ok).map((report) => report.rule),
    broken: reports.filter((report) => !report.ok).map((report) => report.rule),
  };
}
