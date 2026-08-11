import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";
import { runAdvertiserCanary, type CanaryResult } from "./canary.server";
import { rootDomain } from "./advertisers.server";

type Client = SupabaseClient<Database>;

/** A sweep is still metered, so it is hard capped no matter what the caller asks for. */
export const SWEEP_MAX_DOMAINS = 12;

export type SweepDomainOutcome = {
  domain: string;
  ran: boolean;
  blocked: string | null;
  chargedCredits: number;
  candidatesFiled: number;
};

export type SweepResult = {
  domainsAttempted: number;
  domainsSearched: number;
  candidatesFiled: number;
  chargedCredits: number;
  pendingCandidates: number;
  stoppedEarly: string | null;
  outcomes: SweepDomainOutcome[];
};

/**
 * Walks the unresolved watchlist one domain at a time, reusing the single
 * metered canary path so every request keeps its own ledger reservation,
 * idempotency key, account floor check, and observed charge. The sweep stops
 * the moment a domain is blocked for an account or credential reason, because
 * continuing would just repeat the same refusal against a live balance.
 *
 * Nothing is confirmed here. Every advertiser lands pending for operator review.
 */
export async function sweepVendorAdvertisers(
  client: Client,
  tenantId: string,
  options: { limit?: number; runKeyPrefix?: string } = {},
): Promise<SweepResult> {
  const limit = Math.min(Math.max(options.limit ?? SWEEP_MAX_DOMAINS, 1), SWEEP_MAX_DOMAINS);

  const { data: watchlist, error } = await client
    .from("ad_vendor_watchlist")
    .select("id, domain, resolution_state")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .eq("resolution_state", "unresolved")
    .order("domain")
    .limit(limit);
  if (error) throw new Error(`Watchlist read failed: ${error.message}`);

  const result: SweepResult = {
    domainsAttempted: 0,
    domainsSearched: 0,
    candidatesFiled: 0,
    chargedCredits: 0,
    pendingCandidates: 0,
    stoppedEarly: null,
    outcomes: [],
  };

  for (const vendor of watchlist ?? []) {
    const domain = rootDomain(vendor.domain);
    result.domainsAttempted += 1;

    // A previous attempt that failed left a ledger row under the plain key, and
    // idempotency would otherwise refuse the retry forever. A failed attempt
    // charged nothing, so a retry under a distinct key cannot double-spend.
    const baseKey = `${options.runKeyPrefix ?? "sweep"}:${domain}`;
    const { data: prior } = await client
      .from("serpapi_requests")
      .select("state")
      .eq("tenant_id", tenantId)
      .eq("run_key", baseKey)
      .maybeSingle();
    const runKey = prior?.state === "failed" ? `${baseKey}:retry:${Date.now()}` : baseKey;

    let outcome: CanaryResult;
    try {
      outcome = await runAdvertiserCanary(client, tenantId, { domain, runKey });
    } catch (cause) {

      const reason = cause instanceof Error ? cause.message : String(cause);
      result.outcomes.push({ domain, ran: false, blocked: reason, chargedCredits: 0, candidatesFiled: 0 });
      result.stoppedEarly = reason;
      break;
    }

    result.outcomes.push({
      domain,
      ran: outcome.ran,
      blocked: outcome.blocked,
      chargedCredits: outcome.chargedCredits,
      candidatesFiled: outcome.candidatesFiled,
    });
    result.chargedCredits += outcome.chargedCredits;
    result.candidatesFiled += outcome.candidatesFiled;
    result.pendingCandidates = outcome.pendingCandidates;
    if (outcome.ran) result.domainsSearched += 1;

    // An account, quota, or credential refusal will repeat for every remaining
    // domain, so the sweep stops rather than hammering the provider gate.
    if (!outcome.ran && outcome.blocked && !outcome.blocked.includes("already ran")) {
      result.stoppedEarly = outcome.blocked;
      break;
    }
  }

  await logActivity(client, {
    tenantId,
    verb: "ads.advertiser_sweep_completed",
    subjectKind: "capability",
    summary: `Advertiser sweep searched ${result.domainsSearched} of ${result.domainsAttempted} vendor domains, filed ${result.candidatesFiled} candidate${result.candidatesFiled === 1 ? "" : "s"} for review, and charged ${result.chargedCredits} credit${result.chargedCredits === 1 ? "" : "s"}.`,
    payload: { ...result } as never,
  });

  return result;
}
