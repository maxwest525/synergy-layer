import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";

type Client = SupabaseClient<Database>;

const BASE = "https://serpapi.com/search.json";
const ACCOUNT = "https://serpapi.com/account.json";

/** Digest section 8: one successful request costs one credit, whatever it returns. */
export const CREDIT_PER_SEARCH = 1;

/**
 * Per-run ceiling. SerpApi bills by credit, not by dollar, so AOOS caps the
 * number of searches a single workflow run may spend rather than guessing a
 * price. Nothing in this module can exceed it.
 */
export const MAX_SEARCHES_PER_RUN = 120;

export class SerpApiFailure extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "SerpApiFailure";
    this.reason = reason;
  }
}

function apiKey(): string {
  const key = process.env["SERPAPI_API_KEY"];
  if (!key) {
    throw new SerpApiFailure(
      "missing_credentials",
      "SERPAPI_API_KEY is not available to the server. Add it in Project Settings then re-run.",
    );
  }
  return key;
}

export function serpApiCredentialsPresent(): boolean {
  return Boolean(process.env["SERPAPI_API_KEY"]);
}

/** Stable, order-insensitive fingerprint of a provider query. */
export function fingerprint(engine: string, params: Record<string, unknown>): string {
  const normalized = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && key !== "api_key")
    .sort()
    .map((key) => [key, String(params[key])] as const);
  return createHash("sha256").update(JSON.stringify({ engine, normalized })).digest("hex");
}

export function checksum(parts: (string | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("\u0000"))
    .digest("hex");
}

export type SerpApiResponse = Record<string, unknown> & {
  error?: string;
  search_metadata?: { id?: string; status?: string; google_ads_transparency_center_url?: string };
  serpapi_pagination?: { next_page_token?: string; next?: string };
};

/**
 * A single provider search. Errors are surfaced, never swallowed: an empty
 * result set and a failed request must never look the same to a caller.
 */
export async function serpApiSearch(
  engine: string,
  params: Record<string, unknown>,
): Promise<{ data: SerpApiResponse; credits: number; sourceUrl: string }> {
  const query = new URLSearchParams({ engine });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const sourceUrl = `${BASE}?${query.toString()}`;
  query.set("api_key", apiKey());

  const response = await fetch(`${BASE}?${query.toString()}`);
  const body = await response.text();

  if (response.status === 401) {
    throw new SerpApiFailure("authorization", "SerpApi rejected the API key.");
  }
  if (response.status === 429) {
    throw new SerpApiFailure("rate_limited", "SerpApi throughput ceiling reached for this hour.");
  }

  let parsed: SerpApiResponse;
  try {
    parsed = JSON.parse(body) as SerpApiResponse;
  } catch {
    throw new SerpApiFailure(
      "api_error",
      `SerpApi returned an unreadable response [${response.status}].`,
    );
  }

  if (!response.ok || parsed.error) {
    // Digest section 8: errored searches do not consume quota.
    const message = parsed.error ?? `SerpApi request failed [${response.status}].`;
    if (/hasn't returned any results|no results/i.test(message)) {
      return { data: parsed, credits: 0, sourceUrl };
    }
    throw new SerpApiFailure("api_error", message);
  }

  return { data: parsed, credits: CREDIT_PER_SEARCH, sourceUrl };
}

/** Live auth probe. Returns the remaining credit picture, never the key itself. */
export async function probeSerpApiAccount(): Promise<{
  planName: string | null;
  searchesLeft: number | null;
  totalSearches: number | null;
}> {
  const response = await fetch(`${ACCOUNT}?api_key=${encodeURIComponent(apiKey())}`);
  if (response.status === 401) {
    throw new SerpApiFailure("authorization", "SerpApi rejected the API key.");
  }
  if (!response.ok) {
    throw new SerpApiFailure("api_error", `SerpApi account probe failed [${response.status}].`);
  }
  const data = (await response.json()) as {
    plan_name?: string;
    total_searches_left?: number;
    searches_per_month?: number;
  };
  return {
    planName: data.plan_name ?? null,
    searchesLeft: data.total_searches_left ?? null,
    totalSearches: data.searches_per_month ?? null,
  };
}

/** Credit spend is attributed in the activity log so every call is accountable. */
export async function recordSerpApiSpend(
  client: Client,
  tenantId: string,
  detail: { credits: number; module: string; note: string; runId?: string | null },
): Promise<void> {
  if (detail.credits <= 0) return;
  await logActivity(client, {
    tenantId,
    verb: "serpapi.spend",
    subjectKind: "capability",
    summary: `${detail.credits} SerpApi search credit${detail.credits === 1 ? "" : "s"} spent by ${detail.module}.`,
    payload: {
      credits: detail.credits,
      module: detail.module,
      note: detail.note,
      runId: detail.runId ?? null,
    },
  });
}
