import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";
import { checkSerpApiAccount, recordSerpApiAccountStatus, type AccountStatus } from "./account.server";
import {
  extractAdvertiserCandidates,
  persistAdvertiserCandidates,
  rootDomain,
  syncAdvertiserReviewInbox,
} from "./advertisers.server";
import { reserveSerpApiRequest, sanitizeUrl, settleSerpApiRequest } from "./ledger.server";
import { fingerprint, SerpApiFailure } from "./transport.server";

type Client = SupabaseClient<Database>;

const ENGINE = "google_ads_transparency_center";
const MODULE = "ads.canary";
const BASE = "https://serpapi.com/search.json";

/** A canary may never buy more than this, whatever the caller asks for. */
export const CANARY_MAX_CREDITS = 1;
/** Refuse to spend when the account is this close to empty. */
export const MIN_REMAINING_SEARCHES = 10;
const TIMEOUT_MS = 30_000;

export type CanaryResult = {
  ran: boolean;
  blocked: string | null;
  ledgerId: string | null;
  reservedCredits: number;
  chargedCredits: number;
  candidatesFiled: number;
  pendingCandidates: number;
  providerSearchId: string | null;
  providerStatus: string | null;
  accountBefore: AccountStatus | null;
  accountAfter: AccountStatus | null;
};

function blocked(reason: string, account: AccountStatus | null): CanaryResult {
  return {
    ran: false,
    blocked: reason,
    ledgerId: null,
    reservedCredits: 0,
    chargedCredits: 0,
    candidatesFiled: 0,
    pendingCandidates: 0,
    providerSearchId: null,
    providerStatus: null,
    accountBefore: account,
    accountAfter: null,
  };
}

/**
 * Exactly one metered Google Ads Transparency search, or none at all.
 *
 * The order matters and is deliberate: probe the free account endpoint, refuse
 * to spend unless the account is valid and comfortably above the floor, reserve
 * the credit durably under an idempotent run key, call the provider under a
 * timeout, then re-probe to record what the account balance actually did. A
 * cached or free provider hit legitimately shows a zero decrease, so the ledger
 * records observed reality rather than an assumed one-credit charge.
 *
 * Callers must already have verified the operator. Nothing here confirms an
 * advertiser: candidates land pending and go to the Inbox.
 */
export async function runAdvertiserCanary(
  client: Client,
  tenantId: string,
  input: { domain: string; runKey?: string | undefined },
): Promise<CanaryResult> {
  const domain = rootDomain(input.domain);

  const before = await checkSerpApiAccount();
  await recordSerpApiAccountStatus(client, before);

  if (!before.valid) {
    return blocked(before.error ?? "The SerpApi account is not usable.", before);
  }
  if (before.searchesLeft === null) {
    return blocked(
      "SerpApi did not report a remaining search count. AOOS will not spend against an unknown quota.",
      before,
    );
  }
  if (before.searchesLeft < MIN_REMAINING_SEARCHES) {
    return blocked(
      `Only ${before.searchesLeft} SerpApi searches remain, below the ${MIN_REMAINING_SEARCHES} search floor. No paid search was made.`,
      before,
    );
  }

  const params: Record<string, string> = { engine: ENGINE, text: domain, num: "20" };
  const query = new URLSearchParams(params);
  const sourceUrl = sanitizeUrl(`${BASE}?${query.toString()}`);
  const requestFingerprint = fingerprint(ENGINE, params);
  const runKey = input.runKey ?? `canary:${ENGINE}:${domain}`;

  const { row: reservation, alreadyExisted } = await reserveSerpApiRequest({
    tenantId,
    module: MODULE,
    runKey,
    engine: ENGINE,
    requestFingerprint,
    queryText: domain,
    sourceUrl,
    reservedCredits: CANARY_MAX_CREDITS,
    searchesLeftBefore: before.searchesLeft,
  });

  if (alreadyExisted) {
    const { pending } = await syncAdvertiserReviewInbox(client, tenantId);
    return {
      ran: false,
      blocked: `Canary "${runKey}" already ran (${reservation.state}). The idempotency key prevented a second paid search.`,
      ledgerId: reservation.id,
      reservedCredits: reservation.reserved_credits,
      chargedCredits: reservation.charged_credits,
      candidatesFiled: 0,
      pendingCandidates: pending,
      providerSearchId: reservation.provider_search_id,
      providerStatus: reservation.provider_status,
      accountBefore: before,
      accountAfter: null,
    };
  }

  const key = process.env["SERPAPI_API_KEY"];
  if (!key) {
    await settleSerpApiRequest(reservation.id, {
      state: "failed",
      chargedCredits: 0,
      failureReason: "SERPAPI_API_KEY is not available to the server.",
    });
    return blocked("SERPAPI_API_KEY is not available to the server.", before);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let payload: Record<string, unknown>;
  try {
    const authed = new URLSearchParams(query);
    authed.set("api_key", key);
    const response = await fetch(`${BASE}?${authed.toString()}`, { signal: controller.signal });
    const body = await response.text();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new SerpApiFailure("api_error", `SerpApi returned an unreadable response [${response.status}].`);
    }
    const providerError = typeof parsed["error"] === "string" ? (parsed["error"] as string) : null;
    // "No results" is a real, successful observation: the provider searched and
    // found nothing. It is not a transport failure and must not stop a sweep.
    const emptyResult = providerError !== null && /hasn't returned any results|no results/i.test(providerError);
    if (!response.ok || (providerError && !emptyResult)) {
      throw new SerpApiFailure("api_error", providerError ?? `SerpApi request failed [${response.status}].`);
    }
    payload = emptyResult ? { search_metadata: parsed["search_metadata"] ?? {}, ad_creatives: [] } : parsed;

  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const reason = aborted
      ? `SerpApi canary timed out after ${TIMEOUT_MS} ms.`
      : error instanceof Error
        ? error.message
        : String(error);
    // A failed call is settled at zero charged credits: the ledger records the
    // attempt, not an imagined spend.
    await settleSerpApiRequest(reservation.id, {
      state: "failed",
      chargedCredits: 0,
      failureReason: reason,
    });
    await logActivity(client, {
      tenantId,
      verb: "ads.canary_failed",
      subjectKind: "capability",
      summary: `Google Ads Transparency canary for ${domain} failed: ${reason}`,
      payload: { domain, ledgerId: reservation.id, reason } as never,
    });
    return { ...blocked(reason, before), ledgerId: reservation.id, reservedCredits: CANARY_MAX_CREDITS };
  } finally {
    clearTimeout(timer);
  }

  const metadata = (payload["search_metadata"] ?? {}) as { id?: string; status?: string };

  const after = await checkSerpApiAccount();
  await recordSerpApiAccountStatus(client, after);

  const observedCharge =
    after.valid && after.searchesLeft !== null && before.searchesLeft !== null
      ? Math.max(0, before.searchesLeft - after.searchesLeft)
      : CANARY_MAX_CREDITS;
  const chargedCredits = Math.min(CANARY_MAX_CREDITS, observedCharge);

  await settleSerpApiRequest(reservation.id, {
    state: "succeeded",
    chargedCredits,
    providerSearchId: metadata.id ?? null,
    providerStatus: metadata.status ?? null,
    searchesLeftAfter: after.searchesLeft,
  });

  const candidates = extractAdvertiserCandidates(payload, domain);

  const { data: watchlist } = await client
    .from("ad_vendor_watchlist")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("domain", domain)
    .maybeSingle();

  const candidatesFiled = await persistAdvertiserCandidates(client, tenantId, {
    domain,
    watchlistId: watchlist?.id ?? null,
    candidates,
    sourceUrl,
  });

  if (watchlist?.id) {
    await client
      .from("ad_vendor_watchlist")
      .update({ resolution_state: candidates.length > 0 ? "pending_review" : "no_advertiser_found" })
      .eq("id", watchlist.id);
  }

  const { pending } = await syncAdvertiserReviewInbox(client, tenantId);

  await logActivity(client, {
    tenantId,
    verb: "ads.canary_succeeded",
    subjectKind: "capability",
    summary: `Google Ads Transparency canary for ${domain}: ${candidatesFiled} advertiser candidate${candidatesFiled === 1 ? "" : "s"} filed for review, ${chargedCredits} credit${chargedCredits === 1 ? "" : "s"} charged.`,
    payload: {
      domain,
      ledgerId: reservation.id,
      providerSearchId: metadata.id ?? null,
      chargedCredits,
      candidatesFiled,
    } as never,
  });

  return {
    ran: true,
    blocked: null,
    ledgerId: reservation.id,
    reservedCredits: CANARY_MAX_CREDITS,
    chargedCredits,
    candidatesFiled,
    pendingCandidates: pending,
    providerSearchId: metadata.id ?? null,
    providerStatus: metadata.status ?? null,
    accountBefore: before,
    accountAfter: after,
  };
}
