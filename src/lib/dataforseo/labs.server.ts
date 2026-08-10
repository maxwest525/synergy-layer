import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { dataforseoPost, fingerprint, persistSnapshot } from "./transport.server";

type Client = SupabaseClient<Database>;

const CAPABILITY = "cap.dataforseo_labs";
const FAMILY = "labs" as const;

/** Typed defaults. Labs is a database snapshot, so weekly cadence is the design. */
export const LABS_CONFIG = {
  locationCode: 2840, // United States
  languageCode: "en",
  competitorLimit: 25,
  rankedKeywordLimit: 200,
  includeClickstream: false, // doubles cost
  estimatedUsdPerTask: 0.05,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type LabsResult = { snapshotId: string; created: boolean; rows: number; costUsd: number };

export async function labsCall(
  client: Client,
  tenantId: string,
  endpoint: string,
  kind: string,
  target: string,
  params: Record<string, unknown>,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<LabsResult> {
  const reportingDate = today();
  const requestFingerprint = fingerprint(endpoint, params, reportingDate);

  const { data: existing } = await client
    .from("dataforseo_snapshots")
    .select("id, returned_row_count")
    .eq("tenant_id", tenantId)
    .eq("request_fingerprint", requestFingerprint)
    .maybeSingle();
  if (existing) {
    return { snapshotId: existing.id, created: false, rows: existing.returned_row_count, costUsd: 0 };
  }

  const { envelope, requestId, costUsd } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    tasks: [params],
    mode: "live",
    requestFingerprint,
    estimatedUsd: LABS_CONFIG.estimatedUsdPerTask,
    workflowRunId: workflow?.runId ?? null,
    workflowKey: workflow?.key ?? null,
  });

  const task = envelope.tasks?.[0] ?? null;
  const result = (task?.result ?? []) as { items?: unknown[] }[];
  const rows = (result[0]?.items ?? []) as unknown[];

  const snapshot = await persistSnapshot(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    kind,
    target,
    mode: "live",
    requestFingerprint,
    requestParams: params,
    reportingDate,
    task,
    rows,
    totals: {
      itemsCount: (result[0] as { total_count?: number } | undefined)?.total_count ?? rows.length,
      estimated: true,
    },
    possiblyTruncated: rows.length >= Number(params["limit"] ?? 0),
    costUsd,
    requestId,
  });

  return { snapshotId: snapshot.id, created: snapshot.created, rows: snapshot.rows, costUsd };
}

/**
 * Discovers the organic competitor universe from the target's own search
 * landscape. Results are candidates for operator review, never tracked
 * competitors: nothing here starts recurring monitoring by itself.
 */
export async function discoverCompetitors(
  client: Client,
  tenantId: string,
  seedDomain: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<{ snapshotId: string; discovered: number; inserted: number; costUsd: number }> {
  const params = {
    target: seedDomain,
    location_code: LABS_CONFIG.locationCode,
    language_code: LABS_CONFIG.languageCode,
    limit: LABS_CONFIG.competitorLimit,
    exclude_top_domains: false,
  };

  const result = await labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/competitors_domain/live",
    "labs_competitors_domain",
    seedDomain,
    params,
    workflow,
  );

  const { data: snapshot } = await client
    .from("dataforseo_snapshots")
    .select("payload")
    .eq("id", result.snapshotId)
    .single();

  const items = ((snapshot?.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? []).filter(
    (item) => typeof item["domain"] === "string" && item["domain"] !== seedDomain,
  );

  let inserted = 0;
  for (const item of items) {
    const domain = String(item["domain"]);
    const { error } = await client.from("competitor_candidates").upsert(
      {
        tenant_id: tenantId,
        seed_domain: seedDomain,
        domain,
        source: "labs.competitors_domain",
        snapshot_id: result.snapshotId,
        metrics: {
          avg_position: item["avg_position"] ?? null,
          sum_position: item["sum_position"] ?? null,
          intersections: item["intersections"] ?? null,
          full_domain_metrics: item["full_domain_metrics"] ?? null,
          competitor_metrics: item["competitor_metrics"] ?? null,
          estimated: true,
        } as never,
      },
      { onConflict: "tenant_id,seed_domain,domain,source", ignoreDuplicates: true },
    );
    if (!error) inserted += 1;
  }

  return { snapshotId: result.snapshotId, discovered: items.length, inserted, costUsd: result.costUsd };
}

/** Ranked keyword landscape for a domain. Labs values are estimates, labelled as such. */
export async function collectRankedKeywords(
  client: Client,
  tenantId: string,
  target: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<LabsResult> {
  return labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/ranked_keywords/live",
    "labs_ranked_keywords",
    target,
    {
      target,
      location_code: LABS_CONFIG.locationCode,
      language_code: LABS_CONFIG.languageCode,
      limit: LABS_CONFIG.rankedKeywordLimit,
      order_by: ["ranked_serp_element.serp_item.etv,desc"],
      include_clickstream_data: LABS_CONFIG.includeClickstream,
    },
    workflow,
  );
}
