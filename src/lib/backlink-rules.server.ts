import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { BACKLINKS_CONFIG } from "./dataforseo/backlinks.server";
import { logActivity } from "./os.server";
import { observationRecommendationRecord } from "./observation-record";
import {
  checkInboundLinksToErrorPages,
  checkLinkedPagesNeverAudited,
  checkLinkProfileCoveragePartial,
  type AuditedPageRow,
  type BacklinkObservationDraft,
  type ReferringDomainsSnapshotFacts,
} from "./backlink-rule-checks";
import { checksum, getSelectedProperty } from "./search-console.server";

type AdminClient = SupabaseClient<Database>;

type Row = Record<string, unknown>;

/**
 * The sixth module that writes a recommendation.
 *
 * Six DataForSEO Backlinks endpoints are collected on every baseline; until
 * now only `dataforseo/targeting-rules.server.ts` read any of it
 * (`referring_domain_movement`, off `backlinks_referring_domains`). This
 * reads three more stored snapshots and files what they show. Runs under the
 * admin client with the tenant as a parameter, mirroring
 * `evaluatePageSpeedReadings` and `evaluateGa4Snapshots`.
 *
 * Deliberately does not read `backlinks_history`: `collectBacklinkHistory`
 * does not store per-month rows in a shape any rule can trust yet, which is
 * why the adversarial review killed `net_link_loss_last_month` and
 * `referring_domain_year_movement` rather than shipping them.
 */

type SnapshotRow = {
  id: string;
  reporting_date: string;
  payload: unknown;
  totals: unknown;
  returned_row_count: number;
  target: string;
};

function rowsOf(payload: unknown): Row[] {
  const rows = (payload as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function totalsOf(totals: unknown): Row {
  return totals !== null && typeof totals === "object" && !Array.isArray(totals)
    ? (totals as Row)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function latestSnapshot(
  client: AdminClient,
  tenantId: string,
  kind: string,
): Promise<SnapshotRow | null> {
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("id, reporting_date, payload, totals, returned_row_count, target")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .order("reporting_date", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? [])[0] ?? null;
}

/** Newest first: [current, prior], matching the pairing `readReferringDomainSnapshots` builds. */
async function latestTwoSnapshots(
  client: AdminClient,
  tenantId: string,
  kind: string,
): Promise<SnapshotRow[]> {
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("id, reporting_date, payload, totals, returned_row_count, target")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .order("reporting_date", { ascending: false })
    .limit(2);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function evaluateInboundLinksToErrorPages(
  client: AdminClient,
  tenantId: string,
): Promise<BacklinkObservationDraft[]> {
  const domainPages = await latestSnapshot(client, tenantId, "backlinks_domain_pages");
  if (domainPages === null) return [];

  const summary = await latestSnapshot(client, tenantId, "backlinks_summary");
  const siteWideBrokenPages =
    summary === null ? null : num(totalsOf(summary.totals)["broken_pages"]);

  const backlinks = await latestSnapshot(client, tenantId, "backlinks_backlinks");

  return checkInboundLinksToErrorPages(rowsOf(domainPages.payload), {
    domainPagesCollectedDate: domainPages.reporting_date,
    siteWideBrokenPages,
    siteWideCollectedDate: summary?.reporting_date ?? null,
    backlinkRows: backlinks === null ? [] : rowsOf(backlinks.payload),
  });
}

async function evaluateLinkedPagesNeverAudited(
  client: AdminClient,
  tenantId: string,
): Promise<BacklinkObservationDraft[]> {
  const domainPages = await latestSnapshot(client, tenantId, "backlinks_domain_pages");
  if (domainPages === null) return [];

  const property = await getSelectedProperty(client);
  if (property === null) return [];

  const { data, error } = await client
    .from("page_metadata_observations")
    .select("url, final_url, error, observed_at")
    .eq("tenant_id", tenantId)
    .eq("property", property)
    .order("observed_at", { ascending: false })
    .limit(1200);
  if (error) throw new Error(error.message);

  // Newest row per url only: an older error row must not shadow a page the
  // audit has since read successfully, or the reverse.
  const seen = new Set<string>();
  const auditedPages: AuditedPageRow[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    auditedPages.push({ url: row.url, finalUrl: row.final_url, error: row.error });
  }

  return checkLinkedPagesNeverAudited(rowsOf(domainPages.payload), auditedPages, {
    domainPagesCollectedDate: domainPages.reporting_date,
  });
}

async function evaluateLinkProfileCoveragePartial(
  client: AdminClient,
  tenantId: string,
): Promise<BacklinkObservationDraft[]> {
  const referring = await latestTwoSnapshots(client, tenantId, "backlinks_referring_domains");
  if (referring.length === 0) return [];

  const summary = await latestSnapshot(client, tenantId, "backlinks_summary");
  const summaryReferringDomains =
    summary === null ? null : num(totalsOf(summary.totals)["referring_domains"]);

  const snapshots: (ReferringDomainsSnapshotFacts | null)[] = referring.map((row) => ({
    reportingDate: row.reporting_date,
    returnedRowCount: row.returned_row_count,
    totalCount: num(totalsOf(row.totals)["totalCount"]),
  }));

  return checkLinkProfileCoveragePartial({
    // The target Backlinks calls were made for is the same for every stored
    // row; the newest snapshot's is as good a source as any.
    target: referring[0]!.target,
    referringDomainLimit: BACKLINKS_CONFIG.referringDomainLimit,
    snapshots,
    summaryReferringDomains,
  });
}

export type BacklinkFindingsRunResult = {
  observations: number;
  recommendations: number;
};

/**
 * Re-reads the stored Backlinks snapshots and files what they show. Calls no
 * provider and costs nothing, so it is safe to run as often as an operator
 * likes.
 */
export async function evaluateBacklinkFindings(
  client: AdminClient,
  tenantId: string,
): Promise<BacklinkFindingsRunResult> {
  const observations = [
    ...(await evaluateInboundLinksToErrorPages(client, tenantId)),
    ...(await evaluateLinkedPagesNeverAudited(client, tenantId)),
    ...(await evaluateLinkProfileCoveragePartial(client, tenantId)),
  ];

  let created = 0;

  for (const observation of observations) {
    const issueFingerprint = checksum(["backlink-findings", observation.rule, observation.target]);

    const { data: openRecommendation, error: openError } = await client
      .from("recommendations")
      .select("id")
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
        source_module: "backlink-findings",
        business_impact: observation.businessImpact,
        time_saved_minutes: 0,
        risk: "none",
        confidence: observation.confidence,
        reasoning: `Rule ${observation.rule} over stored DataForSEO Backlinks snapshots for ${observation.target}. Read from stored rows: no provider was called.`,
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
    actorId: "backlink-rules",
    verb: "backlink.rules.evaluated",
    subjectKind: "tenant",
    subjectId: tenantId,
    summary: `Read stored DataForSEO Backlinks snapshots and filed ${created} new finding(s).`,
    payload: { observations: observations.length, created },
  });

  return { observations: observations.length, recommendations: created };
}
