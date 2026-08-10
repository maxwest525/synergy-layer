import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { dataforseoPost, fingerprint, persistSnapshot } from "./transport.server";

type Client = SupabaseClient<Database>;

const CAPABILITY = "cap.dataforseo_backlinks";
const FAMILY = "backlinks" as const;

export const BACKLINKS_CONFIG = {
  referringDomainLimit: 200,
  backlinkLimit: 200,
  rankScale: "one_thousand" as const,
  /** Native dedup, removes the need for local one-per-domain logic. */
  backlinkMode: "one_per_domain" as const,
  estimatedUsdPerRequest: 0.05,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type BacklinksResult = { snapshotId: string; created: boolean; rows: number; costUsd: number };

async function backlinksCall(
  client: Client,
  tenantId: string,
  endpoint: string,
  kind: string,
  target: string,
  params: Record<string, unknown>,
  extract: (result: Record<string, unknown>[]) => { rows: unknown[]; totals: Record<string, unknown> },
  workflow?: { runId?: string | null; key?: string | null },
): Promise<BacklinksResult> {
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
    estimatedUsd: BACKLINKS_CONFIG.estimatedUsdPerRequest,
    workflowRunId: workflow?.runId ?? null,
    workflowKey: workflow?.key ?? null,
  });

  const task = envelope.tasks?.[0] ?? null;
  const { rows, totals } = extract((task?.result ?? []) as Record<string, unknown>[]);

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
    totals,
    possiblyTruncated: rows.length >= Number(params["limit"] ?? 0),
    costUsd,
    requestId,
  });

  return { snapshotId: snapshot.id, created: snapshot.created, rows: snapshot.rows, costUsd };
}

/** Whole-profile baseline: rank, referring domains, spam score, dofollow split. */
export async function collectBacklinkSummary(
  client: Client,
  tenantId: string,
  target: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<BacklinksResult> {
  return backlinksCall(
    client,
    tenantId,
    "/backlinks/summary/live",
    "backlinks_summary",
    target,
    { target, internal_list_limit: 10, backlinks_status_type: "live", rank_scale: BACKLINKS_CONFIG.rankScale },
    (result) => ({ rows: result, totals: (result[0] ?? {}) as Record<string, unknown> }),
    workflow,
  );
}

/** Referring-domain baseline, the anchor for later link-gap analysis. */
export async function collectReferringDomains(
  client: Client,
  tenantId: string,
  target: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<BacklinksResult> {
  return backlinksCall(
    client,
    tenantId,
    "/backlinks/referring_domains/live",
    "backlinks_referring_domains",
    target,
    {
      target,
      limit: BACKLINKS_CONFIG.referringDomainLimit,
      order_by: ["rank,desc"],
      backlinks_status_type: "live",
      rank_scale: BACKLINKS_CONFIG.rankScale,
    },
    (result) => ({
      rows: ((result[0]?.["items"] as unknown[]) ?? []),
      totals: { totalCount: result[0]?.["total_count"] ?? null },
    }),
    workflow,
  );
}

/** One backlink per referring domain, server-side deduplicated. */
export async function collectBacklinks(
  client: Client,
  tenantId: string,
  target: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<BacklinksResult> {
  return backlinksCall(
    client,
    tenantId,
    "/backlinks/backlinks/live",
    "backlinks_backlinks",
    target,
    {
      target,
      limit: BACKLINKS_CONFIG.backlinkLimit,
      mode: BACKLINKS_CONFIG.backlinkMode,
      backlinks_status_type: "live",
      order_by: ["rank,desc"],
      rank_scale: BACKLINKS_CONFIG.rankScale,
    },
    (result) => ({
      rows: ((result[0]?.["items"] as unknown[]) ?? []),
      totals: { totalCount: result[0]?.["total_count"] ?? null },
    }),
    workflow,
  );
}
