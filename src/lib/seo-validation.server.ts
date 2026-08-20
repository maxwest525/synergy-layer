import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenantId } from "./tenant.server";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import { SearchConsoleFailure, checksum, type QueryRow } from "./search-console.server";
import { confidenceInCount, confidenceInCountChange, type Confidence } from "./confidence";

type Client = SupabaseClient<Database>;

/**
 * Typed SEO validation thresholds. Every rule reads its numbers from here so a
 * rule can never trigger on an inline magic number.
 */
export const SEO_VALIDATION_THRESHOLDS = {
  decliningTraffic: { minPreviousClicks: 10, minClickDropRatio: 0.3 },
  decliningImpressions: { minPreviousImpressions: 100, minImpressionDropRatio: 0.25 },
  decliningPosition: { minImpressions: 50, minPositionDrop: 3 },
  highImpressionLowCtr: { minImpressions: 200, maxCtr: 0.01 },
  zeroClickPage: { minImpressions: 150 },
  queryOverlap: { minImpressionsPerPage: 25, minPages: 2, minPeriods: 2, minTotalImpressions: 50 },
  significantChange: { minPreviousImpressions: 100, minChangeRatio: 0.5 },
  researchTraction: { minImpressions: 20, minImpressionGrowth: 0.25 },
  // Competitor evidence. These read observed SERP profiles, never estimates.
  competitorOutranks: { minQueries: 3, minConfidence: 0.5 },
  ownedSerpAbsence: { minAbsentSerps: 5, minShareAbsent: 0.25 },
} as const;

export type SeoRule =
  | "declining_clicks"
  | "declining_impressions"
  | "declining_position"
  | "high_impression_low_ctr"
  | "zero_click_page"
  | "possible_query_overlap"
  | "significant_period_change"
  | "research_page_traction"
  | "competitor_outranks_owned"
  | "owned_absent_from_approved_serps";

export const SEO_RULES: SeoRule[] = [
  "declining_clicks",
  "declining_impressions",
  "declining_position",
  "high_impression_low_ctr",
  "zero_click_page",
  "possible_query_overlap",
  "significant_period_change",
  "research_page_traction",
  "competitor_outranks_owned",
  "owned_absent_from_approved_serps",
];

/**
 * Narrow extension of the evidence contract. Until now every rule consumed
 * Search Console rows. Competitor rules consume the SERP-derived competitor
 * profiles instead, in the same Finding shape, so the persistence, dedup, and
 * approval path stay exactly as they are.
 */
export type CompetitorEvidence = {
  ownDomain: string;
  serpsAnalysed: number;
  ownedAbsentSerps: string[];
  profiles: {
    domain: string;
    domainClass: string;
    serpsPresent: number;
    serpShare: number;
    medianPosition: number;
    outranksOwned: { keyword: string; competitorPosition: number; ownedPosition: number | null }[];
    ownedOutranks: { keyword: string; competitorPosition: number; ownedPosition: number }[];
    confidence: number;
    shortlisted: boolean;
    pageEvidence: Record<string, unknown> | null;
  }[];
};

type Metrics = { clicks: number; impressions: number; ctr: number; position: number };

type Finding = {
  rule: SeoRule;
  targetKind: "page" | "query" | "property";
  target: string;
  title: string;
  description: string;
  current: Metrics | null;
  previous: Metrics | null;
  change: Record<string, unknown>;
  snapshotId: string | null;
  priorSnapshotId: string | null;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  /**
   * Derived from the counts the rule actually saw, never a literal. Every one
   * of these used to be a bare `0.7`, so a click drop from 400 to 100 and one
   * from 8 to 6 both reached the operator looking equally certain.
   */
  confidence: Confidence;
  suggestedAction: Record<string, unknown>;
};

type SnapshotRow = {
  id: string;
  dimensions: string[];
  kind: string;
  period_end_pt: string;
  period_start_pt: string;
  payload: unknown;
  totals: unknown;
};

function metricsOf(row: QueryRow): Metrics {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    position: row.position,
  };
}

function rowsOf(snapshot: SnapshotRow | undefined): QueryRow[] {
  const payload = (snapshot?.payload ?? {}) as { rows?: QueryRow[] };
  return payload.rows ?? [];
}

function pick(snapshots: SnapshotRow[], dimension: string): SnapshotRow | undefined {
  return snapshots.find(
    (snapshot) => snapshot.dimensions.length === 1 && snapshot.dimensions[0] === dimension,
  );
}

function ratio(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function pct(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

/** Pure rule evaluation over already-stored snapshot rows. */
export function evaluateSeoRules(
  current: SnapshotRow[],
  prior: SnapshotRow[],
  researchUrls: string[],
): Finding[] {
  const t = SEO_VALIDATION_THRESHOLDS;
  const findings: Finding[] = [];

  const pageSnapshot = pick(current, "page");
  const priorPageSnapshot = pick(prior, "page");
  const querySnapshot = pick(current, "query");
  const priorQuerySnapshot = pick(prior, "query");

  const pages = rowsOf(pageSnapshot);
  const priorPages = rowsOf(priorPageSnapshot);
  const queries = rowsOf(querySnapshot);
  const priorQueries = rowsOf(priorQuerySnapshot);

  const pageId = pageSnapshot?.id ?? null;
  const priorPageId = priorPageSnapshot?.id ?? null;
  const queryId = querySnapshot?.id ?? null;
  const priorQueryId = priorQuerySnapshot?.id ?? null;

  for (const row of pages) {
    const page = row.keys?.[0] ?? "";
    const now = metricsOf(row);
    const beforeRow = priorPages.find((candidate) => candidate.keys?.[0] === page);
    const before = beforeRow ? metricsOf(beforeRow) : null;

    const clickChange = before ? ratio(now.clicks, before.clicks) : null;
    const impressionChange = before ? ratio(now.impressions, before.impressions) : null;

    if (
      before &&
      before.clicks >= t.decliningTraffic.minPreviousClicks &&
      clickChange !== null &&
      clickChange <= -t.decliningTraffic.minClickDropRatio
    ) {
      findings.push({
        rule: "declining_clicks",
        targetKind: "page",
        target: page,
        title: `Clicks declining on ${page}`,
        description: `Clicks fell from ${before.clicks} to ${now.clicks} (${pct(clickChange)}) between the comparison and current reporting periods.`,
        current: now,
        previous: before,
        change: { clicksAbsolute: now.clicks - before.clicks, clicksPercent: clickChange },
        snapshotId: pageId,
        priorSnapshotId: priorPageId,
        businessImpact: before.clicks >= 100 ? "high" : "medium",
        confidence: confidenceInCountChange(before.clicks, now.clicks),
        suggestedAction: { kind: "review", area: "page_traffic_decline", target: page },
      });
    }

    if (
      before &&
      before.impressions >= t.decliningImpressions.minPreviousImpressions &&
      impressionChange !== null &&
      impressionChange <= -t.decliningImpressions.minImpressionDropRatio
    ) {
      findings.push({
        rule: "declining_impressions",
        targetKind: "page",
        target: page,
        title: `Impressions declining on ${page}`,
        description: `Impressions fell from ${before.impressions} to ${now.impressions} (${pct(impressionChange)}).`,
        current: now,
        previous: before,
        change: {
          impressionsAbsolute: now.impressions - before.impressions,
          impressionsPercent: impressionChange,
        },
        snapshotId: pageId,
        priorSnapshotId: priorPageId,
        businessImpact: "medium",
        confidence: confidenceInCountChange(before.impressions, now.impressions),
        suggestedAction: { kind: "review", area: "page_visibility_decline", target: page },
      });
    }

    if (
      now.impressions >= t.highImpressionLowCtr.minImpressions &&
      now.ctr <= t.highImpressionLowCtr.maxCtr
    ) {
      findings.push({
        rule: "high_impression_low_ctr",
        targetKind: "page",
        target: page,
        title: `High impressions, low click-through on ${page}`,
        description: `${now.impressions} impressions produced ${now.clicks} clicks (${(now.ctr * 100).toFixed(2)}% CTR) at average position ${now.position.toFixed(1)}.`,
        current: now,
        previous: before,
        change: {
          ctrAbsolute: before ? now.ctr - before.ctr : null,
          ctrPercent: before ? ratio(now.ctr, before.ctr) : null,
        },
        snapshotId: pageId,
        priorSnapshotId: priorPageId,
        businessImpact: "medium",
        confidence: confidenceInCount(now.impressions, t.highImpressionLowCtr.minImpressions),
        suggestedAction: { kind: "review", area: "title_and_meta_relevance", target: page },
      });
    }

    if (now.clicks === 0 && now.impressions >= t.zeroClickPage.minImpressions) {
      findings.push({
        rule: "zero_click_page",
        targetKind: "page",
        target: page,
        title: `Zero clicks despite impressions on ${page}`,
        description: `${now.impressions} impressions returned no clicks at average position ${now.position.toFixed(1)}.`,
        current: now,
        previous: before,
        change: {
          clicksAbsolute: before ? now.clicks - before.clicks : null,
          clicksPercent: clickChange,
        },
        snapshotId: pageId,
        priorSnapshotId: priorPageId,
        businessImpact: "medium",
        confidence: confidenceInCount(now.impressions, t.zeroClickPage.minImpressions),
        suggestedAction: { kind: "review", area: "zero_click_page", target: page },
      });
    }

    if (
      before &&
      before.impressions >= t.significantChange.minPreviousImpressions &&
      impressionChange !== null &&
      Math.abs(impressionChange) >= t.significantChange.minChangeRatio
    ) {
      findings.push({
        rule: "significant_period_change",
        targetKind: "page",
        target: page,
        title: `Significant period-over-period change on ${page}`,
        description: `Impressions moved ${pct(impressionChange)} (${before.impressions} to ${now.impressions}) between the comparison and current periods.`,
        current: now,
        previous: before,
        change: {
          impressionsAbsolute: now.impressions - before.impressions,
          impressionsPercent: impressionChange,
          clicksAbsolute: now.clicks - before.clicks,
          clicksPercent: clickChange,
        },
        snapshotId: pageId,
        priorSnapshotId: priorPageId,
        businessImpact: "medium",
        confidence: confidenceInCountChange(before.impressions, now.impressions),
        suggestedAction: { kind: "review", area: "period_change", target: page },
      });
    }

    const isResearchPage = researchUrls.some((url) => url && page.startsWith(url));
    if (
      isResearchPage &&
      before &&
      now.impressions >= t.researchTraction.minImpressions &&
      impressionChange !== null &&
      impressionChange >= t.researchTraction.minImpressionGrowth
    ) {
      findings.push({
        rule: "research_page_traction",
        targetKind: "page",
        target: page,
        title: `Research-backed page gaining traction: ${page}`,
        description: `Impressions rose from ${before.impressions} to ${now.impressions} (${pct(impressionChange)}) on a page covered by stored research.`,
        current: now,
        previous: before,
        change: {
          impressionsAbsolute: now.impressions - before.impressions,
          impressionsPercent: impressionChange,
        },
        snapshotId: pageId,
        priorSnapshotId: priorPageId,
        businessImpact: "medium",
        confidence: confidenceInCountChange(before.impressions, now.impressions),
        suggestedAction: { kind: "review", area: "reinforce_trending_page", target: page },
      });
    }
  }

  for (const row of queries) {
    const term = row.keys?.[0] ?? "";
    const now = metricsOf(row);
    const beforeRow = priorQueries.find((candidate) => candidate.keys?.[0] === term);
    const before = beforeRow ? metricsOf(beforeRow) : null;

    if (
      before &&
      now.impressions >= t.decliningPosition.minImpressions &&
      now.position - before.position >= t.decliningPosition.minPositionDrop
    ) {
      findings.push({
        rule: "declining_position",
        targetKind: "query",
        target: term,
        title: `Average position declining for "${term}"`,
        description: `Average position moved from ${before.position.toFixed(1)} to ${now.position.toFixed(1)} on ${now.impressions} impressions.`,
        current: now,
        previous: before,
        change: {
          positionAbsolute: now.position - before.position,
          positionPercent: ratio(now.position, before.position),
        },
        snapshotId: queryId,
        priorSnapshotId: priorQueryId,
        businessImpact: "high",
        confidence: confidenceInCount(now.impressions, t.decliningPosition.minImpressions),
        suggestedAction: { kind: "review", area: "ranking_loss", target: term },
      });
    }
  }

  // Possible query overlap: one query drawing meaningful impressions across
  // several pages, and doing so in every configured period. Never presented as
  // confirmed cannibalisation.
  const pageQueryOf = (snapshots: SnapshotRow[]): SnapshotRow | undefined =>
    snapshots.find((snapshot) => snapshot.kind === "page_query");

  const overlapSnapshot = pageQueryOf(current);
  const priorOverlapSnapshot = pageQueryOf(prior);

  const overlapBuckets = (snapshot: SnapshotRow | undefined) => {
    const byQuery = new Map<string, { page: string; impressions: number }[]>();
    if (!snapshot) return byQuery;
    const dims = snapshot.dimensions;
    for (const row of rowsOf(snapshot)) {
      const keys = row.keys ?? [];
      const term = keys[dims.indexOf("query")] ?? "";
      const page = keys[dims.indexOf("page")] ?? "";
      if (!term || !page) continue;
      if (row.impressions < t.queryOverlap.minImpressionsPerPage) continue;
      const bucket = byQuery.get(term) ?? [];
      bucket.push({ page, impressions: row.impressions });
      byQuery.set(term, bucket);
    }
    return byQuery;
  };

  const periodsAvailable = [overlapSnapshot, priorOverlapSnapshot].filter(Boolean).length;
  if (overlapSnapshot && periodsAvailable >= t.queryOverlap.minPeriods) {
    const currentBuckets = overlapBuckets(overlapSnapshot);
    const priorBuckets = overlapBuckets(priorOverlapSnapshot);

    for (const [term, bucket] of currentBuckets) {
      if (bucket.length < t.queryOverlap.minPages) continue;
      const priorBucket = priorBuckets.get(term) ?? [];
      if (priorBucket.length < t.queryOverlap.minPages) continue;
      const impressions = bucket.reduce((sum, entry) => sum + entry.impressions, 0);
      if (impressions < t.queryOverlap.minTotalImpressions) continue;
      findings.push({
        rule: "possible_query_overlap",
        targetKind: "query",
        target: term,
        title: `Possible page overlap on "${term}"`,
        description: `${bucket.length} pages each drew at least ${t.queryOverlap.minImpressionsPerPage} impressions for the same query, in ${t.queryOverlap.minPeriods} consecutive finalized periods. This is a signal worth reviewing, not confirmed cannibalisation.`,
        current: { clicks: 0, impressions, ctr: 0, position: 0 },
        previous: null,
        change: { pages: bucket, priorPages: priorBucket, periods: periodsAvailable },
        snapshotId: overlapSnapshot.id,
        priorSnapshotId: priorOverlapSnapshot?.id ?? null,
        businessImpact: "low",
        confidence: confidenceInCount(impressions, t.queryOverlap.minTotalImpressions),
        suggestedAction: { kind: "review", area: "possible_query_overlap", target: term },
      });
    }
  }

  return findings;
}

/**
 * Reads stored competitor profiles for the owned property. Returns null when no
 * competitor intelligence pass has run, which keeps the competitor rules
 * ineligible rather than guessing.
 */
async function loadCompetitorEvidence(
  client: Client,
  property: string,
): Promise<CompetitorEvidence | null> {
  const ownDomain = property
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const { data, error } = await client
    .from("competitor_candidates")
    .select("domain, domain_class, metrics")
    .eq("seed_domain", ownDomain);
  if (error) throw new SearchConsoleFailure("persistence", error.message);

  let serpsAnalysed = 0;
  let ownedAbsentSerps: string[] = [];
  const profiles: CompetitorEvidence["profiles"] = [];

  for (const row of data ?? []) {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    const pass = metrics["intelligence_pass"] as Record<string, unknown> | undefined;
    if (!pass) continue;
    serpsAnalysed = Math.max(serpsAnalysed, Number(pass["serps_analysed"] ?? 0));
    const absent = pass["owned_absent_serps"];
    if (Array.isArray(absent) && absent.length > ownedAbsentSerps.length) {
      // Property-level absence recorded by the intelligence pass.
      ownedAbsentSerps = absent.map(String);
    }
    profiles.push({
      domain: row.domain,
      domainClass: row.domain_class,
      serpsPresent: Number(pass["serps_present"] ?? 0),
      serpShare: Number(pass["serp_share"] ?? 0),
      medianPosition: Number(pass["median_position"] ?? 0),
      outranksOwned: (pass["outranks_owned"] ??
        []) as CompetitorEvidence["profiles"][number]["outranksOwned"],
      ownedOutranks: (pass["owned_outranks"] ??
        []) as CompetitorEvidence["profiles"][number]["ownedOutranks"],
      confidence: Number(pass["confidence"] ?? 0),
      shortlisted: Boolean(pass["shortlisted"]),
      pageEvidence: (metrics["page_evidence"] as Record<string, unknown>) ?? null,
    });
  }

  if (profiles.length === 0 || serpsAnalysed === 0) return null;
  return { ownDomain, serpsAnalysed, ownedAbsentSerps, profiles };
}

/**
 * Competitor rules. They only become eligible once real SERP-derived competitor
 * evidence exists; with no evidence they return nothing, exactly like a
 * Search Console rule with no snapshot.
 */
export function evaluateCompetitorRules(evidence: CompetitorEvidence | null): Finding[] {
  const findings: Finding[] = [];
  if (!evidence || evidence.serpsAnalysed === 0) return findings;

  const outrank = SEO_VALIDATION_THRESHOLDS.competitorOutranks;
  for (const profile of evidence.profiles) {
    if (profile.domainClass !== "competitor") continue;
    if (!profile.shortlisted) continue;
    if (profile.outranksOwned.length < outrank.minQueries) continue;
    if (profile.confidence < outrank.minConfidence) continue;

    const queries = profile.outranksOwned.map((row) => row.keyword);
    const headToHead = profile.outranksOwned.filter((row) => row.ownedPosition !== null).length;

    findings.push({
      rule: "competitor_outranks_owned",
      targetKind: "query",
      target: profile.domain,
      title: `${profile.domain} outranks the owned property on ${profile.outranksOwned.length} approved queries`,
      description: `Across ${evidence.serpsAnalysed} observed SERPs for operator-approved keywords, ${profile.domain} appears in ${profile.serpsPresent} (${Math.round(profile.serpShare * 100)}%) at a median organic position of ${profile.medianPosition}. It ranks ahead of ${evidence.ownDomain} on ${profile.outranksOwned.length} of those queries (${headToHead} head to head, ${profile.outranksOwned.length - headToHead} where the owned property does not rank in the top 20). ${evidence.ownDomain} ranks ahead on ${profile.ownedOutranks.length}. Candidate confidence ${profile.confidence}: classification is heuristic, so this is a ranking rival on observed queries, not a confirmed business competitor.`,
      current: null,
      previous: null,
      change: {
        competitorDomain: profile.domain,
        serpsPresent: profile.serpsPresent,
        serpShare: profile.serpShare,
        medianPosition: profile.medianPosition,
        queriesCompetitorWins: queries.slice(0, 25),
        queriesOwnedWins: profile.ownedOutranks.map((row) => row.keyword).slice(0, 25),
        pageEvidence: profile.pageEvidence,
      },
      snapshotId: null,
      priorSnapshotId: null,
      businessImpact: profile.serpShare >= 0.5 ? "high" : "medium",
      // This one is not a count at all: it is the heuristic classifier's own
      // score for "is this domain really a competitor". It is carried through
      // verbatim, with that named, rather than dressed up as a measurement.
      confidence: {
        value: profile.confidence,
        band: profile.confidence >= 0.75 ? "high" : profile.confidence >= 0.4 ? "medium" : "low",
        reason: `Domain classification is heuristic. ${profile.domain} scored ${profile.confidence} as a competitor across ${evidence.serpsAnalysed} observed SERPs, so this is a ranking rival on observed queries, not a confirmed business competitor.`,
      },
      suggestedAction: {
        kind: "review_competitor_evidence",
        domain: profile.domain,
        note: "Review the observed page evidence for this domain and decide whether to track it as a competitor. No content action is proposed here.",
      },
    });
  }

  const absence = SEO_VALIDATION_THRESHOLDS.ownedSerpAbsence;
  const absentShare = evidence.ownedAbsentSerps.length / evidence.serpsAnalysed;
  if (
    evidence.ownedAbsentSerps.length >= absence.minAbsentSerps &&
    absentShare >= absence.minShareAbsent
  ) {
    findings.push({
      rule: "owned_absent_from_approved_serps",
      targetKind: "property",
      target: evidence.ownDomain,
      title: `Owned property is absent from the top 20 on ${evidence.ownedAbsentSerps.length} approved queries`,
      description: `${evidence.ownDomain} does not appear in the observed top 20 organic results for ${evidence.ownedAbsentSerps.length} of ${evidence.serpsAnalysed} operator-approved keywords (${Math.round(absentShare * 100)}%). This is observed SERP absence, not a Search Console decline: those queries may never have produced impressions.`,
      current: null,
      previous: null,
      change: {
        absentQueries: evidence.ownedAbsentSerps.slice(0, 40),
        absentShare: Number(absentShare.toFixed(3)),
      },
      snapshotId: null,
      priorSnapshotId: null,
      businessImpact: absentShare >= 0.6 ? "high" : "medium",
      confidence: confidenceInCount(evidence.ownedAbsentSerps.length, absence.minAbsentSerps),
      suggestedAction: {
        kind: "review_coverage_gap",
        note: "Decide which absent queries deserve a page before anything is produced.",
      },
    });
  }

  return findings;
}

export type SeoValidationResult = {
  property: string | null;
  assetId: string | null;
  reportingDate: string | null;
  comparisonDate: string | null;
  rulesEvaluated: number;
  rulesTriggered: SeoRule[];
  findings: number;
  recommendationsCreated: number;
  recommendationsUpdated: number;
  noChange: boolean;
  reason?: string;
};

/**
 * Real SEO validation over finalized Search Console snapshots. Produces nothing
 * unless a typed rule genuinely triggers; zero findings is a clean success.
 */
export async function runSeoValidation(
  client: Client,
  workflowRunId: string | null,
): Promise<SeoValidationResult> {
  const { getSelectedProperty } = await import("./search-console.server");
  const property = await getSelectedProperty(client);
  const base: SeoValidationResult = {
    property,
    assetId: null,
    reportingDate: null,
    comparisonDate: null,
    rulesEvaluated: SEO_RULES.length,
    rulesTriggered: [],
    findings: 0,
    recommendationsCreated: 0,
    recommendationsUpdated: 0,
    noChange: true,
  };

  if (!property) {
    return { ...base, reason: "No Search Console property is selected." };
  }

  const { data: propertyRow, error: propertyError } = await client
    .from("search_console_properties")
    .select("asset_id")
    .eq("site_url", property)
    .maybeSingle();
  if (propertyError) throw new SearchConsoleFailure("persistence", propertyError.message);
  const assetId = propertyRow?.asset_id ?? null;

  const { data: dateRows, error: dateError } = await client
    .from("search_console_snapshots")
    .select("period_end_pt")
    .eq("property", property)
    .order("period_end_pt", { ascending: false })
    .limit(200);
  if (dateError) throw new SearchConsoleFailure("persistence", dateError.message);

  const dates = [...new Set((dateRows ?? []).map((row) => row.period_end_pt))];
  const reportingDate = dates[0] ?? null;
  const comparisonDate = dates[1] ?? null;

  if (!reportingDate) {
    return { ...base, assetId, reason: "No stored Search Console snapshot to evaluate." };
  }

  const select = "id, dimensions, kind, period_end_pt, period_start_pt, payload, totals";
  const { data: currentRows, error: currentError } = await client
    .from("search_console_snapshots")
    .select(select)
    .eq("property", property)
    .eq("period_end_pt", reportingDate);
  if (currentError) throw new SearchConsoleFailure("persistence", currentError.message);

  let priorSnapshots: SnapshotRow[] = [];
  if (comparisonDate) {
    const { data: priorRows, error: priorError } = await client
      .from("search_console_snapshots")
      .select(select)
      .eq("property", property)
      .eq("period_end_pt", comparisonDate);
    if (priorError) throw new SearchConsoleFailure("persistence", priorError.message);
    priorSnapshots = (priorRows ?? []) as SnapshotRow[];
  }

  const { data: knowledgeRows, error: knowledgeError } = await client
    .from("knowledge_entries")
    .select("source_ref")
    .not("source_ref", "is", null)
    .limit(500);
  if (knowledgeError) throw new SearchConsoleFailure("persistence", knowledgeError.message);
  const researchUrls = (knowledgeRows ?? [])
    .map((row) => row.source_ref ?? "")
    .filter((value) => value.startsWith("http"));

  const currentSnapshots = (currentRows ?? []) as SnapshotRow[];
  const competitorEvidence = await loadCompetitorEvidence(client, property);
  const findings = [
    ...evaluateSeoRules(currentSnapshots, priorSnapshots, researchUrls),
    ...evaluateCompetitorRules(competitorEvidence),
  ];
  const anchorSnapshot = currentSnapshots[0]?.id ?? null;

  if (findings.length === 0 || !anchorSnapshot) {
    await logActivity(client, {
      verb: "seo.validation.no_change",
      subjectKind: "capability",
      summary: `SEO validation evaluated ${SEO_RULES.length} rules for ${property} on ${reportingDate} (Pacific) and found nothing to raise.`,
      payload: { property, reportingDate, comparisonDate, workflowRunId, rules: SEO_RULES },
    });
    return { ...base, assetId, reportingDate, comparisonDate };
  }

  let created = 0;
  let updated = 0;
  const triggered = new Set<SeoRule>();

  for (const finding of findings) {
    triggered.add(finding.rule);
    const issueFingerprint = checksum([property, "seo_validation", finding.rule, finding.target]);
    const observationFingerprint = checksum([
      issueFingerprint,
      reportingDate,
      comparisonDate ?? "none",
    ]);

    const evidence = {
      property,
      targetKind: finding.targetKind,
      target: finding.target,
      currentPeriod: { periodStartPt: reportingDate, periodEndPt: reportingDate },
      comparisonPeriod: comparisonDate
        ? { periodStartPt: comparisonDate, periodEndPt: comparisonDate }
        : null,
      currentMetrics: finding.current,
      previousMetrics: finding.previous,
      change: finding.change,
      snapshotId: finding.snapshotId ?? anchorSnapshot,
      comparisonSnapshotId: finding.priorSnapshotId,
      workflowRunId,
      assetId,
      confidence: finding.confidence.value,
      // Stored beside the number so the operator can see what it rests on
      // rather than being asked to trust a bare decimal.
      confidenceReason: finding.confidence.reason,
      suggestedAction: finding.suggestedAction,
      rule: finding.rule,
      thresholds: SEO_VALIDATION_THRESHOLDS,
    };

    const { data: openRecommendation, error: openError } = await client
      .from("recommendations")
      .select("id")
      .eq("issue_fingerprint", issueFingerprint)
      .not("state", "in", "(applied,verified,rejected,rolled_back)")
      .maybeSingle();
    if (openError) throw new SearchConsoleFailure("persistence", openError.message);

    let recommendationId = openRecommendation?.id ?? null;

    if (recommendationId) {
      const { error: updateError } = await client
        .from("recommendations")
        .update(
          observationRecommendationRecord({
            description: finding.description,
            confidence: finding.confidence.value,
            run_id: workflowRunId,
            metadata: evidence as never,
          }),
        )
        .eq("id", recommendationId);
      if (updateError) throw new SearchConsoleFailure("persistence", updateError.message);
      updated += 1;
    } else {
      const { data: inserted, error: insertError } = await client
        .from("recommendations")
        .insert(
          observationRecommendationRecord({
            tenant_id: await requireTenantId(client),
            title: finding.title,
            description: finding.description,
            source_module: "seo-validation",
            business_impact: finding.businessImpact,
            revenue_impact: finding.businessImpact,
            traffic_impact: finding.businessImpact,
            time_saved_minutes: 0,
            risk: "none",
            confidence: finding.confidence.value,
            reasoning: `Rule ${finding.rule} over finalized Search Console snapshots for ${reportingDate} (Pacific), compared against ${comparisonDate ?? "no prior period"}. ${finding.confidence.reason}`,
            suggested_action: finding.suggestedAction as never,
            issue_fingerprint: issueFingerprint,
            run_id: workflowRunId,
            metadata: evidence as never,
          }),
        )
        .select("id")
        .single();
      if (insertError) throw new SearchConsoleFailure("persistence", insertError.message);
      recommendationId = inserted.id;
      created += 1;

      if (assetId) {
        const { error: targetError } = await client.from("recommendation_targets").insert({
          recommendation_id: recommendationId,
          subject_kind: "asset",
          subject_id: assetId,
        });
        if (targetError) throw new SearchConsoleFailure("persistence", targetError.message);
      }
    }

    const { error: observationError } = await client.from("search_console_observations").upsert(
      {
        tenant_id: await requireTenantId(client),
        snapshot_id: finding.snapshotId ?? anchorSnapshot,
        recommendation_id: recommendationId,
        rule: finding.rule,
        property,
        target: finding.target,
        issue_fingerprint: issueFingerprint,
        observation_fingerprint: observationFingerprint,
        period_start_pt: comparisonDate ?? reportingDate,
        period_end_pt: reportingDate,
        evidence: evidence as never,
      },
      { onConflict: "tenant_id,observation_fingerprint", ignoreDuplicates: true },
    );
    if (observationError) throw new SearchConsoleFailure("persistence", observationError.message);
  }

  await logActivity(client, {
    verb: "seo.validation.completed",
    subjectKind: "capability",
    summary: `SEO validation raised ${findings.length} evidence-backed findings for ${property} on ${reportingDate} (Pacific).`,
    payload: { property, reportingDate, comparisonDate, workflowRunId, triggered: [...triggered] },
  });

  return {
    property,
    assetId,
    reportingDate,
    comparisonDate,
    rulesEvaluated: SEO_RULES.length,
    rulesTriggered: [...triggered],
    findings: findings.length,
    recommendationsCreated: created,
    recommendationsUpdated: updated,
    noChange: false,
  };
}
