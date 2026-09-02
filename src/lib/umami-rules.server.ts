import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import { checksum } from "./search-console.server";
import {
  detectReferrerSourceStopped,
  detectSiteTrafficShift,
  detectZeroRecorded,
  parseReferrerRows,
  parseStatsTotals,
  type UmamiObservationDraft,
  type UmamiReferrerWindowReading,
  type UmamiStatsSnapshot,
  type UmamiStatsWindowReading,
} from "./umami-rule-checks";

type AdminClient = SupabaseClient<Database>;

export type UmamiRuleRunResult = {
  statsRowsRead: number;
  referrerRowsRead: number;
  observations: number;
  recommendations: number;
  noChange: boolean;
};

/**
 * Evidence-backed rules over stored Umami snapshots, mirroring
 * evaluatePageSpeedReadings (pagespeed-rules.server.ts): read, check, write.
 * Zero drafts is a valid, healthy "no change" outcome, not a failure.
 *
 * Enough history is read per metric (HISTORY_LIMIT rows) to find a strictly
 * non-overlapping window pair, not just the newest row, since
 * `detectSiteTrafficShift` and `detectReferrerSourceStopped` both need one.
 *
 * Runs under the admin client with the tenant as a parameter, mirroring
 * evaluateGa4Snapshots and observeUmami.
 */
const HISTORY_LIMIT = 60;

function parseOwnedMatch(provenance: unknown): boolean {
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return false;
  return (provenance as Record<string, unknown>)["matchedOwnedAsset"] === true;
}

async function loadRunStatuses(
  client: AdminClient,
  runIds: readonly string[],
): Promise<Map<string, string>> {
  if (runIds.length === 0) return new Map();
  const { data, error } = await client
    .from("measurement_runs")
    .select("id, status")
    .in("id", runIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.id, row.status]));
}

export async function evaluateUmamiSnapshots(
  client: AdminClient,
  tenantId: string,
): Promise<UmamiRuleRunResult> {
  const { data: statsRows, error: statsError } = await client
    .from("umami_snapshots")
    .select(
      "website_id, website_name, run_id, returned_row_count, totals, period_start, period_end, provenance",
    )
    .eq("tenant_id", tenantId)
    .eq("metric", "stats")
    .order("period_end", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (statsError) throw new Error(statsError.message);

  const { data: referrerRows, error: referrerError } = await client
    .from("umami_snapshots")
    .select("website_id, website_name, returned_row_count, payload, period_start, period_end")
    .eq("tenant_id", tenantId)
    .eq("metric", "referrers")
    .order("period_end", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (referrerError) throw new Error(referrerError.message);

  const runIds = [
    ...new Set(
      (statsRows ?? [])
        .map((row) => row.run_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const runStatusById = await loadRunStatuses(client, runIds);

  const zeroRecordedReadings: UmamiStatsSnapshot[] = (statsRows ?? []).map((row) => ({
    websiteId: row.website_id,
    websiteName: row.website_name ?? row.website_id,
    runId: row.run_id,
    runStatus: row.run_id ? (runStatusById.get(row.run_id) ?? null) : null,
    returnedRowCount: row.returned_row_count,
    totals: row.totals,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    ownedMatch: parseOwnedMatch(row.provenance),
  }));

  const trafficShiftReadings: UmamiStatsWindowReading[] = (statsRows ?? []).map((row) => {
    const parsed = parseStatsTotals(row.totals);
    return {
      websiteId: row.website_id,
      websiteName: row.website_name ?? row.website_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      visitors: parsed?.["visitors"] ?? null,
      pageviews: parsed?.["pageviews"] ?? null,
    };
  });

  const referrerReadings: UmamiReferrerWindowReading[] = (referrerRows ?? []).map((row) => ({
    websiteId: row.website_id,
    websiteName: row.website_name ?? row.website_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    returnedRowCount: row.returned_row_count,
    rows: parseReferrerRows(row.payload),
  }));

  const observations: UmamiObservationDraft[] = [
    ...detectZeroRecorded(zeroRecordedReadings),
    ...detectSiteTrafficShift(trafficShiftReadings),
    ...detectReferrerSourceStopped(referrerReadings),
  ];

  const statsRowsRead = statsRows?.length ?? 0;
  const referrerRowsRead = referrerRows?.length ?? 0;

  if (observations.length === 0) {
    await logActivity(client, {
      tenantId,
      verb: "recommendation.no_change",
      subjectKind: "capability",
      summary: "Umami rules found nothing to raise.",
      payload: { statsRowsRead, referrerRowsRead },
    });
    return { statsRowsRead, referrerRowsRead, observations: 0, recommendations: 0, noChange: true };
  }

  let created = 0;

  for (const observation of observations) {
    // Mirrors pagespeed-rules.server.ts's scheme: module name in the
    // checksum, tenant scoped explicitly on the lookup rather than folded
    // into the fingerprint.
    const issueFingerprint = checksum(["umami", observation.rule, observation.target]);

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
        source_module: "umami",
        business_impact: observation.businessImpact,
        time_saved_minutes: 0,
        risk: "none",
        confidence: observation.confidence,
        reasoning: `Rule ${observation.rule} over stored umami_snapshots rows for ${observation.target}.`,
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
    actorId: "umami-rules",
    verb: "umami.rules.evaluated",
    subjectKind: "tenant",
    subjectId: tenantId,
    summary: `Read ${statsRowsRead} stats and ${referrerRowsRead} referrer snapshot(s) and filed ${created} new finding(s).`,
    payload: { statsRowsRead, referrerRowsRead, observations: observations.length, created },
  });

  return {
    statsRowsRead,
    referrerRowsRead,
    observations: observations.length,
    recommendations: created,
    noChange: false,
  };
}
