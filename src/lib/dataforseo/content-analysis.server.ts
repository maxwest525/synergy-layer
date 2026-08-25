import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { dataforseoPost, fingerprint, persistSnapshot } from "./transport.server";

type Client = SupabaseClient<Database>;

const CAPABILITY = "cap.dataforseo_content_analysis";
const FAMILY = "content_analysis" as const;
const SEARCH_ENDPOINT = "/content_analysis/search/live";

export const CONTENT_ANALYSIS_CONFIG = {
  /** Provider ceiling on a page of rows is 1000; a mention read never needs it. */
  mentionLimit: 100,
  /**
   * The digest (v1.1.0) publishes no Content Analysis price — section 6 covers
   * Backlinks, Labs, SERP and OnPage only. Until a real invoice line exists the
   * estimate borrows the Backlinks per-request figure so the budget guard has a
   * non-zero number to stop on rather than waving the call through.
   */
  estimatedUsdPerRequest: 0.05,
};

export type BrandMention = {
  url: string;
  domain: string | null;
  title: string | null;
  snippet: string | null;
  datePublished: string | null;
  /** Connotation score as the provider reported it; null when the row carried none. */
  sentiment: number | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The exact task body posted for a mention search. Kept minimal on purpose: the
 * digest scopes `filters` / `order_by` semantics to Backlinks and Labs, so no
 * clause is assumed to be free — or even accepted — on this family.
 */
export function buildMentionSearchTask(
  keyword: string,
  limit: number = CONTENT_ANALYSIS_CONFIG.mentionLimit,
): Record<string, unknown> {
  return {
    keyword: keyword.trim().toLowerCase(),
    limit: Math.min(Math.max(1, Math.trunc(limit)), CONTENT_ANALYSIS_CONFIG.mentionLimit),
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isWellFormed(item: Record<string, unknown>): boolean {
  return text(item["url"]) !== null;
}

/**
 * A row with no URL cannot be shown to the operator as a citation, so it is not
 * silently dropped to zero — it is counted here and reported as an absence.
 */
export function countUnparsedMentionItems(items: readonly Record<string, unknown>[]): number {
  return items.filter((item) => !isWellFormed(item)).length;
}

function sentimentOf(item: Record<string, unknown>): number | null {
  const info = item["content_info"];
  if (!info || typeof info !== "object") return null;
  const connotations = (info as Record<string, unknown>)["sentiment_connotations"];
  if (!connotations || typeof connotations !== "object") return null;
  const score = (connotations as Record<string, unknown>)["positive"];
  return typeof score === "number" ? score : null;
}

/** Flattens the provider's mention rows; a missing field stays null, never 0 or "". */
export function selectMentions(items: readonly Record<string, unknown>[]): BrandMention[] {
  return items.filter(isWellFormed).map((item) => ({
    url: item["url"] as string,
    domain: text(item["domain"]),
    title: text(item["title"]),
    snippet: text(item["snippet"]),
    datePublished: text(item["date_published"]),
    sentiment: sentimentOf(item),
  }));
}

export type MentionSearchResult = {
  snapshotId: string;
  created: boolean;
  mentions: BrandMention[];
  /** Provider's own count of matching documents, null when it reported none. */
  totalCount: number | null;
  unparsed: number;
  costUsd: number;
};

/**
 * Read-only: where the brand is cited across the web, and how those citations
 * read. Stores the evidence snapshot and returns the parsed rows; it files
 * nothing and changes nothing downstream.
 */
export async function searchBrandMentions(
  client: Client,
  tenantId: string,
  keyword: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<MentionSearchResult> {
  const params = buildMentionSearchTask(keyword);
  const reportingDate = today();
  const requestFingerprint = fingerprint(SEARCH_ENDPOINT, params, reportingDate);

  const { data: existing } = await client
    .from("dataforseo_snapshots")
    .select("id, payload, totals, returned_row_count")
    .eq("tenant_id", tenantId)
    .eq("request_fingerprint", requestFingerprint)
    .maybeSingle();
  if (existing) {
    const stored = ((existing.payload as { rows?: unknown[] } | null)?.rows ?? []) as Record<
      string,
      unknown
    >[];
    return {
      snapshotId: existing.id,
      created: false,
      mentions: selectMentions(stored),
      totalCount: readTotalCount(existing.totals),
      unparsed: countUnparsedMentionItems(stored),
      costUsd: 0,
    };
  }

  const { envelope, requestId, costUsd } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint: SEARCH_ENDPOINT,
    tasks: [params],
    mode: "live",
    requestFingerprint,
    estimatedUsd: CONTENT_ANALYSIS_CONFIG.estimatedUsdPerRequest,
    workflowRunId: workflow?.runId ?? null,
    workflowKey: workflow?.key ?? null,
  });

  const task = envelope.tasks?.[0] ?? null;
  const first = ((task?.result ?? [])[0] ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(first["items"]) ? first["items"] : []) as Record<string, unknown>[];
  const totalCount = readTotalCount(first);

  const snapshot = await persistSnapshot(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint: SEARCH_ENDPOINT,
    kind: "content_analysis_mentions",
    target: params["keyword"] as string,
    mode: "live",
    requestFingerprint,
    requestParams: params,
    reportingDate,
    task,
    rows: items,
    totals: { total_count: totalCount },
    possiblyTruncated: items.length >= Number(params["limit"] ?? 0),
    costUsd,
    requestId,
  });

  return {
    snapshotId: snapshot.id,
    created: snapshot.created,
    mentions: selectMentions(items),
    totalCount,
    unparsed: countUnparsedMentionItems(items),
    costUsd,
  };
}

function readTotalCount(totals: unknown): number | null {
  if (!totals || typeof totals !== "object") return null;
  const value = (totals as Record<string, unknown>)["total_count"];
  return typeof value === "number" ? value : null;
}
