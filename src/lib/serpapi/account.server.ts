import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { SerpApiFailure } from "./transport.server";

type Client = SupabaseClient<Database>;

const ACCOUNT = "https://serpapi.com/account.json";
const TIMEOUT_MS = 15_000;

/**
 * The SerpApi Account API is free: it does not consume a search credit. That
 * makes it the only probe allowed to run while the provider capability is still
 * pending, which is what lets the gate be reachable without spending anything.
 */
export type AccountStatus = {
  valid: boolean;
  planName: string | null;
  searchesLeft: number | null;
  searchesPerMonth: number | null;
  hourlyLimit: number | null;
  thisHourSearches: number | null;
  thisMonthUsage: number | null;
  checkedAt: string;
  error: string | null;
};

const UNKNOWN: Omit<AccountStatus, "checkedAt" | "error" | "valid"> = {
  planName: null,
  searchesLeft: null,
  searchesPerMonth: null,
  hourlyLimit: null,
  thisHourSearches: null,
  thisMonthUsage: null,
};

/**
 * Free account probe. Never returns, logs, or stores the API key, and never
 * throws for an invalid key: an unusable account is a reportable state, not a
 * crash, because the caller has to fail closed on it.
 */
export async function checkSerpApiAccount(): Promise<AccountStatus> {
  const checkedAt = new Date().toISOString();
  const key = process.env["SERPAPI_API_KEY"];
  if (!key) {
    return {
      ...UNKNOWN,
      valid: false,
      checkedAt,
      error: "SERPAPI_API_KEY is not available to the server.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ACCOUNT}?api_key=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    });

    if (response.status === 401) {
      return { ...UNKNOWN, valid: false, checkedAt, error: "SerpApi rejected the stored API key." };
    }
    if (!response.ok) {
      return {
        ...UNKNOWN,
        valid: false,
        checkedAt,
        error: `SerpApi account probe failed [${response.status}].`,
      };
    }

    const data = (await response.json()) as {
      plan_name?: string;
      total_searches_left?: number;
      plan_searches_left?: number;
      searches_per_month?: number;
      account_rate_limit_per_hour?: number;
      this_hour_searches?: number;
      this_month_usage?: number;
    };

    const searchesLeft = data.total_searches_left ?? data.plan_searches_left ?? null;

    return {
      valid: true,
      planName: data.plan_name ?? null,
      searchesLeft: typeof searchesLeft === "number" ? searchesLeft : null,
      searchesPerMonth: data.searches_per_month ?? null,
      hourlyLimit: data.account_rate_limit_per_hour ?? null,
      thisHourSearches: data.this_hour_searches ?? null,
      thisMonthUsage: data.this_month_usage ?? null,
      checkedAt,
      error: null,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ...UNKNOWN,
      valid: false,
      checkedAt,
      error: aborted
        ? "SerpApi account probe timed out."
        : error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Persists the account picture on the transport capability only. Nothing here
 * can be reconstructed into a credential: plan name, remaining searches, and
 * the hourly ceiling are quota facts, not secrets.
 *
 * Only cap.serpapi_ads_transparency is promoted. Advertiser resolution and every
 * later Ads stage stay pending until the canary and an operator review say
 * otherwise, so a reachable gate never reads as a finished integration.
 */
export async function recordSerpApiAccountStatus(
  client: Client,
  status: AccountStatus,
): Promise<void> {
  const { data: capability, error: readError } = await client
    .from("capabilities")
    .select("id, config")
    .eq("key", "cap.serpapi_ads_transparency")
    .maybeSingle();
  if (readError) throw new Error(`Capability read failed: ${readError.message}`);
  if (!capability) throw new Error("cap.serpapi_ads_transparency is not registered.");

  const config = { ...((capability.config ?? {}) as Record<string, unknown>) };
  config["accountStatus"] = {
    valid: status.valid,
    planName: status.planName,
    searchesLeft: status.searchesLeft,
    searchesPerMonth: status.searchesPerMonth,
    hourlyLimit: status.hourlyLimit,
    thisHourSearches: status.thisHourSearches,
    thisMonthUsage: status.thisMonthUsage,
    checkedAt: status.checkedAt,
    error: status.error,
  };

  const { error } = await client
    .from("capabilities")
    .update({
      config: config as never,
      integration_state: status.valid ? "real" : "pending",
      health: status.valid ? "healthy" : "failing",
      last_run_at: status.checkedAt,
    })
    .eq("id", capability.id);
  if (error) throw new Error(`Capability update failed: ${error.message}`);
}

export { SerpApiFailure };
