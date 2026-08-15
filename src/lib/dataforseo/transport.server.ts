import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "../os.server";
import { BudgetExceeded, assertBudget, recordSpend } from "./budget.server";

type Client = SupabaseClient<Database>;

const BASE = "https://api.dataforseo.com/v3";
export const API_VERSION = "v3";

/** Documented ceiling is 30 simultaneous requests; AOOS stays well under it. */
const MAX_CONCURRENCY = 8;
const MAX_ATTEMPTS = 3;

/** Provider codes that are budget conditions, never retried. */
const BUDGET_CODES = new Set([40200, 40203]);
/** Provider codes worth one more attempt. */
const RETRYABLE_CODES = new Set([40501]);

export class DataForSeoFailure extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "DataForSeoFailure";
    this.reason = reason;
  }
}

export type DataForSeoTask = {
  id: string;
  status_code: number;
  status_message: string;
  cost: number;
  path?: string[] | undefined;
  data?: Record<string, unknown> | undefined;
  result?: unknown[] | null;
  result_count?: number;
};

export type DataForSeoEnvelope = {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: DataForSeoTask[];
};

let inFlight = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENCY) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight += 1;
}

function release(): void {
  inFlight -= 1;
  const next = waiting.shift();
  if (next) next();
}

function credentials(): string {
  const token = process.env["DATAFORSEO_BASIC_TOKEN"];
  if (token) return token.replace(/^Basic\s+/i, "").trim();
  const login = process.env["DATAFORSEO_LOGIN"];
  const password = process.env["DATAFORSEO_PASSWORD"];
  if (login && password) {
    return Buffer.from(`${login}:${password}`).toString("base64");
  }
  throw new DataForSeoFailure(
    "missing_credentials",
    "DataForSEO credentials are not available to the server.",
  );
}

/**
 * Retrieval-only GET against the provider (tasks_ready / task_get). These paths
 * carry no incremental charge: the task was already paid for at task_post time.
 * No ledger row is written for a zero-cost read, but any non-zero provider cost
 * is surfaced to the caller so it can be attributed.
 */
export async function dataforseoGet(path: string): Promise<DataForSeoEnvelope> {
  const auth = credentials();
  await acquire();
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (response.status === 401) {
      throw new DataForSeoFailure("authorization", "DataForSEO rejected the credentials.");
    }
    if (!response.ok) {
      throw new DataForSeoFailure(
        "api_error",
        `DataForSEO retrieval failed [${response.status}]: ${await response.text()}`,
      );
    }
    return (await response.json()) as DataForSeoEnvelope;
  } finally {
    release();
  }
}

/** Stable, order-insensitive fingerprint: endpoint + normalized params + reporting date. */
export function fingerprint(endpoint: string, params: unknown, reportingDate: string): string {
  const normalized = normalize(params);
  return createHash("sha256")
    .update(JSON.stringify({ endpoint, params: normalized, reportingDate }))
    .digest("hex")
    .slice(0, 40);
}

export function checksum(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(normalize(value)))
    .digest("hex")
    .slice(0, 32);
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

function readRateLimit(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
    const value = response.headers.get(header);
    if (value) out[header] = value;
  }
  return out;
}

export type PostOptions = {
  tenantId: string;
  capabilityKey: string;
  family: "labs" | "serp" | "backlinks";
  endpoint: string;
  tasks: Record<string, unknown>[];
  mode?: "live" | "standard";
  requestFingerprint: string;
  estimatedUsd: number;
  workflowRunId?: string | null;
  workflowKey?: string | null;
};

export type PostResult = { envelope: DataForSeoEnvelope; requestId: string; costUsd: number };

/**
 * The single transport every DataForSEO capability goes through: budget guard,
 * concurrency cap, bounded retry, cost attribution, and a ledger row for every
 * outcome including failures. It never deletes or rewrites prior evidence.
 */
export async function dataforseoPost(client: Client, options: PostOptions): Promise<PostResult> {
  const mode = options.mode ?? "live";
  await assertBudget(client, options.tenantId, options.estimatedUsd);

  const auth = credentials();
  const started = Date.now();
  let attempt = 0;
  let lastError: Error | null = null;

  await acquire();
  try {
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      let response: Response;
      try {
        response = await fetch(`${BASE}${options.endpoint}`, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify(options.tasks),
        });
      } catch (error) {
        lastError = new DataForSeoFailure(
          "transport",
          `DataForSEO request failed: ${String(error)}`,
        );
        if (attempt < MAX_ATTEMPTS) {
          await delay(attempt);
          continue;
        }
        break;
      }

      const rateLimit = readRateLimit(response);

      if (response.status === 401) {
        lastError = new DataForSeoFailure("authorization", "DataForSEO rejected the credentials.");
        break;
      }
      if (response.status === 402) {
        lastError = new DataForSeoFailure(
          "budget",
          "DataForSEO reports a payment or balance problem.",
        );
        break;
      }
      if (response.status >= 500) {
        lastError = new DataForSeoFailure("api_error", `DataForSEO returned ${response.status}.`);
        if (attempt < MAX_ATTEMPTS) {
          await delay(attempt);
          continue;
        }
        break;
      }
      if (!response.ok) {
        lastError = new DataForSeoFailure(
          "api_error",
          `DataForSEO request failed [${response.status}]: ${await response.text()}`,
        );
        break;
      }

      const envelope = (await response.json()) as DataForSeoEnvelope;
      const failing = (envelope.tasks ?? []).find(
        (task) => task.status_code !== 20000 && task.status_code !== 20100,
      );

      if (failing && BUDGET_CODES.has(failing.status_code)) {
        lastError = new DataForSeoFailure(
          "budget",
          `DataForSEO refused the task on budget grounds [${failing.status_code}]: ${failing.status_message}`,
        );
        break;
      }
      if (failing && RETRYABLE_CODES.has(failing.status_code) && attempt < MAX_ATTEMPTS) {
        lastError = new DataForSeoFailure("api_error", failing.status_message);
        await delay(attempt);
        continue;
      }

      const costUsd = Number(envelope.cost ?? 0);
      const rows = (envelope.tasks ?? []).reduce(
        (total, task) => total + (task.result_count ?? 0),
        0,
      );

      const requestId = await ledger(client, options, {
        mode,
        httpStatus: response.status,
        providerStatusCode: envelope.status_code,
        providerStatusMessage: envelope.status_message,
        taskCount: envelope.tasks_count ?? options.tasks.length,
        rows,
        costUsd,
        durationMs: Date.now() - started,
        rateLimit,
        outcome: failing ? "provider_error" : "succeeded",
        error: failing ? `${failing.status_code}: ${failing.status_message}` : null,
      });

      await recordSpend(client, options.tenantId, costUsd, {
        capabilityKey: options.capabilityKey,
        endpoint: options.endpoint,
      });

      if (failing) {
        throw new DataForSeoFailure(
          "api_error",
          `DataForSEO task failed [${failing.status_code}]: ${failing.status_message}`,
        );
      }

      return { envelope, requestId, costUsd };
    }

    const failure = lastError ?? new DataForSeoFailure("api_error", "DataForSEO request failed.");

    await ledger(client, options, {
      mode,
      httpStatus: null,
      providerStatusCode: null,
      providerStatusMessage: null,
      taskCount: options.tasks.length,
      rows: 0,
      costUsd: 0,
      durationMs: Date.now() - started,
      rateLimit: {},
      outcome: "failed",
      error: failure.message,
    });

    if (failure instanceof DataForSeoFailure && failure.reason === "budget") {
      await fileInboxItem(client, {
        lane: "needs_attention",
        sourceModule: "dataforseo",
        title: "DataForSEO stopped on a budget condition",
        summary: failure.message,
        priority: 1,
        tenantId: options.tenantId,
      });
    }

    throw failure;
  } finally {
    release();
  }
}

async function delay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
}

type LedgerInput = {
  mode: string;
  httpStatus: number | null;
  providerStatusCode: number | null;
  providerStatusMessage: string | null;
  taskCount: number;
  rows: number;
  costUsd: number;
  durationMs: number;
  rateLimit: Record<string, string>;
  outcome: string;
  error: string | null;
};

async function ledger(client: Client, options: PostOptions, input: LedgerInput): Promise<string> {
  const { data, error } = await client
    .from("dataforseo_requests")
    .insert({
      tenant_id: options.tenantId,
      capability_key: options.capabilityKey,
      family: options.family,
      endpoint: options.endpoint,
      mode: input.mode,
      request_fingerprint: options.requestFingerprint,
      workflow_run_id: options.workflowRunId ?? null,
      workflow_key: options.workflowKey ?? null,
      provider_status_code: input.providerStatusCode,
      provider_status_message: input.providerStatusMessage,
      http_status: input.httpStatus,
      task_count: input.taskCount,
      returned_row_count: input.rows,
      cost_usd: input.costUsd,
      duration_ms: input.durationMs,
      rate_limit: input.rateLimit as never,
      outcome: input.outcome,
      error: input.error,
    })
    .select("id")
    .single();
  if (error) throw new DataForSeoFailure("persistence", error.message);
  return data.id;
}

export type SnapshotInput = {
  tenantId: string;
  capabilityKey: string;
  family: string;
  endpoint: string;
  kind: string;
  target: string;
  mode?: string;
  requestFingerprint: string;
  requestParams: Record<string, unknown>;
  reportingDate: string;
  task: DataForSeoTask | null;
  rows: unknown[];
  totals?: Record<string, unknown>;
  possiblyTruncated?: boolean;
  costUsd: number;
  requestId?: string | null;
};

/**
 * Immutable evidence write. A fingerprint already stored is a successful
 * no-change outcome: the earlier snapshot is returned untouched.
 */
export async function persistSnapshot(
  client: Client,
  input: SnapshotInput,
): Promise<{ id: string; created: boolean; rows: number }> {
  const { data: existing, error: existingError } = await client
    .from("dataforseo_snapshots")
    .select("id, returned_row_count")
    .eq("tenant_id", input.tenantId)
    .eq("request_fingerprint", input.requestFingerprint)
    .maybeSingle();
  if (existingError) throw new DataForSeoFailure("persistence", existingError.message);
  if (existing) return { id: existing.id, created: false, rows: existing.returned_row_count };

  const { data, error } = await client
    .from("dataforseo_snapshots")
    .insert({
      tenant_id: input.tenantId,
      capability_key: input.capabilityKey,
      family: input.family,
      endpoint: input.endpoint,
      kind: input.kind,
      target: input.target,
      mode: input.mode ?? "live",
      request_fingerprint: input.requestFingerprint,
      checksum: checksum({
        endpoint: input.endpoint,
        params: input.requestParams,
        rows: input.rows,
      }),
      api_version: API_VERSION,
      provider_task_id: input.task?.id ?? null,
      provider_status_code: input.task?.status_code ?? null,
      provider_cost_usd: input.costUsd,
      request_params: input.requestParams as never,
      provider_meta: {
        path: input.task?.path ?? null,
        status_message: input.task?.status_message ?? null,
        data: input.task?.data ?? null,
      } as never,
      totals: (input.totals ?? {}) as never,
      payload: { rows: input.rows } as never,
      returned_row_count: input.rows.length,
      possibly_truncated: input.possiblyTruncated ?? false,
      reporting_date: input.reportingDate,
      request_id: input.requestId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new DataForSeoFailure("persistence", error.message);

  await logActivity(client, {
    verb: "capability.evidence_snapshot_written",
    subjectKind: "capability",
    summary: `DataForSEO ${input.kind} snapshot stored for ${input.target} (${input.rows.length} rows, $${input.costUsd.toFixed(4)}).`,
    payload: {
      capability: input.capabilityKey,
      kind: input.kind,
      target: input.target,
      rows: input.rows.length,
      costUsd: input.costUsd,
      fingerprint: input.requestFingerprint,
    },
    tenantId: input.tenantId,
  });

  return { id: data.id, created: true, rows: input.rows.length };
}

export { BudgetExceeded };
