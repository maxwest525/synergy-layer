import type { Database } from "@/integrations/supabase/types";

type LedgerRow = Database["public"]["Tables"]["serpapi_requests"]["Row"];

export type ReserveInput = {
  tenantId: string;
  module: string;
  /** Idempotency key. A repeated key never buys a second provider search. */
  runKey: string;
  engine: string;
  requestFingerprint: string;
  queryText?: string | null;
  /** Must already be key free. Callers build it without api_key. */
  sourceUrl?: string | null;
  reservedCredits: number;
  searchesLeftBefore?: number | null;
};

export type SettleInput = {
  state: "succeeded" | "failed";
  chargedCredits: number;
  providerSearchId?: string | null;
  providerStatus?: string | null;
  searchesLeftAfter?: number | null;
  failureReason?: string | null;
};

export type Reservation = { row: LedgerRow; alreadyExisted: boolean };

/**
 * The provider ledger is append-only to every authenticated client: there is no
 * UPDATE or DELETE grant on the table for `authenticated`. Settlement therefore
 * runs through the service role, which is a backend role rather than a
 * SECURITY DEFINER escape hatch. Callers must verify the operator before they
 * get here; this module never decides who is allowed to spend.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Strips any credential that could otherwise reach durable storage. */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/api_key|apikey|token|secret|password/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url.replace(/([?&](api_key|apikey|token|secret)=)[^&]*/gi, "$1[redacted]");
  }
}

/**
 * Durably reserves credits BEFORE the provider call. If the same run key was
 * already reserved the existing row is returned untouched, so a retry can never
 * double-spend.
 */
export async function reserveSerpApiRequest(input: ReserveInput): Promise<Reservation> {
  const db = await admin();

  const { data: existing, error: lookupError } = await db
    .from("serpapi_requests")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("run_key", input.runKey)
    .maybeSingle();
  if (lookupError) throw new Error(`Provider ledger lookup failed: ${lookupError.message}`);
  if (existing) return { row: existing, alreadyExisted: true };

  const { data, error } = await db
    .from("serpapi_requests")
    .insert({
      tenant_id: input.tenantId,
      module: input.module,
      run_key: input.runKey,
      engine: input.engine,
      request_fingerprint: input.requestFingerprint,
      query_text: input.queryText ?? null,
      source_url: input.sourceUrl ? sanitizeUrl(input.sourceUrl) : null,
      state: "reserved",
      reserved_credits: input.reservedCredits,
      charged_credits: 0,
      account_searches_left_before: input.searchesLeftBefore ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // A unique violation means a concurrent attempt already reserved this key.
    if (error.code === "23505") {
      const { data: raced } = await db
        .from("serpapi_requests")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("run_key", input.runKey)
        .maybeSingle();
      if (raced) return { row: raced, alreadyExisted: true };
    }
    throw new Error(`Provider ledger reservation failed: ${error.message}`);
  }

  return { row: data, alreadyExisted: false };
}

/** Records the real outcome. A failed call settles at zero charged credits. */
export async function settleSerpApiRequest(id: string, input: SettleInput): Promise<LedgerRow> {
  const db = await admin();
  const finishedAt = new Date();

  const { data: current, error: readError } = await db
    .from("serpapi_requests")
    .select("started_at")
    .eq("id", id)
    .single();
  if (readError) throw new Error(`Provider ledger settle read failed: ${readError.message}`);

  const startedAt = new Date(current.started_at).getTime();

  const { data, error } = await db
    .from("serpapi_requests")
    .update({
      state: input.state,
      charged_credits: input.state === "failed" ? 0 : Math.max(0, input.chargedCredits),
      provider_search_id: input.providerSearchId ?? null,
      provider_status: input.providerStatus ?? null,
      account_searches_left_after: input.searchesLeftAfter ?? null,
      finished_at: finishedAt.toISOString(),
      duration_ms: Number.isFinite(startedAt) ? finishedAt.getTime() - startedAt : null,
      failure_reason: input.failureReason ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Provider ledger settle failed: ${error.message}`);
  return data;
}
