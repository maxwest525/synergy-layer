import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import {
  detectInspectionDrift,
  detectQueryCoverageGaps,
  detectQueryOverlap,
  detectZeroImpressionPages,
  type InspectionFacts,
  type PageMetaFacts,
} from "./search-console-rule-checks";
import { SearchConsoleFailure, checksum, shiftDate, type QueryRow } from "./search-console.server";

type Client = SupabaseClient<Database>;

/** Typed thresholds. Every rule reads its numbers from here, never inline. */
export const SEARCH_CONSOLE_THRESHOLDS = {
  strikingDistance: { minPosition: 8, maxPosition: 20, minImpressions: 50 },
  weakCtr: { minImpressions: 200, maxCtr: 0.01 },
  positionLoss: { minImpressions: 100, minPositionDrop: 3 },
  visibilityGain: { minImpressions: 100, minImpressionGrowth: 0.35 },
  queryOverlap: { minImpressionsPerPage: 25, minPages: 2 },
  comparisonWindowDays: 7,
} as const;

export type Rule =
  | "striking_distance_query"
  | "weak_ctr_page"
  | "position_loss"
  | "visibility_gain"
  | "possible_query_overlap"
  | "zero_impression_page"
  | "query_coverage_gap"
  | "index_coverage_drift";

type Observation = {
  rule: Rule;
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  confidence: number;
};

type SnapshotRow = {
  id: string;
  dimensions: string[];
  kind: string;
  period_end_pt: string;
  payload: unknown;
  totals: unknown;
};

function rowsOf(snapshot: SnapshotRow | undefined): QueryRow[] {
  const payload = (snapshot?.payload ?? {}) as { rows?: QueryRow[] };
  return payload.rows ?? [];
}

function pick(snapshots: SnapshotRow[], dimension: string): SnapshotRow | undefined {
  return snapshots.find(
    (snapshot) => snapshot.dimensions.length === 1 && snapshot.dimensions[0] === dimension,
  );
}

function evaluate(current: SnapshotRow[], prior: SnapshotRow[]): Observation[] {
  const observations: Observation[] = [];
  const t = SEARCH_CONSOLE_THRESHOLDS;

  const queries = rowsOf(pick(current, "query"));
  const priorQueries = rowsOf(pick(prior, "query"));
  const pages = rowsOf(pick(current, "page"));
  const priorPages = rowsOf(pick(prior, "page"));

  for (const row of queries) {
    const term = row.keys?.[0] ?? "";
    if (
      row.impressions >= t.strikingDistance.minImpressions &&
      row.position >= t.strikingDistance.minPosition &&
      row.position <= t.strikingDistance.maxPosition
    ) {
      observations.push({
        rule: "striking_distance_query",
        target: term,
        title: `Striking distance query: "${term}"`,
        description: `"${term}" averages position ${row.position.toFixed(1)} on ${row.impressions} impressions. Small relevance gains on the ranking page could move it onto page one.`,
        evidence: { query: term, ...row },
        businessImpact: row.impressions > 500 ? "high" : "medium",
        confidence: 0.7,
      });
    }

    const before = priorQueries.find((candidate) => candidate.keys?.[0] === term);
    if (
      before &&
      row.impressions >= t.positionLoss.minImpressions &&
      row.position - before.position >= t.positionLoss.minPositionDrop
    ) {
      observations.push({
        rule: "position_loss",
        target: term,
        title: `Position loss on "${term}"`,
        description: `Average position moved from ${before.position.toFixed(1)} to ${row.position.toFixed(1)} on ${row.impressions} impressions.`,
        evidence: { query: term, before, after: row },
        businessImpact: "high",
        confidence: 0.65,
      });
    }
  }

  for (const row of pages) {
    const page = row.keys?.[0] ?? "";
    const ctr = row.impressions > 0 ? row.clicks / row.impressions : null;
    if (row.impressions >= t.weakCtr.minImpressions && ctr !== null && ctr <= t.weakCtr.maxCtr) {
      observations.push({
        rule: "weak_ctr_page",
        target: page,
        title: `Weak click-through on ${page}`,
        description: `${row.impressions} impressions produced ${row.clicks} clicks (${(ctr * 100).toFixed(2)}% CTR) at average position ${row.position.toFixed(1)}.`,
        evidence: { page, ...row, ctr },
        businessImpact: "medium",
        confidence: 0.6,
      });
    }

    const before = priorPages.find((candidate) => candidate.keys?.[0] === page);
    if (
      before &&
      before.impressions >= t.visibilityGain.minImpressions &&
      (row.impressions - before.impressions) / before.impressions >=
        t.visibilityGain.minImpressionGrowth
    ) {
      observations.push({
        rule: "visibility_gain",
        target: page,
        title: `Visibility gain on ${page}`,
        description: `Impressions rose from ${before.impressions} to ${row.impressions}. Worth reinforcing while the page is trending.`,
        evidence: { page, before, after: row },
        businessImpact: "medium",
        confidence: 0.6,
      });
    }
  }

  return observations;
}

/**
 * Rules that need stored context beyond the two snapshot windows: the
 * page+query snapshot, audited page metadata, and the latest URL inspection
 * per page. All reads are bounded; none touch the Search Console API.
 */
async function evaluateStoredContext(
  client: Client,
  property: string,
  current: SnapshotRow[],
): Promise<Observation[]> {
  const pageQueryRows = rowsOf(current.find((snapshot) => snapshot.kind === "page_query"));
  const pageRows = rowsOf(pick(current, "page"));

  const { data: metaRows, error: metaError } = await client
    .from("page_metadata_observations")
    .select("url, title, h1, observed_at")
    .order("observed_at", { ascending: false })
    .limit(800);
  if (metaError) throw new SearchConsoleFailure("persistence", metaError.message);

  const metaByUrl = new Map<string, PageMetaFacts>();
  for (const row of metaRows ?? []) {
    if (!metaByUrl.has(row.url)) {
      metaByUrl.set(row.url, { url: row.url, title: row.title, h1: row.h1 });
    }
  }

  const { data: inspectionRows, error: inspectionError } = await client
    .from("search_console_url_inspections")
    .select(
      "inspected_url, verdict, coverage_state, indexing_state, google_canonical, user_canonical, last_crawl_time, inspected_at",
    )
    .eq("property", property)
    .order("inspected_at", { ascending: false })
    .limit(500);
  if (inspectionError) throw new SearchConsoleFailure("persistence", inspectionError.message);

  const latestInspections = new Map<string, InspectionFacts>();
  for (const row of inspectionRows ?? []) {
    if (!latestInspections.has(row.inspected_url)) {
      latestInspections.set(row.inspected_url, {
        inspectedUrl: row.inspected_url,
        verdict: row.verdict,
        coverageState: row.coverage_state,
        indexingState: row.indexing_state,
        googleCanonical: row.google_canonical,
        userCanonical: row.user_canonical,
        lastCrawlTime: row.last_crawl_time,
      });
    }
  }

  return [
    ...detectQueryOverlap(pageQueryRows),
    ...detectZeroImpressionPages([...metaByUrl.keys()], pageRows),
    ...detectQueryCoverageGaps(pageQueryRows, metaByUrl),
    ...detectInspectionDrift([...latestInspections.values()], new Date()),
  ];
}

export type RuleRunResult = {
  reportingDate: string | null;
  observations: number;
  recommendations: number;
  noChange: boolean;
};

/**
 * Evidence-backed rules over stored snapshots. Zero rows is a valid, healthy
 * "no change" outcome, not a failure.
 */
export async function evaluateSnapshots(
  client: Client,
  property: string,
  reportingDate: string,
): Promise<RuleRunResult> {
  const priorDate = shiftDate(reportingDate, -SEARCH_CONSOLE_THRESHOLDS.comparisonWindowDays);

  const { data: currentRows, error: currentError } = await client
    .from("search_console_snapshots")
    .select("id, dimensions, kind, period_end_pt, payload, totals")
    .eq("property", property)
    .eq("period_end_pt", reportingDate);
  if (currentError) throw new SearchConsoleFailure("persistence", currentError.message);

  const { data: priorRows, error: priorError } = await client
    .from("search_console_snapshots")
    .select("id, dimensions, kind, period_end_pt, payload, totals")
    .eq("property", property)
    .eq("period_end_pt", priorDate);
  if (priorError) throw new SearchConsoleFailure("persistence", priorError.message);

  const current = (currentRows ?? []) as SnapshotRow[];
  const observations = evaluate(current, (priorRows ?? []) as SnapshotRow[]);
  observations.push(...(await evaluateStoredContext(client, property, current)));

  if (observations.length === 0) {
    await logActivity(client, {
      verb: "recommendation.no_change",
      subjectKind: "capability",
      summary: `Search Console rules found nothing to raise for ${property} on ${reportingDate} (Pacific).`,
      payload: { property, reportingDate },
    });
    return { reportingDate, observations: 0, recommendations: 0, noChange: true };
  }

  const anchorSnapshot = current[0]?.id ?? null;
  if (!anchorSnapshot) {
    return { reportingDate, observations: 0, recommendations: 0, noChange: true };
  }

  let created = 0;

  for (const observation of observations) {
    const issueFingerprint = checksum([property, observation.rule, observation.target]);
    const observationFingerprint = checksum([issueFingerprint, reportingDate, anchorSnapshot]);

    const { data: openRecommendation, error: openError } = await client
      .from("recommendations")
      .select("id, state")
      .eq("issue_fingerprint", issueFingerprint)
      .not("state", "in", "(applied,verified,rejected,rolled_back)")
      .maybeSingle();
    if (openError) throw new SearchConsoleFailure("persistence", openError.message);

    let recommendationId = openRecommendation?.id ?? null;

    if (!recommendationId) {
      const { data: inserted, error: insertError } = await client
        .from("recommendations")
        .insert(
          observationRecommendationRecord({
            tenant_id: await requireTenantId(client),
            title: observation.title,
            description: observation.description,
            source_module: "search-console",
            business_impact: observation.businessImpact,
            revenue_impact: observation.businessImpact,
            traffic_impact: observation.businessImpact,
            time_saved_minutes: 0,
            risk: "none",
            confidence: observation.confidence,
            reasoning: `Rule ${observation.rule} over finalized Search Console data for ${reportingDate} (Pacific).`,
            suggested_action: {
              kind: "review",
              rule: observation.rule,
              target: observation.target,
            } as never,
            issue_fingerprint: issueFingerprint,
            metadata: { property, rule: observation.rule } as never,
          }),
        )
        .select("id")
        .single();
      if (insertError) throw new SearchConsoleFailure("persistence", insertError.message);
      recommendationId = inserted.id;
      created += 1;
    }

    const { error: observationError } = await client.from("search_console_observations").upsert(
      {
        tenant_id: await requireTenantId(client),
        snapshot_id: anchorSnapshot,
        recommendation_id: recommendationId,
        rule: observation.rule,
        property,
        target: observation.target,
        issue_fingerprint: issueFingerprint,
        observation_fingerprint: observationFingerprint,
        period_start_pt: reportingDate,
        period_end_pt: reportingDate,
        evidence: observation.evidence as never,
      },
      { onConflict: "observation_fingerprint", ignoreDuplicates: true },
    );
    if (observationError) throw new SearchConsoleFailure("persistence", observationError.message);
  }

  return {
    reportingDate,
    observations: observations.length,
    recommendations: created,
    noChange: false,
  };
}
