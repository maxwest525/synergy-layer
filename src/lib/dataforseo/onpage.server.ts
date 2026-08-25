import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { dataforseoGet, dataforseoPost, fingerprint, persistSnapshot } from "./transport.server";

type Client = SupabaseClient<Database>;

const CAPABILITY = "cap.dataforseo_onpage";

const FAMILY = "onpage" as const;

/**
 * A crawl is billed per page, so an audit reads a sample rather than a whole
 * site: the documentation digest names crawling everything as the mistake this
 * cap exists to prevent. Raise it only for a site whose page count is known and
 * whose crawl cost has been approved.
 */
export const MAX_CRAWL_PAGES = 100;

/** Rows read back per result endpoint. Provider default is 100, maximum 1000. */
export const RESULT_ROW_LIMIT = 100;

export const ONPAGE_CONFIG = {
  maxCrawlPages: MAX_CRAWL_PAGES,
  resultRowLimit: RESULT_ROW_LIMIT,
  /** Basic-crawl rate from the digest cost model. Every multiplier stays off. */
  usdPerCrawledPage: 0.00015,
};

const TASK_POST = "/on_page/task_post";
const TASKS_READY = "/on_page/tasks_ready";
const SUMMARY = "/on_page/summary";
const FORCE_STOP = "/on_page/force_stop";

/** Kinds written by this family, and the kind that marks a crawl collected. */
const TASK_KIND = "onpage_task";
const SUMMARY_KIND = "onpage_summary";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The provider rejects a target carrying a scheme, a `www.` or a path. */
export function normalizeTarget(raw: string): string {
  const host = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0];
  return (host ?? "").toLowerCase();
}

/**
 * Basic crawl only. `load_resources` (x3), `enable_javascript` (x10),
 * `enable_browser_rendering`, `calculate_keyword_density` (x2) and Lighthouse
 * (x34) all default to false at the provider and are deliberately left unsent,
 * so switching one on has to be a visible addition rather than a flipped flag.
 */
export function buildCrawlTask(target: string, tag: string): Record<string, unknown> {
  return {
    target: normalizeTarget(target),
    max_crawl_pages: MAX_CRAWL_PAGES,
    tag,
  };
}

export type CrawlSummary = {
  crawlProgress: string | null;
  crawlStatus: Record<string, unknown> | null;
  domainInfo: Record<string, unknown> | null;
  pageMetrics: Record<string, unknown> | null;
};

/** Returns null when the provider sent nothing readable, never an empty shell. */
export function parseCrawlSummary(result: unknown[]): CrawlSummary | null {
  const row = asRecord(result[0]);
  if (!row) return null;
  const progress = row["crawl_progress"];
  return {
    crawlProgress: typeof progress === "string" ? progress : null,
    crawlStatus: asRecord(row["crawl_status"]),
    domainInfo: asRecord(row["domain_info"]),
    pageMetrics: asRecord(row["page_metrics"]),
  };
}

export type ParsedItems = {
  rows: unknown[];
  totalCount: number | null;
  crawlProgress: string | null;
};

/**
 * Totals stay null when the provider omitted them. A missing count is an
 * unknown, and reporting it as zero would read as "nothing wrong with the site".
 */
export function parseResultItems(result: unknown[]): ParsedItems {
  const row = asRecord(result[0]);
  if (!row) return { rows: [], totalCount: null, crawlProgress: null };
  const items = row["items"];
  const total = row["total_items_count"];
  const progress = row["crawl_progress"];
  return {
    rows: Array.isArray(items) ? items : [],
    totalCount: typeof total === "number" ? total : null,
    crawlProgress: typeof progress === "string" ? progress : null,
  };
}

export type CrawlHandle = {
  snapshotId: string;
  providerTaskId: string | null;
  created: boolean;
  costUsd: number;
};

/**
 * Posts the crawl and records the task id as evidence. The task_post charge is
 * the whole cost of the crawl; every result endpoint below is free for 30 days.
 * Re-posting the same target on the same day is skipped by fingerprint, the same
 * idempotency rule the rest of the DataForSEO surface uses.
 */
export async function startCrawl(
  client: Client,
  tenantId: string,
  target: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<CrawlHandle> {
  const reportingDate = today();
  const normalized = normalizeTarget(target);
  const requestFingerprint = fingerprint(TASK_POST, { target: normalized }, reportingDate);
  const task = buildCrawlTask(target, requestFingerprint);

  const { data: existing } = await client
    .from("dataforseo_snapshots")
    .select("id, provider_task_id")
    .eq("tenant_id", tenantId)
    .eq("request_fingerprint", requestFingerprint)
    .maybeSingle();
  if (existing) {
    return {
      snapshotId: existing.id,
      providerTaskId: existing.provider_task_id,
      created: false,
      costUsd: 0,
    };
  }

  const { envelope, requestId, costUsd } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint: TASK_POST,
    tasks: [task],
    mode: "standard",
    requestFingerprint,
    estimatedUsd: MAX_CRAWL_PAGES * ONPAGE_CONFIG.usdPerCrawledPage,
    workflowRunId: workflow?.runId ?? null,
    workflowKey: workflow?.key ?? null,
  });

  const posted = envelope.tasks?.[0] ?? null;
  const snapshot = await persistSnapshot(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint: TASK_POST,
    kind: TASK_KIND,
    target: normalized,
    mode: "standard",
    requestFingerprint,
    requestParams: task,
    reportingDate,
    task: posted,
    rows: [],
    totals: { maxCrawlPages: MAX_CRAWL_PAGES },
    costUsd,
    requestId,
  });

  return {
    snapshotId: snapshot.id,
    providerTaskId: posted?.id ?? null,
    created: snapshot.created,
    costUsd,
  };
}

type OutstandingCrawl = { providerTaskId: string; target: string };

/**
 * A crawl is outstanding while a task snapshot exists and no summary snapshot
 * has been written for the same provider task id. Snapshots are immutable, so
 * that pairing is the state machine; there is no flag to flip.
 */
async function outstandingCrawls(client: Client, tenantId: string): Promise<OutstandingCrawl[]> {
  const { data: posted } = await client
    .from("dataforseo_snapshots")
    .select("provider_task_id, target")
    .eq("tenant_id", tenantId)
    .eq("kind", TASK_KIND);

  const byTaskId = new Map<string, string>();
  for (const row of posted ?? []) {
    if (row.provider_task_id) byTaskId.set(row.provider_task_id, row.target);
  }
  if (byTaskId.size === 0) return [];

  const { data: collected } = await client
    .from("dataforseo_snapshots")
    .select("provider_task_id")
    .eq("tenant_id", tenantId)
    .eq("kind", SUMMARY_KIND)
    .in("provider_task_id", [...byTaskId.keys()]);

  for (const row of collected ?? []) {
    if (row.provider_task_id) byTaskId.delete(row.provider_task_id);
  }

  return [...byTaskId.entries()].map(([providerTaskId, target]) => ({ providerTaskId, target }));
}

/**
 * The read-only, cheap subset of the OnPage surface. Lighthouse, waterfall and
 * keyword density are the priced multipliers and are deliberately absent.
 * duplicate_content is absent for a different reason: it compares one named URL
 * against the crawl, so it cannot run as part of a site-wide sweep --
 * collectDuplicateContent takes that URL explicitly.
 */
export function crawlReads(
  id: string,
): { endpoint: string; kind: string; params: Record<string, unknown> }[] {
  return [
    {
      endpoint: "/on_page/pages",
      kind: "onpage_pages",
      params: { id, limit: RESULT_ROW_LIMIT },
    },
    {
      // `type` is required and covers one tag per call, so a title sweep and a
      // description sweep are two reads of the same free endpoint.
      endpoint: "/on_page/duplicate_tags",
      kind: "onpage_duplicate_title",
      params: { id, type: "duplicate_title", limit: RESULT_ROW_LIMIT },
    },
    {
      endpoint: "/on_page/duplicate_tags",
      kind: "onpage_duplicate_description",
      params: { id, type: "duplicate_description", limit: RESULT_ROW_LIMIT },
    },
    {
      endpoint: "/on_page/redirect_chains",
      kind: "onpage_redirect_chains",
      params: { id, limit: RESULT_ROW_LIMIT },
    },
    {
      endpoint: "/on_page/non_indexable",
      kind: "onpage_non_indexable",
      params: { id, limit: RESULT_ROW_LIMIT },
    },
  ];
}

/** Result reads are POSTs and carry no incremental charge once the crawl is paid for. */
async function readCrawlResult(
  client: Client,
  tenantId: string,
  endpoint: string,
  kind: string,
  target: string,
  params: Record<string, unknown>,
  reportingDate: string,
): Promise<{ rows: number; costUsd: number }> {
  const requestFingerprint = fingerprint(endpoint, params, reportingDate);
  const { envelope, requestId, costUsd } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    tasks: [params],
    mode: "standard",
    requestFingerprint,
    estimatedUsd: 0,
  });

  const task = envelope.tasks?.[0] ?? null;
  const parsed = parseResultItems((task?.result ?? []) as unknown[]);

  const snapshot = await persistSnapshot(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    kind,
    target,
    mode: "standard",
    requestFingerprint,
    requestParams: params,
    reportingDate,
    task,
    rows: parsed.rows,
    totals: { totalCount: parsed.totalCount, crawlProgress: parsed.crawlProgress },
    possiblyTruncated: parsed.rows.length >= RESULT_ROW_LIMIT,
    costUsd,
    requestId,
  });

  return { rows: snapshot.rows, costUsd };
}

export type CollectResult = {
  outstanding: number;
  ready: number;
  collected: number;
  stillCrawling: number;
  costUsd: number;
};

/**
 * Poll-and-fetch, the same shape as collectReadySerpTasks. OnPage offers a
 * pingback rather than a postback -- it only notifies, so the result still has
 * to be fetched -- which makes polling the whole mechanism here, not a fallback.
 * The summary snapshot is written last because it is what marks a crawl
 * collected: a detail read that fails leaves the crawl outstanding for the next
 * sweep instead of stranding a half-read audit.
 */
export async function collectReadyCrawls(client: Client, tenantId: string): Promise<CollectResult> {
  const outstanding = await outstandingCrawls(client, tenantId);
  if (outstanding.length === 0) {
    return { outstanding: 0, ready: 0, collected: 0, stillCrawling: 0, costUsd: 0 };
  }

  const readyEnvelope = await dataforseoGet(TASKS_READY);
  const readyIds = new Set<string>();
  for (const task of readyEnvelope.tasks ?? []) {
    for (const row of (task.result ?? []) as { id?: string }[]) {
      if (row?.id) readyIds.add(row.id);
    }
  }

  const ready = outstanding.filter((crawl) => readyIds.has(crawl.providerTaskId));
  const reportingDate = today();
  let collected = 0;
  let partial = 0;
  let costUsd = 0;

  for (const crawl of ready) {
    const summaryEnvelope = await dataforseoGet(`${SUMMARY}/${crawl.providerTaskId}`);
    const summaryCost = Number(summaryEnvelope.cost ?? 0);
    costUsd += summaryCost;
    const summaryTask = summaryEnvelope.tasks?.[0] ?? null;
    const summary = parseCrawlSummary((summaryTask?.result ?? []) as unknown[]);

    // tasks_ready lists a crawl as soon as it has anything to show. Collecting
    // before it finishes would freeze a partial site as the audit of record.
    if (!summary || summary.crawlProgress !== "finished") {
      partial += 1;
      continue;
    }

    for (const read of crawlReads(crawl.providerTaskId)) {
      const result = await readCrawlResult(
        client,
        tenantId,
        read.endpoint,
        read.kind,
        crawl.target,
        read.params,
        reportingDate,
      );
      costUsd += result.costUsd;
    }

    await persistSnapshot(client, {
      tenantId,
      capabilityKey: CAPABILITY,
      family: FAMILY,
      endpoint: SUMMARY,
      kind: SUMMARY_KIND,
      target: crawl.target,
      mode: "standard",
      requestFingerprint: fingerprint(SUMMARY, { id: crawl.providerTaskId }, reportingDate),
      requestParams: { id: crawl.providerTaskId },
      reportingDate,
      task: summaryTask,
      rows: (summaryTask?.result ?? []) as unknown[],
      totals: {
        crawlProgress: summary.crawlProgress,
        crawlStatus: summary.crawlStatus,
        pageMetrics: summary.pageMetrics,
      },
      costUsd: summaryCost,
    });

    collected += 1;
  }

  return {
    outstanding: outstanding.length,
    ready: ready.length,
    collected,
    stillCrawling: outstanding.length - ready.length + partial,
    costUsd,
  };
}

/** Operator-initiated: duplicate_content needs the page it is comparing against. */
export async function collectDuplicateContent(
  client: Client,
  tenantId: string,
  providerTaskId: string,
  url: string,
): Promise<{ rows: number; costUsd: number }> {
  return readCrawlResult(
    client,
    tenantId,
    "/on_page/duplicate_content",
    "onpage_duplicate_content",
    url,
    { id: providerTaskId, url, limit: RESULT_ROW_LIMIT },
    today(),
  );
}

/**
 * The control for a runaway crawl. Free at the provider, and the pages already
 * scanned stay retrievable, so stopping costs only the pages never crawled.
 */
export async function forceStopCrawl(
  client: Client,
  tenantId: string,
  providerTaskIds: string[],
): Promise<{ stopped: number }> {
  if (providerTaskIds.length === 0) return { stopped: 0 };

  const { envelope } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint: FORCE_STOP,
    tasks: providerTaskIds.map((id) => ({ id })),
    mode: "standard",
    // A stop is an event, not an observation of a day: fingerprinting it by the
    // moment it was issued keeps a second stop from colliding with the first.
    requestFingerprint: fingerprint(FORCE_STOP, providerTaskIds, new Date().toISOString()),
    estimatedUsd: 0,
  });

  return { stopped: (envelope.tasks ?? []).filter((task) => task.status_code === 20000).length };
}
