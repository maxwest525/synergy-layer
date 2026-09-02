import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import { checkPageSpeedReadings, type PageSpeedReading } from "./pagespeed-rule-checks";
import { checksum } from "./search-console.server";

type AdminClient = SupabaseClient<Database>;

export type PageSpeedRuleRunResult = {
  readingsRead: number;
  observations: number;
  recommendations: number;
  noReadings: boolean;
};

/**
 * The fifth module that writes a recommendation.
 *
 * PageSpeed has stored real Core Web Vitals readings since the measurement
 * slice landed, and until now nothing read them: `findingSources` for
 * `pagespeed_insights` in connections.ts was empty, so the connector was
 * permanently stuck at "collecting and reaching nobody" no matter how many
 * runs it stored. This closes that, and connections.registry.test.ts asserts
 * the claim against this file so it cannot drift back.
 *
 * Runs under the admin client with the tenant as a parameter, mirroring
 * evaluateGa4Snapshots and observeUmami.
 */
export async function evaluatePageSpeedReadings(
  client: AdminClient,
  tenantId: string,
): Promise<PageSpeedRuleRunResult> {
  const { data, error } = await client
    .from("pagespeed_snapshots")
    .select("url, final_url, strategy, lcp_ms, cls, collected_at")
    .eq("tenant_id", tenantId)
    .order("collected_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) {
    return { readingsRead: 0, observations: 0, recommendations: 0, noReadings: true };
  }

  const readings: PageSpeedReading[] = rows.map((row) => ({
    url: row.final_url ?? row.url,
    strategy: row.strategy,
    lcpMs: row.lcp_ms,
    cls: row.cls,
    collectedAt: row.collected_at,
  }));

  const observations = checkPageSpeedReadings(readings);
  let created = 0;

  for (const observation of observations) {
    const issueFingerprint = checksum(["pagespeed", observation.rule, observation.target]);

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
        source_module: "pagespeed",
        business_impact: observation.businessImpact,
        time_saved_minutes: 0,
        risk: "none",
        confidence: observation.confidence,
        reasoning: `Rule ${observation.rule} over the stored PageSpeed lab reading for ${observation.target}. Thresholds are Google's published Core Web Vitals bands, not local values.`,
        suggested_action: {
          kind: "review",
          rule: observation.rule,
          target: observation.target,
        } as never,
        issue_fingerprint: issueFingerprint,
        metadata: { rule: observation.rule, measurementKind: "lab" } as never,
      }),
    );
    if (insertError) throw new Error(insertError.message);
    created += 1;
  }

  await logActivity(client, {
    tenantId,
    actorKind: "system",
    actorId: "pagespeed-rules",
    verb: "pagespeed.rules.evaluated",
    subjectKind: "tenant",
    subjectId: tenantId,
    summary: `Read ${readings.length} stored PageSpeed readings and filed ${created} new finding(s).`,
    payload: { readingsRead: readings.length, observations: observations.length, created },
  });

  return {
    readingsRead: readings.length,
    observations: observations.length,
    recommendations: created,
    noReadings: false,
  };
}
