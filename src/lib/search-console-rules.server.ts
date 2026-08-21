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
  QUERY_DIMENSION_CAVEAT,
  type InspectionFacts,
  type PageMetaFacts,
} from "./search-console-rule-checks";
import { confidenceInCount, confidenceInCountChange } from "./confidence";
import {
  RULE_WINDOW_DAYS,
  RULE_WINDOW_KIND,
  SearchConsoleFailure,
  checksum,
  shiftDate,
  type QueryRow,
} from "./search-console.server";

type Client = SupabaseClient<Database>;

/**
 * Typed thresholds. Every rule reads its numbers from here, never inline.
 *
 * Every rule in this file is bucketed in RULE_ASSIGNMENTS
 * (rule-buckets.ts) per
 * docs/handoffs/2026-08-20-rule-thresholds-audit.md: striking_distance_query
 * and position_loss read the query dimension and are beyond_current_volume
 * (see QUERY_DIMENSION_CAVEAT); weak_ctr_page and visibility_gain are
 * pooled, answered honestly only alongside site_visibility_shift and
 * site_clicks_shift below, which judge the whole property at once.
 *
 * Defined in the pure `rule-thresholds.ts` and re-exported here so
 * `rule-buckets.ts` can reference the live numbers without pulling this
 * .server module (and its database/crypto chain) into client-reachable code.
 */
export { SEARCH_CONSOLE_THRESHOLDS } from "./rule-thresholds";
import { SEARCH_CONSOLE_THRESHOLDS } from "./rule-thresholds";

export type Rule =
  | "striking_distance_query"
  | "weak_ctr_page"
  | "position_loss"
  | "visibility_gain"
  | "possible_query_overlap"
  | "zero_impression_page"
  | "query_coverage_gap"
  | "index_coverage_drift"
  | "site_visibility_shift"
  | "site_clicks_shift";

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

/**
 * The snapshot for one dimension, from the rule window rather than a single day.
 *
 * The `kind` check is load-bearing: a daily snapshot and a window snapshot share
 * a `period_end_pt` and carry identical `dimensions`, so without it this would
 * return whichever the database happened to hand back first, and the rules would
 * silently judge one day again.
 */
function pick(snapshots: SnapshotRow[], dimension: string): SnapshotRow | undefined {
  return snapshots.find(
    (snapshot) =>
      snapshot.kind === RULE_WINDOW_KIND &&
      snapshot.dimensions.length === 1 &&
      snapshot.dimensions[0] === dimension,
  );
}

/** Site-wide totals stored on a `dimensional_rows_window` snapshot. */
function totalsOf(
  snapshot: SnapshotRow | undefined,
): { clicks: number; impressions: number } | null {
  const totals = snapshot?.totals as { clicks?: unknown; impressions?: unknown } | null | undefined;
  if (!totals || typeof totals.clicks !== "number" || typeof totals.impressions !== "number") {
    return null;
  }
  return { clicks: totals.clicks, impressions: totals.impressions };
}

/** Exported for tests — `evaluateSnapshots` below is the only production caller. */
export function evaluate(current: SnapshotRow[], prior: SnapshotRow[]): Observation[] {
  const observations: Observation[] = [];
  const t = SEARCH_CONSOLE_THRESHOLDS;

  const queries = rowsOf(pick(current, "query"));
  const priorQueries = rowsOf(pick(prior, "query"));
  const pageSnapshot = pick(current, "page");
  const priorPageSnapshot = pick(prior, "page");
  const pages = rowsOf(pageSnapshot);
  const priorPages = rowsOf(priorPageSnapshot);

  for (const row of queries) {
    const term = row.keys?.[0] ?? "";
    if (
      row.impressions >= t.strikingDistance.minImpressions &&
      row.position >= t.strikingDistance.minPosition &&
      row.position <= t.strikingDistance.maxPosition
    ) {
      const confidence = confidenceInCount(row.impressions, t.strikingDistance.minImpressions);
      observations.push({
        rule: "striking_distance_query",
        target: term,
        title: `Striking distance query: "${term}"`,
        description: `"${term}" averages position ${row.position.toFixed(1)} on ${row.impressions} impressions. Small relevance gains on the ranking page could move it onto page one. ${QUERY_DIMENSION_CAVEAT}`,
        evidence: { query: term, ...row, confidenceReason: confidence.reason },
        businessImpact: row.impressions > 500 ? "high" : "medium",
        confidence: confidence.value,
      });
    }

    const before = priorQueries.find((candidate) => candidate.keys?.[0] === term);
    if (
      before &&
      row.impressions >= t.positionLoss.minImpressions &&
      row.position - before.position >= t.positionLoss.minPositionDrop
    ) {
      const confidence = confidenceInCount(row.impressions, t.positionLoss.minImpressions);
      observations.push({
        rule: "position_loss",
        target: term,
        title: `Position loss on "${term}"`,
        description: `Average position moved from ${before.position.toFixed(1)} to ${row.position.toFixed(1)} on ${row.impressions} impressions. ${QUERY_DIMENSION_CAVEAT}`,
        evidence: { query: term, before, after: row, confidenceReason: confidence.reason },
        businessImpact: "high",
        confidence: confidence.value,
      });
    }
  }

  for (const row of pages) {
    const page = row.keys?.[0] ?? "";
    const ctr = row.impressions > 0 ? row.clicks / row.impressions : null;
    if (row.impressions >= t.weakCtr.minImpressions && ctr !== null && ctr <= t.weakCtr.maxCtr) {
      const confidence = confidenceInCount(row.impressions, t.weakCtr.minImpressions);
      observations.push({
        rule: "weak_ctr_page",
        target: page,
        title: `Weak click-through on ${page}`,
        description: `${row.impressions} impressions produced ${row.clicks} clicks (${(ctr * 100).toFixed(2)}% CTR) at average position ${row.position.toFixed(1)}.`,
        evidence: { page, ...row, ctr, confidenceReason: confidence.reason },
        businessImpact: "medium",
        confidence: confidence.value,
      });
    }

    const before = priorPages.find((candidate) => candidate.keys?.[0] === page);
    if (
      before &&
      before.impressions >= t.visibilityGain.minImpressions &&
      (row.impressions - before.impressions) / before.impressions >=
        t.visibilityGain.minImpressionGrowth
    ) {
      const confidence = confidenceInCountChange(before.impressions, row.impressions);
      observations.push({
        rule: "visibility_gain",
        target: page,
        title: `Visibility gain on ${page}`,
        description: `Impressions rose from ${before.impressions} to ${row.impressions}. Worth reinforcing while the page is trending.`,
        evidence: { page, before, after: row, confidenceReason: confidence.reason },
        businessImpact: "medium",
        confidence: confidence.value,
      });
    }
  }

  // Pooled site-level rules: the pages Search Console stored, judged
  // together, off the totals already stored on the page-dimension window
  // snapshot. That total is a sum over whatever rows Search Console
  // returned for the property, which "stores top data rows and not all
  // data rows" — it is not Google's own property-wide total, so the copy
  // below says what was actually summed rather than "your whole site". A
  // missing prior window means no comparison exists, not that nothing
  // changed, so both stay silent rather than reading absence as zero.
  const currentTotals = totalsOf(pageSnapshot);
  const priorTotals = totalsOf(priorPageSnapshot);
  if (currentTotals && priorTotals) {
    const impressionConfidence = confidenceInCountChange(
      priorTotals.impressions,
      currentTotals.impressions,
    );
    // Stated choice: a medium-band finding still fires here, rather than
    // requiring "high", because it carries its derived confidence and a
    // "not firm enough to act on alone" reason alongside it — that is
    // honest disclosure, not noise. Silencing medium-band evidence would
    // hide real site-level shifts at a volume where nothing else can see
    // them.
    if (impressionConfidence.band !== "low") {
      const direction = currentTotals.impressions > priorTotals.impressions ? "more" : "less";
      observations.push({
        rule: "site_visibility_shift",
        target: "site",
        title: `The pages Search Console stored are being shown ${direction} than last month`,
        description: `Across the pages Search Console stored, impressions moved from ${priorTotals.impressions} to ${currentTotals.impressions} between the two most recent non-overlapping 28-day windows (the prior window ending ${priorPageSnapshot?.period_end_pt}). ${impressionConfidence.reason}`,
        evidence: {
          priorImpressions: priorTotals.impressions,
          currentImpressions: currentTotals.impressions,
          priorPeriodEndPt: priorPageSnapshot?.period_end_pt ?? null,
          confidenceReason: impressionConfidence.reason,
        },
        businessImpact: "medium",
        confidence: impressionConfidence.value,
      });
    }

    const clickConfidence = confidenceInCountChange(priorTotals.clicks, currentTotals.clicks);
    // Stated choice: see the comment above the impression gate — the same
    // reasoning applies to clicks.
    if (clickConfidence.band !== "low") {
      const direction = currentTotals.clicks > priorTotals.clicks ? "more" : "fewer";
      observations.push({
        rule: "site_clicks_shift",
        target: "site",
        title: `The pages Search Console stored are getting ${direction} clicks than last month`,
        description: `Across the pages Search Console stored, clicks moved from ${priorTotals.clicks} to ${currentTotals.clicks} between the two most recent non-overlapping 28-day windows (the prior window ending ${priorPageSnapshot?.period_end_pt}). ${clickConfidence.reason}`,
        evidence: {
          priorClicks: priorTotals.clicks,
          currentClicks: currentTotals.clicks,
          priorPeriodEndPt: priorPageSnapshot?.period_end_pt ?? null,
          confidenceReason: clickConfidence.reason,
        },
        businessImpact: "medium",
        confidence: clickConfidence.value,
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
  // The prior window must not overlap the current one. Two 28-day windows a
  // week apart share 21 days, so diffing them manufactures a change out of a
  // seven-day shift — the same trap the analytics comparison already refuses.
  // The honest comparison is the window that ends the day before this one starts.
  const priorDate = shiftDate(reportingDate, -RULE_WINDOW_DAYS);

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
      { onConflict: "tenant_id,observation_fingerprint", ignoreDuplicates: true },
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
