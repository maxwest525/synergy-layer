import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  DataForSeoFailure,
  dataforseoPost,
  fingerprint,
  persistSnapshot,
} from "./transport.server";

type Client = SupabaseClient<Database>;

const CAPABILITY = "cap.dataforseo_domain_analytics";
const FAMILY = "domain_analytics" as const;

export const DOMAIN_ANALYTICS_CONFIG = {
  whoisLimit: 100,
  /** Documented provider ceiling; a caller asking for more is clamped, never passed through. */
  whoisMaxLimit: 1000,
  /**
   * The digest publishes no price row for Domain Analytics, so the pre-call
   * guard uses the largest cost in the vendor's own documented examples
   * (whois/overview, $0.102) rounded up. Real spend is read off the response.
   */
  estimatedUsdPerRequest: 0.15,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type DomainAnalyticsResult = {
  snapshotId: string;
  created: boolean;
  rows: number;
  costUsd: number;
};

async function domainAnalyticsCall(
  client: Client,
  tenantId: string,
  endpoint: string,
  kind: string,
  target: string,
  params: Record<string, unknown>,
  extract: (result: Record<string, unknown>[]) => {
    rows: unknown[];
    totals: Record<string, unknown>;
  },
  workflow?: { runId?: string | null; key?: string | null },
): Promise<DomainAnalyticsResult> {
  const reportingDate = today();
  const requestFingerprint = fingerprint(endpoint, params, reportingDate);

  const { data: existing } = await client
    .from("dataforseo_snapshots")
    .select("id, returned_row_count")
    .eq("tenant_id", tenantId)
    .eq("request_fingerprint", requestFingerprint)
    .maybeSingle();
  if (existing) {
    return {
      snapshotId: existing.id,
      created: false,
      rows: existing.returned_row_count,
      costUsd: 0,
    };
  }

  const { envelope, requestId, costUsd } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    tasks: [params],
    // Both Domain Analytics endpoints are Live-only; there is no Standard queue
    // to move a scheduled read onto.
    mode: "live",
    requestFingerprint,
    estimatedUsd: DOMAIN_ANALYTICS_CONFIG.estimatedUsdPerRequest,
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
    possiblyTruncated: rows.length >= Number(params["limit"] ?? Infinity),
    costUsd,
    requestId,
  });

  return { snapshotId: snapshot.id, created: snapshot.created, rows: snapshot.rows, costUsd };
}

/** Tech stack, host country and domain rank for one domain. One row, one charge. */
export async function collectDomainTechnologies(
  client: Client,
  tenantId: string,
  target: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<DomainAnalyticsResult> {
  return domainAnalyticsCall(
    client,
    tenantId,
    "/domain_analytics/technologies/domain_technologies/live",
    "domain_technologies",
    target,
    { target },
    (result) => ({
      rows: result,
      totals: {
        domainRank: result[0]?.["domain_rank"] ?? null,
        lastVisited: result[0]?.["last_visited"] ?? null,
      },
    }),
    workflow,
  );
}

export type WhoisQuery = {
  /** Names the cohort in evidence; the query itself is defined by its filters. */
  label: string;
  /** Digest section 7 filter syntax. Filtering is free, so it is the whole point of this read. */
  filters: unknown[];
  limit?: number;
};

/**
 * Whois overview across the provider's registered-domain index, narrowed by
 * backlink and rank filters. Unfiltered it would scan the whole index, so an
 * empty filter set is refused before a request is made rather than paid for.
 */
export async function collectWhoisOverview(
  client: Client,
  tenantId: string,
  query: WhoisQuery,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<DomainAnalyticsResult> {
  if (query.filters.length === 0) {
    throw new DataForSeoFailure(
      "invalid_request",
      "Whois overview needs at least one filter; an unfiltered read scans the whole domain index.",
    );
  }

  const limit = Math.min(
    query.limit ?? DOMAIN_ANALYTICS_CONFIG.whoisLimit,
    DOMAIN_ANALYTICS_CONFIG.whoisMaxLimit,
  );

  return domainAnalyticsCall(
    client,
    tenantId,
    "/domain_analytics/whois/overview/live",
    "whois_overview",
    query.label,
    { limit, filters: query.filters },
    (result) => ({
      rows: (result[0]?.["items"] as unknown[]) ?? [],
      totals: {
        totalCount: result[0]?.["total_count"] ?? null,
        offsetToken: result[0]?.["offset_token"] ?? null,
      },
    }),
    workflow,
  );
}
