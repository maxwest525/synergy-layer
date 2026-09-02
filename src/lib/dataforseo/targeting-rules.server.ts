import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  detectKeywordCannibalization,
  detectKeywordsWithoutPage,
  detectMissingRouteQueries,
  detectReferringDomainMovement,
  detectUnobservedKeywords,
  type ObservedSerp,
  type PageText,
  type ReferringDomainSnapshot,
  type SearchQuery,
  type TargetingObservation,
} from "../targeting-rules";
import { checksum } from "./transport.server";

type Client = SupabaseClient<Database>;

/**
 * The targeting pass: the only module that writes `source_module: "dataforseo"`
 * recommendations.
 *
 * It must stay the only one. `connections.registry.test.ts` reads the source
 * tree and asserts that the file writing a given source_module also reads that
 * connection's table, so a second file writing "dataforseo" would make that
 * assertion depend on directory-read order.
 *
 * Nothing here calls a provider. Every row it reads was already collected and,
 * in the case of the SERP snapshots, already paid for.
 */

const SUGGESTED_ACTION_BY_RULE: Record<string, string> = {
  approved_keyword_unobserved: "observe_keyword",
  approved_keyword_no_page: "write_new_page",
  approved_keyword_multiple_pages: "review",
  tracked_set_has_no_route_query: "review",
};

/** How far back stored SERP evidence counts as an observation of a keyword. */
export const TARGETING_CONFIG = { serpLookbackDays: 90, pageLimit: 500 };

async function readApprovedKeywords(client: Client, tenantId: string) {
  const { data, error } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ keyword: row.keyword }));
}

async function readObservedSerps(client: Client, tenantId: string): Promise<ObservedSerp[]> {
  const cutoff = new Date(Date.now() - TARGETING_CONFIG.serpLookbackDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("target, reporting_date")
    .eq("tenant_id", tenantId)
    .in("kind", ["serp_organic", "serp_organic_live"])
    .gte("reporting_date", cutoff);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ keyword: row.target, reportingDate: row.reporting_date }));
}

/**
 * The newest stored page+query read for the tenant, folded to one row per
 * query. Search Console's own rows are page by query; the rule asks about
 * the query.
 */
async function readSearchQueries(client: Client, tenantId: string): Promise<SearchQuery[]> {
  const { data, error } = await client
    .from("search_console_snapshots")
    .select("payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "page_query")
    .order("collected_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = ((data ?? [])[0]?.payload as { rows?: unknown[] } | null)?.rows ?? [];
  const byQuery = new Map<string, { impressions: number; clicks: number }>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { keys?: unknown; impressions?: unknown; clicks?: unknown };
    const query = Array.isArray(row.keys) && typeof row.keys[1] === "string" ? row.keys[1] : null;
    if (!query) continue;
    const current = byQuery.get(query) ?? { impressions: 0, clicks: 0 };
    byQuery.set(query, {
      impressions:
        current.impressions + (typeof row.impressions === "number" ? row.impressions : 0),
      clicks: current.clicks + (typeof row.clicks === "number" ? row.clicks : 0),
    });
  }
  return [...byQuery.entries()].map(([query, row]) => ({ query, ...row }));
}

async function readPageText(client: Client, tenantId: string): Promise<PageText[]> {
  const { data, error } = await client
    .from("page_metadata_observations")
    .select("url, title, h1")
    .eq("tenant_id", tenantId)
    .is("error", null)
    .limit(TARGETING_CONFIG.pageLimit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ url: row.url, title: row.title, h1: row.h1 }));
}

async function readReferringDomainSnapshots(
  client: Client,
  tenantId: string,
): Promise<[ReferringDomainSnapshot | null, ReferringDomainSnapshot | null]> {
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("reporting_date, payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "backlinks_referring_domains")
    .order("reporting_date", { ascending: false })
    .limit(2);
  if (error) throw new Error(error.message);

  const read = (row: { reporting_date: string; payload: unknown } | undefined) =>
    row === undefined
      ? null
      : {
          reportingDate: row.reporting_date,
          domains: ((row.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [])
            .map((item) => String(item["domain"] ?? ""))
            .filter(Boolean),
        };

  return [read((data ?? [])[1]), read((data ?? [])[0])];
}

/** One recommendation per observation, deduped on the same fingerprint scheme the other rule families use. */
async function persist(
  client: Client,
  tenantId: string,
  observations: readonly TargetingObservation[],
): Promise<number> {
  let created = 0;

  for (const observation of observations) {
    const issueFingerprint = checksum([tenantId, observation.rule, observation.target]);

    const { data: open, error: openError } = await client
      .from("recommendations")
      .select("id")
      .eq("issue_fingerprint", issueFingerprint)
      .not("state", "in", "(applied,verified,rejected,rolled_back)")
      .maybeSingle();
    if (openError) throw new Error(openError.message);
    if (open) continue;

    const { error } = await client.from("recommendations").insert({
      tenant_id: tenantId,
      title: observation.title,
      description: observation.description,
      source_module: "dataforseo",
      state: "proposed",
      requires_approval: false,
      business_impact: "medium",
      time_saved_minutes: 0,
      risk: "none",
      confidence: observation.confidence,
      reasoning: `Read from stored rows on ${new Date().toISOString().slice(0, 10)}: no provider was called.`,
      suggested_action: {
        kind: SUGGESTED_ACTION_BY_RULE[observation.rule] ?? "review",
        rule: observation.rule,
        target: observation.target,
      } as never,
      issue_fingerprint: issueFingerprint,
      metadata: { rule: observation.rule, evidence: observation.evidence } as never,
    });
    if (error) throw new Error(error.message);
    created += 1;
  }

  return created;
}

/**
 * Re-reads the targeting evidence and files what it finds. Costs nothing, so it
 * is safe to run as often as an operator likes.
 */
export async function runTargetingPass(
  client: Client,
  tenantId: string,
): Promise<{ observations: number; recommendations: number }> {
  const [approved, observed, pages, [priorLinks, currentLinks], queries] = await Promise.all([
    readApprovedKeywords(client, tenantId),
    readObservedSerps(client, tenantId),
    readPageText(client, tenantId),
    readReferringDomainSnapshots(client, tenantId),
    readSearchQueries(client, tenantId),
  ]);

  const observations = [
    ...detectUnobservedKeywords(approved, observed),
    ...detectKeywordsWithoutPage(approved, pages),
    ...detectKeywordCannibalization(approved, pages),
    ...detectReferringDomainMovement(priorLinks, currentLinks),
    ...detectMissingRouteQueries(approved, queries),
  ];

  return {
    observations: observations.length,
    recommendations: await persist(client, tenantId, observations),
  };
}
