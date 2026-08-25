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
  /** Vendor caps, documented for this endpoint: 8 filter conditions, 3 order_by rules. */
  maxFilterConditions: 8,
  maxOrderByRules: 3,
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
  /**
   * The provider's `content_info.sentiment_connotations` object as sent — the
   * documented keys are anger, happiness, love, sadness, share and fun. Kept
   * whole rather than collapsed into one score: the vendor publishes no combined
   * figure, so any single number would be invented here. Null when the row
   * carried no numeric connotation at all.
   */
  connotations: Record<string, number> | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Narrowing and ordering the provider applies before it bills the rows.
 * `filters` is the vendor's nested form — condition arrays joined by "and" / "or"
 * strings — and `orderBy` its `"field,asc|desc"` strings; both are passed through
 * as given rather than re-encoded here.
 */
export type MentionSearchOptions = {
  filters?: unknown[];
  orderBy?: string[];
};

/** Conditions are the nested arrays; the "and" / "or" joiners between them are not. */
function countFilterConditions(filters: readonly unknown[]): number {
  return filters.filter((clause) => Array.isArray(clause)).length;
}

/**
 * The exact task body posted for a mention search. `filters` and `order_by` are
 * applied server-side at no extra charge, so narrowing here is strictly cheaper
 * than fetching a full page and discarding rows in application code.
 *
 * Over-cap input throws rather than truncating: a silently dropped condition
 * returns a wider result set that still looks like the one that was asked for.
 */
export function buildMentionSearchTask(
  keyword: string,
  limit: number = CONTENT_ANALYSIS_CONFIG.mentionLimit,
  options: MentionSearchOptions = {},
): Record<string, unknown> {
  const task: Record<string, unknown> = {
    keyword: keyword.trim().toLowerCase(),
    limit: Math.min(Math.max(1, Math.trunc(limit)), CONTENT_ANALYSIS_CONFIG.mentionLimit),
  };

  if (options.filters?.length) {
    const conditions = countFilterConditions(options.filters);
    if (conditions > CONTENT_ANALYSIS_CONFIG.maxFilterConditions) {
      throw new Error(
        `Content Analysis search accepts at most ${CONTENT_ANALYSIS_CONFIG.maxFilterConditions} filter conditions; received ${conditions}.`,
      );
    }
    task["filters"] = options.filters;
  }

  if (options.orderBy?.length) {
    if (options.orderBy.length > CONTENT_ANALYSIS_CONFIG.maxOrderByRules) {
      throw new Error(
        `Content Analysis search accepts at most ${CONTENT_ANALYSIS_CONFIG.maxOrderByRules} order_by rules; received ${options.orderBy.length}.`,
      );
    }
    task["order_by"] = options.orderBy;
  }

  return task;
}

/**
 * Stated assumption: 90 days. Used only on the first run for a tenant, or when the
 * prior-snapshot lookup fails — never as an ongoing window. The number is a
 * judgement call, not a vendor figure and not derived from anything observed: no
 * DataForSEO request has been made from this repo, so there is no mention volume to
 * size it against. What would settle it: the row count and cost of the first few
 * real runs. A first run that comes back `possibly_truncated` means 90 days is too
 * wide for that tenant.
 */
export const MENTION_DEFAULT_LOOKBACK_DAYS = 90;

const MENTION_SNAPSHOT_KIND = "content_analysis_mentions";

function lookbackCutoff(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Grammar grounded in https://docs.dataforseo.com/v3/content_analysis/filters/, which
 * types `content_info.date_published` as `time`, requires the value in the form
 * `"yyyy-mm-dd hh-mm-ss +00:00"` (example `2021-01-29 15:02:37 +00:00`), and lists
 * only `<` and `>` as operators for a time field — `>=` is not accepted. `>` against
 * the cutoff's midnight keeps the date floor the caller asks for.
 */
function publishedSinceFilter(cutoff: string): unknown[] {
  return [["content_info.date_published", ">", `${cutoff} 00:00:00 +00:00`]];
}

/**
 * A date floor for a mention read: everything published before the last run was
 * already collected, and re-fetching it pays twice for the same rows. Falls back to
 * the default window when there is no prior run and — deliberately — on a failed
 * lookup too, because the alternative is an unbounded read that costs most precisely
 * when something is already wrong.
 *
 * OPT-IN, AND DELIBERATELY NOT WIRED. `workflow-runner.server.ts` calls
 * `searchBrandMentions` without it. Nothing here is broken; the reason is that
 * turning it on by default would put an unverified blind spot on a spend-affecting
 * path, and this module has just finished removing a different guess (a
 * `sentiment_connotations.positive` key the provider never sent).
 *
 * The filter grammar itself is no longer an assumption — see `publishedSinceFilter`
 * for the vendor citation. What remains unverified is what the filter would hide:
 *   1. A page published before the cutoff but indexed by the provider after it would
 *      never be collected, on that run or any later one.
 *   2. Rows the provider sends with no `date_published` at all — `selectMentions`
 *      allows that field to be null, so such rows exist — would plausibly be dropped
 *      by a `date_published >` comparison on every run, not just once. That is a
 *      permanent blind spot the operator is never shown and never told about, which
 *      is a worse failure than the spend it saves.
 *
 * What promotes it to default-on, both answered by a single real run:
 *   (a) the provider accepts the documented time literal in practice rather than
 *       returning a task error, and
 *   (b) the response shows whether rows arrive with `date_published` absent, and if
 *       so whether this filter drops them.
 *
 * One more thing to inherit when turning it on: the cutoff becomes part of the
 * request fingerprint, so the first re-run after a successful run always misses the
 * snapshot dedupe cache and makes a real, billable (if narrow) call where it
 * previously cost nothing.
 *
 * Don't quietly widen the window to paper over any of this, and don't invent filter
 * grammar to handle the null case. Raise it instead.
 */
export async function mentionRecencyOptions(
  client: Client,
  tenantId: string,
): Promise<MentionSearchOptions> {
  const fallback = lookbackCutoff(MENTION_DEFAULT_LOOKBACK_DAYS);

  try {
    const { data, error } = await client
      .from("dataforseo_snapshots")
      .select("collected_at")
      .eq("tenant_id", tenantId)
      .eq("kind", MENTION_SNAPSHOT_KIND)
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // A snapshot row is written only after the provider call succeeded, so any row
    // found here is a successful prior run — there is no status column to check.
    const collectedAt = !error && typeof data?.collected_at === "string" ? data.collected_at : null;
    return {
      filters: publishedSinceFilter(collectedAt ? collectedAt.slice(0, 10) : fallback),
    };
  } catch {
    return { filters: publishedSinceFilter(fallback) };
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
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

/**
 * Every numeric connotation the row carried, under the provider's own key names.
 * Not filtered against the six documented keys: a seventh would be real data the
 * account already paid for, and a whitelist would be a second guess at a surface
 * this module is in the middle of unguessing.
 */
function connotationsOf(info: Record<string, unknown> | null): Record<string, number> | null {
  const raw = asRecord(info?.["sentiment_connotations"]);
  if (!raw) return null;
  const scores = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => typeof value === "number"),
  ) as Record<string, number>;
  return Object.keys(scores).length > 0 ? scores : null;
}

/** Flattens the provider's mention rows; a missing field stays null, never 0 or "". */
export function selectMentions(items: readonly Record<string, unknown>[]): BrandMention[] {
  return items.filter(isWellFormed).map((item) => {
    // The vendor puts every text field of a mention inside content_info; only the
    // locator fields (url, domain) live on the item itself. Reading title/snippet/
    // date_published off the item would null them on every real row.
    const info = asRecord(item["content_info"]);
    return {
      url: item["url"] as string,
      domain: text(item["domain"]),
      title: text(info?.["title"]),
      snippet: text(info?.["snippet"]),
      datePublished: text(info?.["date_published"]),
      connotations: connotationsOf(info),
    };
  });
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
  options: MentionSearchOptions = {},
): Promise<MentionSearchResult> {
  const params = buildMentionSearchTask(keyword, CONTENT_ANALYSIS_CONFIG.mentionLimit, options);
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
    kind: MENTION_SNAPSHOT_KIND,
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
