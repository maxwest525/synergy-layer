import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Client-safe view models. Nothing here can carry a credential. */
export type AdsAccountView = {
  configured: boolean;
  valid: boolean;
  planName: string | null;
  searchesLeft: number | null;
  searchesPerMonth: number | null;
  hourlyLimit: number | null;
  thisHourSearches: number | null;
  thisMonthUsage: number | null;
  checkedAt: string | null;
  error: string | null;
};

export type AdsWatchlistView = {
  id: string;
  domain: string;
  label: string | null;
  active: boolean;
  resolutionState: string;
  linkedAdvertisers: number;
};

export type AdsLedgerView = {
  id: string;
  module: string;
  runKey: string;
  engine: string;
  queryText: string | null;
  state: string;
  reservedCredits: number;
  chargedCredits: number;
  providerSearchId: string | null;
  providerStatus: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  failureReason: string | null;
};

export type AdsCandidateView = {
  id: string;
  domain: string;
  advertiserId: string;
  advertiserName: string | null;
  adFundedBy: string | null;
  confidence: number | null;
  reviewState: string;
  creativesObserved: number;
  targetDomains: string[];
  servesQueriedDomain: boolean;
  sourceUrl: string | null;
  createdAt: string;
};

export type AdsAdvertiserView = {
  id: string;
  advertiserId: string;
  advertiserName: string | null;
  adFundedBy: string | null;
  vendorDomain: string | null;
  confirmedAt: string | null;
  linkedDomains: string[];
};

/** One observed competitor ad. This data was stored but never shown before. */
export type AdsCreativeView = {
  id: string;
  advertiserFk: string;
  format: string | null;
  headline: string | null;
  snippet: string | null;
  callToAction: string | null;
  targetDomain: string | null;
  link: string | null;
  firstShown: string | null;
  lastShown: string | null;
  observedAt: string | null;
};

export type AdsOverview = {
  account: AdsAccountView;
  watchlist: AdsWatchlistView[];
  ledger: AdsLedgerView[];
  candidates: AdsCandidateView[];
  advertisers: AdsAdvertiserView[];
  creatives: AdsCreativeView[];
  pendingCount: number;
};


function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Everything the advertiser review surface renders, read as the signed-in
 * operator so RLS decides visibility. The API key is never read here: only the
 * quota facts the free account probe already recorded on the capability.
 */
export const getAdsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdsOverview> => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const [capability, watchlist, ledger, candidates, advertisers, links, creatives] =
      await Promise.all([
        db
          .from("capabilities")
          .select("config, integration_state, health")
          .eq("key", "cap.serpapi_ads_transparency")
          .maybeSingle(),
        db
          .from("ad_vendor_watchlist")
          .select("id, domain, label, active, resolution_state")
          .eq("tenant_id", tenantId)
          .order("domain"),
        db
          .from("serpapi_requests")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("started_at", { ascending: false })
          .limit(50),
        db
          .from("ad_advertiser_candidates")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("ad_advertisers")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("confirmed_at", { ascending: false })
          .limit(200),
        db
          .from("ad_vendor_advertisers")
          .select("watchlist_id, advertiser_fk")
          .eq("tenant_id", tenantId),
        db
          .from("ad_creatives")
          .select(
            "id, advertiser_fk, format, headline, snippet, call_to_action, target_domain, link, first_shown, last_shown, retrieved_at",
          )
          .eq("tenant_id", tenantId)
          .order("last_detected_at", { ascending: false })
          .limit(120),
      ]);

    for (const result of [
      capability,
      watchlist,
      ledger,
      candidates,
      advertisers,
      links,
      creatives,
    ]) {

      if (result.error) throw new Error(`Ads overview read failed: ${result.error.message}`);
    }

    const status = asRecord(asRecord(capability.data?.config)["accountStatus"]);
    const linkRows = links.data ?? [];

    const linksByWatchlist = new Map<string, number>();
    const domainsByAdvertiser = new Map<string, Set<string>>();
    const watchlistDomain = new Map((watchlist.data ?? []).map((row) => [row.id, row.domain]));
    for (const link of linkRows) {
      linksByWatchlist.set(link.watchlist_id, (linksByWatchlist.get(link.watchlist_id) ?? 0) + 1);
      const set = domainsByAdvertiser.get(link.advertiser_fk) ?? new Set<string>();
      const domain = watchlistDomain.get(link.watchlist_id);
      if (domain) set.add(domain);
      domainsByAdvertiser.set(link.advertiser_fk, set);
    }

    const candidateRows = (candidates.data ?? []).map((row): AdsCandidateView => {
      const evidence = asRecord(row.evidence);
      return {
        id: row.id,
        domain: row.query_text,
        advertiserId: row.advertiser_id,
        advertiserName: row.advertiser_name,
        adFundedBy: row.ad_funded_by,
        confidence: row.match_confidence === null ? null : Number(row.match_confidence),
        reviewState: row.review_state,
        creativesObserved: Number(evidence["creativesObserved"] ?? 0),
        targetDomains: Array.isArray(evidence["targetDomains"])
          ? (evidence["targetDomains"] as string[])
          : [],
        servesQueriedDomain: evidence["servesQueriedDomain"] === true,
        sourceUrl: row.source_url,
        createdAt: row.created_at,
      };
    });

    return {
      account: {
        configured: Object.keys(status).length > 0,
        valid: status["valid"] === true,
        planName: (status["planName"] as string | null) ?? null,
        searchesLeft: (status["searchesLeft"] as number | null) ?? null,
        searchesPerMonth: (status["searchesPerMonth"] as number | null) ?? null,
        hourlyLimit: (status["hourlyLimit"] as number | null) ?? null,
        thisHourSearches: (status["thisHourSearches"] as number | null) ?? null,
        thisMonthUsage: (status["thisMonthUsage"] as number | null) ?? null,
        checkedAt: (status["checkedAt"] as string | null) ?? null,
        error: (status["error"] as string | null) ?? null,
      },
      watchlist: (watchlist.data ?? []).map((row) => ({
        id: row.id,
        domain: row.domain,
        label: row.label,
        active: row.active,
        resolutionState: row.resolution_state,
        linkedAdvertisers: linksByWatchlist.get(row.id) ?? 0,
      })),
      ledger: (ledger.data ?? []).map((row) => ({
        id: row.id,
        module: row.module,
        runKey: row.run_key,
        engine: row.engine,
        queryText: row.query_text,
        state: row.state,
        reservedCredits: row.reserved_credits,
        chargedCredits: row.charged_credits,
        providerSearchId: row.provider_search_id,
        providerStatus: row.provider_status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: row.duration_ms,
        failureReason: row.failure_reason,
      })),
      candidates: candidateRows,
      advertisers: (advertisers.data ?? []).map((row) => ({
        id: row.id,
        advertiserId: row.advertiser_id,
        advertiserName: row.advertiser_name,
        adFundedBy: row.ad_funded_by,
        vendorDomain: row.vendor_domain,
        confirmedAt: row.confirmed_at,
        linkedDomains: [...(domainsByAdvertiser.get(row.id) ?? [])],
      })),
      creatives: (creatives.data ?? []).map((row) => ({
        id: row.id,
        advertiserFk: row.advertiser_fk,
        format: row.format,
        headline: row.headline,
        snippet: row.snippet,
        callToAction: row.call_to_action,
        targetDomain: row.target_domain,
        link: row.link,
        firstShown: row.first_shown,
        lastShown: row.last_shown,
        observedAt: row.retrieved_at,
      })),
      pendingCount: candidateRows.filter((row) => row.reviewState === "pending").length,
    };
  });

/**
 * Free provider gate check. Costs nothing, so it is allowed to run while the
 * capability is still pending. It promotes only the transport capability; every
 * later Ads stage stays pending until it is separately earned.
 */
export const checkAdsProviderGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);

    const { checkSerpApiAccount, recordSerpApiAccountStatus } =
      await import("./serpapi/account.server");
    const status = await checkSerpApiAccount();
    await recordSerpApiAccountStatus(context.supabase, status);
    return status;
  });

/**
 * One operator decision on one advertiser candidate. The whole transaction
 * lives in a SECURITY INVOKER database function, so the auth, role, tenant, and
 * still-pending checks cannot be bypassed by calling the tables directly.
 */
export const decideAdvertiserCandidate = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ candidateId: z.string().uuid(), decision: z.enum(["confirm", "reject"]) })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);

    const { data: result, error } = await context.supabase.rpc("decide_ad_advertiser_candidate", {
      _candidate_id: data.candidateId,
      _decision: data.decision,
    });
    if (error) throw new Error(error.message);

    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);
    const { syncAdvertiserReviewInbox } = await import("./serpapi/advertisers.server");
    // The review item is resolved only when nothing is left pending.
    const { pending } = await syncAdvertiserReviewInbox(context.supabase, tenantId);

    const { logActivity } = await import("./os.server");
    await logActivity(context.supabase, {
      tenantId,
      actorKind: "user",
      actorId: context.userId,
      verb: `ads.advertiser_${data.decision === "confirm" ? "confirmed" : "rejected"}`,
      subjectKind: "ad_advertiser_candidate",
      subjectId: data.candidateId,
      summary: `Advertiser candidate ${data.decision === "confirm" ? "confirmed" : "rejected"} by operator.`,
      payload: (result ?? {}) as never,
    });

    return { result, pending };
  });

/**
 * The single metered canary. Bounded to one provider search, gated on a live
 * free account probe, and incapable of confirming anything on its own.
 */
export const runAdsCanary = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        domain: z
          .string()
          .min(3)
          .max(253)
          .regex(/^[a-z0-9.-]+$/i, "Enter a bare domain."),
        runKey: z.string().min(3).max(200).optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { runAdvertiserCanary } = await import("./serpapi/canary.server");
    return runAdvertiserCanary(context.supabase, tenantId, data);
  });

/**
 * Bounded metered sweep across the still-unresolved watchlist. Each domain
 * goes through the same single-credit canary path, so every request keeps its
 * own ledger reservation, account floor check, and idempotency key. Nothing is
 * confirmed: every advertiser lands pending for operator review.
 */
export const runAdvertiserSweep = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ limit: z.number().int().min(1).max(12).optional() }).parse(data ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { sweepVendorAdvertisers } = await import("./serpapi/sweep.server");
    return sweepVendorAdvertisers(context.supabase, tenantId, { limit: data.limit ?? 12 });
  });
