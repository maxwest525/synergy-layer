import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { hashPostbackToken, newPostbackToken, postbackUrl } from "./postback-token";
import { dataforseoGet, dataforseoPost, fingerprint, persistSnapshot } from "./transport.server";

type Client = SupabaseClient<Database>;

const CAPABILITY = "cap.dataforseo_serp";
const FAMILY = "serp" as const;

export const SERP_CONFIG = {
  locationCode: 2840,
  languageCode: "en",
  depth: 20,
  priority: 1, // normal queue
  estimatedUsdStandard: 0.002,
  estimatedUsdLive: 0.006,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Scheduled observation path: queue the SERP task and let the provider call
 * back. Live mode is never used here, per the documentation digest.
 */
export async function queueSerpTasks(
  client: Client,
  tenantId: string,
  keywords: string[],
  origin: string,
  workflow?: { runId?: string | null; key?: string | null },
): Promise<{ queued: number; skipped: number; costUsd: number }> {
  const reportingDate = today();
  const endpoint = "/serp/google/organic/task_post";

  const pending: {
    keyword: string;
    tag: string;
    params: Record<string, unknown>;
    fp: string;
    token: string;
  }[] = [];
  let skipped = 0;

  for (const keyword of keywords) {
    const params = {
      keyword,
      location_code: SERP_CONFIG.locationCode,
      language_code: SERP_CONFIG.languageCode,
      depth: SERP_CONFIG.depth,
      priority: SERP_CONFIG.priority,
    };
    const fp = fingerprint("/serp/google/organic/task_get", params, reportingDate);

    const { data: existing } = await client
      .from("dataforseo_snapshots")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("request_fingerprint", fp)
      .maybeSingle();
    const { data: queued } = await client
      .from("dataforseo_serp_tasks")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("request_fingerprint", fp)
      .in("state", ["queued", "received"])
      .maybeSingle();
    if (existing || queued) {
      skipped += 1;
      continue;
    }

    // One random token per task: the provider echoes it in the callback URL,
    // and the table stores only its hash (postback-token.ts).
    pending.push({ keyword, tag: fp, params, fp, token: newPostbackToken() });
  }

  if (pending.length === 0) return { queued: 0, skipped, costUsd: 0 };

  const batchFingerprint = fingerprint(
    endpoint,
    pending.map((entry) => entry.fp),
    reportingDate,
  );

  const { envelope, costUsd } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    mode: "standard",
    requestFingerprint: batchFingerprint,
    estimatedUsd: SERP_CONFIG.estimatedUsdStandard * pending.length,
    workflowRunId: workflow?.runId ?? null,
    workflowKey: workflow?.key ?? null,
    tasks: pending.map((entry) => ({
      ...entry.params,
      tag: entry.tag,
      postback_url: postbackUrl(origin, entry.token),
      postback_data: "regular",
    })),
  });

  let queuedCount = 0;
  for (const [index, task] of (envelope.tasks ?? []).entries()) {
    const entry = pending[index];
    if (!entry) continue;
    const { error } = await client.from("dataforseo_serp_tasks").insert({
      tenant_id: tenantId,
      provider_task_id: task.id,
      tag: entry.tag,
      endpoint: "/serp/google/organic/task_get/regular",
      priority: "normal",
      keyword: entry.keyword,
      location_code: SERP_CONFIG.locationCode,
      language_code: SERP_CONFIG.languageCode,
      request_fingerprint: entry.fp,
      request_params: entry.params as never,
      state: "queued",
      postback_token_hash: hashPostbackToken(entry.token),
    });
    if (!error) queuedCount += 1;
  }

  return { queued: queuedCount, skipped, costUsd };
}

/** Stores the provider callback body as immutable evidence. */
export async function ingestSerpPostback(
  client: Client,
  tenantId: string,
  body: {
    tasks?: {
      id: string;
      status_code: number;
      status_message: string;
      cost?: number;
      result?: unknown[] | null;
      data?: Record<string, unknown>;
      path?: string[];
    }[];
  },
): Promise<{ stored: number }> {
  let stored = 0;

  for (const task of body.tasks ?? []) {
    const { data: queued } = await client
      .from("dataforseo_serp_tasks")
      .select("id, keyword, request_fingerprint, request_params")
      .eq("tenant_id", tenantId)
      .eq("provider_task_id", task.id)
      .maybeSingle();
    if (!queued) continue;

    const result = (task.result ?? []) as { items?: unknown[]; se_results_count?: number }[];
    const rows = (result[0]?.items ?? []) as unknown[];

    const snapshot = await persistSnapshot(client, {
      tenantId,
      capabilityKey: CAPABILITY,
      family: FAMILY,
      endpoint: "/serp/google/organic/task_get/regular",
      kind: "serp_organic",
      target: queued.keyword,
      mode: "standard",
      requestFingerprint: queued.request_fingerprint,
      requestParams: (queued.request_params ?? {}) as Record<string, unknown>,
      reportingDate: today(),
      task: {
        id: task.id,
        status_code: task.status_code,
        status_message: task.status_message,
        cost: task.cost ?? 0,
        path: task.path,
        data: task.data,
        result: task.result ?? null,
      },
      rows,
      totals: { seResultsCount: result[0]?.se_results_count ?? null },
      costUsd: Number(task.cost ?? 0),
    });

    await client
      .from("dataforseo_serp_tasks")
      .update({
        state: "received",
        received_at: new Date().toISOString(),
        snapshot_id: snapshot.id,
      })
      .eq("id", queued.id);

    stored += 1;
  }

  return { stored };
}

/**
 * Provider-supported fallback when a postback is delayed or missed. Reuses the
 * task IDs already paid for at task_post time: tasks_ready lists what the
 * provider has finished, task_get retrieves it at no incremental charge. Never
 * posts a new task, and skips anything already persisted.
 */
export async function collectReadySerpTasks(
  client: Client,
  tenantId: string,
): Promise<{ ready: number; collected: number; stillQueued: number; costUsd: number }> {
  const { data: queuedTasks } = await client
    .from("dataforseo_serp_tasks")
    .select("id, provider_task_id, keyword, request_fingerprint, request_params")
    .eq("tenant_id", tenantId)
    .eq("state", "queued");

  const outstanding = new Map((queuedTasks ?? []).map((task) => [task.provider_task_id, task]));
  if (outstanding.size === 0) return { ready: 0, collected: 0, stillQueued: 0, costUsd: 0 };

  const readyEnvelope = await dataforseoGet("/serp/google/organic/tasks_ready");
  const readyIds = new Set<string>();
  for (const task of readyEnvelope.tasks ?? []) {
    for (const row of (task.result ?? []) as { id?: string }[]) {
      if (row?.id) readyIds.add(row.id);
    }
  }

  const collectable = [...outstanding.keys()].filter((id) => readyIds.has(id));
  let collected = 0;
  let costUsd = 0;

  for (const providerTaskId of collectable) {
    const envelope = await dataforseoGet(`/serp/google/organic/task_get/regular/${providerTaskId}`);
    costUsd += Number(envelope.cost ?? 0);
    const stored = await ingestSerpPostback(client, tenantId, {
      tasks: (envelope.tasks ?? []) as never,
    });
    collected += stored.stored;
  }

  return {
    ready: collectable.length,
    collected,
    stillQueued: outstanding.size - collected,
    costUsd,
  };
}

/** Operator-initiated real-time inspection only. Never used by a schedule. */
export async function liveSerp(
  client: Client,
  tenantId: string,
  keyword: string,
): Promise<{ snapshotId: string; rows: number; costUsd: number }> {
  const endpoint = "/serp/google/organic/live/regular";
  const params = {
    keyword,
    location_code: SERP_CONFIG.locationCode,
    language_code: SERP_CONFIG.languageCode,
    depth: SERP_CONFIG.depth,
  };
  const reportingDate = today();
  const fp = fingerprint(
    `${endpoint}#live`,
    { ...params, at: new Date().toISOString() },
    reportingDate,
  );

  const { envelope, requestId, costUsd } = await dataforseoPost(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    tasks: [params],
    mode: "live",
    requestFingerprint: fp,
    estimatedUsd: SERP_CONFIG.estimatedUsdLive,
  });

  const task = envelope.tasks?.[0] ?? null;
  const result = (task?.result ?? []) as { items?: unknown[] }[];
  const rows = (result[0]?.items ?? []) as unknown[];

  const snapshot = await persistSnapshot(client, {
    tenantId,
    capabilityKey: CAPABILITY,
    family: FAMILY,
    endpoint,
    kind: "serp_organic_live",
    target: keyword,
    mode: "live",
    requestFingerprint: fp,
    requestParams: params,
    reportingDate,
    task,
    rows,
    costUsd,
    requestId,
  });

  return { snapshotId: snapshot.id, rows: snapshot.rows, costUsd };
}
