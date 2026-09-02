import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  GA4_RULE_THRESHOLDS,
  detectDisappearedEvents,
  detectPageTrafficShift,
  detectZeroEngagementPages,
  type Ga4ObservationDraft,
  type Ga4Row,
} from "./ga4-rule-checks";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import { checksum, shiftDate } from "./search-console.server";

type AdminClient = SupabaseClient<Database>;

export type Ga4RuleRunResult = {
  reportingDate: string | null;
  observations: number;
  recommendations: number;
  noChange: boolean;
  /** Rule keys that were evaluated on this run. */
  rulesEvaluated: string[];
  /**
   * Sentences naming what kept a rule from running, so "0 observations" can
   * be read as "nothing qualified" or "these rules had no prior period"
   * (CODE-47). Empty when every registered rule ran.
   */
  unmet: string[];
};

const CURRENT_ONLY_RULES = ["zero_engagement_page"] as const;
const COMPARISON_RULES = ["page_traffic_loss", "page_traffic_gain", "event_disappeared"] as const;

type SnapshotRow = {
  id: string;
  start_date: string;
  end_date: string;
  metrics: unknown;
};

function rowsOf(snapshot: SnapshotRow | null): Ga4Row[] {
  const metrics = (snapshot?.metrics ?? {}) as { rows?: Ga4Row[] };
  return metrics.rows ?? [];
}

/**
 * Evidence-backed rules over stored GA4 snapshots. Zero drafts is a valid,
 * healthy "no change" outcome, not a failure. Snapshots are rolling 28-day
 * windows collected daily, so the prior snapshot is the one at least
 * comparisonWindowDays older by end_date, never literally the previous row.
 *
 * Runs under the admin client on the scheduler path, so the tenant arrives as
 * a parameter (mirroring observeUmami) instead of requireTenantId.
 */
export async function evaluateGa4Snapshots(
  client: AdminClient,
  tenantId: string,
  property: string,
): Promise<Ga4RuleRunResult> {
  const { data: currentSnapshot, error: currentError } = await client
    .from("ga4_snapshots")
    .select("id, start_date, end_date, metrics")
    .eq("tenant_id", tenantId)
    .eq("property", property)
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!currentSnapshot) {
    return {
      reportingDate: null,
      observations: 0,
      recommendations: 0,
      noChange: true,
      rulesEvaluated: [],
      unmet: [`No GA4 snapshot is stored for ${property}, so no rule ran.`],
    };
  }
  const reportingDate = currentSnapshot.end_date;

  const { data: priorSnapshot, error: priorError } = await client
    .from("ga4_snapshots")
    .select("id, start_date, end_date, metrics")
    .eq("tenant_id", tenantId)
    .eq("property", property)
    .lte("end_date", shiftDate(reportingDate, -GA4_RULE_THRESHOLDS.comparisonWindowDays))
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorError) throw new Error(priorError.message);

  const currentRows = rowsOf(currentSnapshot);
  const observations: Ga4ObservationDraft[] = [...detectZeroEngagementPages(currentRows)];
  const rulesEvaluated: string[] = [...CURRENT_ONLY_RULES];
  const unmet: string[] = [];
  if (priorSnapshot) {
    const priorRows = rowsOf(priorSnapshot);
    observations.push(...detectPageTrafficShift(currentRows, priorRows));
    observations.push(...detectDisappearedEvents(currentRows, priorRows));
    rulesEvaluated.push(...COMPARISON_RULES);
  } else {
    unmet.push(
      `No snapshot at least ${GA4_RULE_THRESHOLDS.comparisonWindowDays} days older than ${reportingDate} is stored for ${property}, so ${COMPARISON_RULES.join(", ")} did not run.`,
    );
  }

  if (observations.length === 0) {
    await logActivity(client, {
      tenantId,
      verb: "recommendation.no_change",
      subjectKind: "capability",
      summary: `GA4 rules found nothing to raise for ${property} on ${reportingDate}.`,
      payload: { property, reportingDate },
    });
    return {
      reportingDate,
      observations: 0,
      recommendations: 0,
      noChange: true,
      rulesEvaluated,
      unmet,
    };
  }

  let created = 0;

  for (const observation of observations) {
    const issueFingerprint = checksum([property, observation.rule, observation.target]);
    const observationFingerprint = checksum([issueFingerprint, reportingDate, currentSnapshot.id]);

    // The admin client bypasses RLS, so the tenant scope the search-console
    // original inherited from its RLS client must be explicit here.
    const { data: openRecommendation, error: openError } = await client
      .from("recommendations")
      .select("id, state")
      .eq("tenant_id", tenantId)
      .eq("issue_fingerprint", issueFingerprint)
      .not("state", "in", "(applied,verified,rejected,rolled_back)")
      .maybeSingle();
    if (openError) throw new Error(openError.message);

    let recommendationId = openRecommendation?.id ?? null;

    if (!recommendationId) {
      const { data: inserted, error: insertError } = await client
        .from("recommendations")
        .insert(
          observationRecommendationRecord({
            tenant_id: tenantId,
            title: observation.title,
            description: observation.description,
            source_module: "ga4",
            business_impact: observation.businessImpact,
            time_saved_minutes: 0,
            risk: "none",
            confidence: observation.confidence,
            reasoning: `Rule ${observation.rule} over stored GA4 snapshots ending ${reportingDate}.`,
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
      if (insertError) throw new Error(insertError.message);
      recommendationId = inserted.id;
      created += 1;
    }

    const { error: observationError } = await client.from("ga4_observations").upsert(
      {
        tenant_id: tenantId,
        snapshot_id: currentSnapshot.id,
        recommendation_id: recommendationId,
        rule: observation.rule,
        property,
        target: observation.target,
        issue_fingerprint: issueFingerprint,
        observation_fingerprint: observationFingerprint,
        period_start: currentSnapshot.start_date,
        period_end: currentSnapshot.end_date,
        evidence: observation.evidence as never,
      },
      { onConflict: "observation_fingerprint", ignoreDuplicates: true },
    );
    if (observationError) throw new Error(observationError.message);
  }

  return {
    reportingDate,
    observations: observations.length,
    recommendations: created,
    noChange: false,
    rulesEvaluated,
    unmet,
  };
}

/**
 * Scheduled GA4 rule evaluation. Mirrors runGa4DailyObservation's tenant loop:
 * one evaluation per tenant with a selected Search Console property bound to a
 * GA4 property, reading stored snapshots only. No provider API call.
 */
export async function runGa4DailyRules(admin: AdminClient): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  results: Array<{
    tenantId: string;
    property: string;
    status: "succeeded" | "failed";
    observations?: number;
    reportingDate?: string | null;
    rulesEvaluated?: string[];
    unmet?: string[];
    error?: string;
  }>;
}> {
  const { ga4PropertyForSearchConsoleProperty } = await import("./measurement/ga4");
  const { data: selected, error } = await admin
    .from("search_console_properties")
    .select("tenant_id, site_url")
    .eq("selected", true);
  if (error) throw new Error(`Could not read selected Search Console properties: ${error.message}`);

  const results: Array<{
    tenantId: string;
    property: string;
    status: "succeeded" | "failed";
    observations?: number;
    reportingDate?: string | null;
    rulesEvaluated?: string[];
    unmet?: string[];
    error?: string;
  }> = [];

  for (const row of selected ?? []) {
    const property = ga4PropertyForSearchConsoleProperty(row.site_url);
    if (!property || !row.tenant_id) continue;
    try {
      const result = await evaluateGa4Snapshots(admin, row.tenant_id, property);
      results.push({
        tenantId: row.tenant_id,
        property,
        status: "succeeded",
        observations: result.observations,
        reportingDate: result.reportingDate,
        rulesEvaluated: result.rulesEvaluated,
        unmet: result.unmet,
      });
    } catch (ruleError) {
      results.push({
        tenantId: row.tenant_id,
        property,
        status: "failed",
        error: ruleError instanceof Error ? ruleError.message : String(ruleError),
      });
    }
  }

  return {
    attempted: results.length,
    succeeded: results.filter((entry) => entry.status === "succeeded").length,
    failed: results.filter((entry) => entry.status === "failed").length,
    results,
  };
}
