import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { checksum } from "./dataforseo/transport.server";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import {
  checkDuplicateDescriptions,
  checkDuplicateTitles,
  checkNonIndexablePages,
  checkPagesErrorStatus,
  checkRedirectChainPresent,
  toResultSnapshot,
  type OnPageObservationDraft,
  type OnPageResultSnapshot,
} from "./onpage-rule-checks";

type AdminClient = SupabaseClient<Database>;

/** The five detail-result snapshot kinds Session A's rules read. */
const ONPAGE_KINDS = [
  "onpage_non_indexable",
  "onpage_pages",
  "onpage_redirect_chains",
  "onpage_duplicate_title",
  "onpage_duplicate_description",
] as const;

type OnPageKind = (typeof ONPAGE_KINDS)[number];

export type OnPageRuleRunResult = {
  snapshotsRead: number;
  observations: number;
  recommendations: number;
  noSnapshots: boolean;
};

/**
 * The sixth module that writes a recommendation.
 *
 * Eight OnPage snapshot kinds are collected and read by nothing (Session A of
 * docs/handoffs/2026-08-28-parallel-rule-sessions.md). This closes five of
 * them: `onpage_non_indexable`, `onpage_pages`, `onpage_redirect_chains`,
 * `onpage_duplicate_title`, `onpage_duplicate_description`. The three
 * crawl-meta rules (`crawl_hit_its_page_cap`, `crawl_result_truncated`,
 * `crawl_started_never_collected`), which each join `onpage_summary` and/or
 * `onpage_task` and file an operator decision rather than a finding, are
 * deferred to a follow-up PR per that handoff's own fallback plan.
 *
 * Writes with `source_module: "site-audit"`, never `"dataforseo"` —
 * `connections.registry.test.ts` asserts that only
 * `dataforseo/targeting-rules.server.ts` writes with source_module
 * `"dataforseo"`. `"site-audit"` already maps to the `health` category in
 * `finding-router.ts`; the two duplicate-tag rules override that to `pages`
 * there, because they are about the pages themselves rather than the crawl's
 * own health.
 *
 * Runs under the admin client with the tenant as a parameter, mirroring
 * `evaluatePageSpeedReadings` and `evaluateGa4Snapshots`.
 */
export async function evaluateOnPageSnapshots(
  client: AdminClient,
  tenantId: string,
): Promise<OnPageRuleRunResult> {
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("kind, totals, payload, returned_row_count, possibly_truncated, reporting_date")
    .eq("tenant_id", tenantId)
    .in("kind", ONPAGE_KINDS)
    .order("collected_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) {
    return { snapshotsRead: 0, observations: 0, recommendations: 0, noSnapshots: true };
  }

  // Rows arrive newest-first, so the first row seen for a kind is that kind's
  // newest snapshot. Every rule below reads exactly one kind's newest row;
  // older rows are history a rule never sees.
  const newestByKind = new Map<OnPageKind, OnPageResultSnapshot>();
  for (const row of rows) {
    const kind = row.kind as OnPageKind;
    if (newestByKind.has(kind)) continue;
    newestByKind.set(
      kind,
      toResultSnapshot({
        totals: row.totals,
        payload: row.payload,
        returnedRowCount: row.returned_row_count,
        possiblyTruncated: row.possibly_truncated,
        reportingDate: row.reporting_date,
      }),
    );
  }

  const observations: OnPageObservationDraft[] = [
    ...checkNonIndexablePages(newestByKind.get("onpage_non_indexable")),
    ...checkPagesErrorStatus(newestByKind.get("onpage_pages")),
    ...checkRedirectChainPresent(newestByKind.get("onpage_redirect_chains")),
    ...checkDuplicateTitles(newestByKind.get("onpage_duplicate_title")),
    ...checkDuplicateDescriptions(newestByKind.get("onpage_duplicate_description")),
  ];

  let created = 0;

  for (const observation of observations) {
    const issueFingerprint = checksum(["site-audit", observation.rule, observation.target]);

    const { data: openRecommendation, error: openError } = await client
      .from("recommendations")
      .select("id, state")
      .eq("tenant_id", tenantId)
      .eq("issue_fingerprint", issueFingerprint)
      .not("state", "in", "(applied,verified,rejected,rolled_back)")
      .maybeSingle();
    if (openError) throw new Error(openError.message);
    if (openRecommendation?.id) continue;

    const { error: insertError } = await client.from("recommendations").insert(
      observationRecommendationRecord({
        tenant_id: tenantId,
        title: observation.title,
        description: observation.description,
        source_module: "site-audit",
        business_impact: observation.businessImpact,
        time_saved_minutes: 0,
        risk: "none",
        confidence: observation.confidence,
        reasoning: `Rule ${observation.rule} over the stored OnPage crawl for ${observation.target}. Thresholds and consequences cited are Google's own documentation, not invented values.`,
        suggested_action: {
          kind: "review",
          rule: observation.rule,
          target: observation.target,
        } as never,
        issue_fingerprint: issueFingerprint,
        metadata: { rule: observation.rule } as never,
      }),
    );
    if (insertError) throw new Error(insertError.message);
    created += 1;
  }

  await logActivity(client, {
    tenantId,
    actorKind: "system",
    actorId: "onpage-rules",
    verb: "onpage.rules.evaluated",
    subjectKind: "tenant",
    subjectId: tenantId,
    summary: `Read ${newestByKind.size} stored OnPage crawl reading(s) and filed ${created} new finding(s).`,
    payload: { snapshotsRead: newestByKind.size, observations: observations.length, created },
  });

  return {
    snapshotsRead: newestByKind.size,
    observations: observations.length,
    recommendations: created,
    noSnapshots: false,
  };
}
