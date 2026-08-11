import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";
import { MAX_SEARCHES_PER_RUN, recordSerpApiSpend, serpApiSearch } from "./transport.server";

type Client = SupabaseClient<Database>;

export const ADVERTISER_MODULE = "ads.advertiser_resolution";
export const ADVERTISER_REVIEW_HREF = "/ads/advertisers";

type CreativeRow = {
  advertiser_id?: string;
  advertiser?: string;
  ad_creative_id?: string;
  target_domain?: string;
  format?: string;
};

export type AdvertiserCandidate = {
  advertiserId: string;
  name: string | null;
  creatives: number;
  domains: string[];
  serves: boolean;
  confidence: number;
};

export type ResolutionResult = {
  domainsSearched: number;
  candidatesFiled: number;
  ambiguousDomains: string[];
  unresolvedDomains: string[];
  credits: number;
};

export function rootDomain(value: string): string {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/**
 * Groups a raw transparency-center payload into one candidate per distinct
 * advertiser ID. The provider does not disambiguate, and a single vendor can
 * legitimately run several advertiser accounts, so nothing is collapsed here.
 */
export function extractAdvertiserCandidates(
  data: Record<string, unknown>,
  domain: string,
): AdvertiserCandidate[] {
  const creatives = ((data["ad_creatives"] as CreativeRow[] | undefined) ?? []).filter(
    (row) => typeof row.advertiser_id === "string",
  );

  const grouped = new Map<string, { name: string | null; creatives: number; domains: Set<string> }>();
  for (const row of creatives) {
    const id = row.advertiser_id as string;
    const entry = grouped.get(id) ?? { name: row.advertiser ?? null, creatives: 0, domains: new Set<string>() };
    entry.creatives += 1;
    if (!entry.name && row.advertiser) entry.name = row.advertiser;
    if (row.target_domain) entry.domains.add(rootDomain(row.target_domain));
    grouped.set(id, entry);
  }

  return [...grouped.entries()].map(([advertiserId, entry]) => {
    // Confidence is evidence, not certainty: it rises when the advertiser
    // actually points ads at the vendor domain we searched for. It is clamped
    // into 0..1 because the database enforces that range.
    const serves = entry.domains.has(domain);
    const raw = serves ? 0.6 + entry.creatives / 100 : 0.35;
    return {
      advertiserId,
      name: entry.name,
      creatives: entry.creatives,
      domains: [...entry.domains],
      serves,
      confidence: Math.min(0.9, Math.max(0, raw)),
    };
  });
}

/**
 * Stores candidates as pending, always. There is no auto-confirm path anywhere
 * in this module: attribution of an advertiser account to a vendor is an
 * operator judgement, and a single-result search is not proof of ownership.
 */
export async function persistAdvertiserCandidates(
  client: Client,
  tenantId: string,
  input: {
    domain: string;
    watchlistId: string | null;
    candidates: AdvertiserCandidate[];
    sourceUrl: string;
  },
): Promise<number> {
  let filed = 0;
  for (const candidate of input.candidates) {
    const { error } = await client.from("ad_advertiser_candidates").upsert(
      {
        tenant_id: tenantId,
        watchlist_id: input.watchlistId,
        query_text: input.domain,
        advertiser_id: candidate.advertiserId,
        advertiser_name: candidate.name,
        match_confidence: candidate.confidence,
        review_state: "pending",
        evidence: {
          creativesObserved: candidate.creatives,
          targetDomains: candidate.domains,
          servesQueriedDomain: candidate.serves,
        } as never,
        source_url: input.sourceUrl,
      },
      { onConflict: "tenant_id,query_text,advertiser_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Advertiser candidate insert failed: ${error.message}`);
    filed += 1;
  }
  return filed;
}

type InboxAction = { kind: string; label: string; href: string };

/**
 * Keeps exactly one unresolved advertiser-review item in the Inbox and resolves
 * it only when no pending candidate remains. Duplicates are folded into the
 * oldest item so a repeated discovery run updates rather than stacks, and the
 * action always points at the advertiser surface rather than the competitor one.
 */
export async function syncAdvertiserReviewInbox(
  client: Client,
  tenantId: string,
): Promise<{ pending: number; itemId: string | null }> {
  const { count, error: countError } = await client
    .from("ad_advertiser_candidates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("review_state", "pending");
  if (countError) throw new Error(`Pending candidate count failed: ${countError.message}`);
  const pending = count ?? 0;

  const { data: open, error: openError } = await client
    .from("inbox_items")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("source_module", ADVERTISER_MODULE)
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  if (openError) throw new Error(`Inbox lookup failed: ${openError.message}`);

  const existing = open ?? [];

  if (pending === 0) {
    if (existing.length > 0) {
      const { error } = await client
        .from("inbox_items")
        .update({ resolved_at: new Date().toISOString(), lane: "completed" })
        .in("id", existing.map((row) => row.id));
      if (error) throw new Error(`Inbox resolve failed: ${error.message}`);
    }
    return { pending: 0, itemId: null };
  }

  const actions: InboxAction[] = [
    { kind: "open", label: "Review advertiser candidates", href: ADVERTISER_REVIEW_HREF },
  ];
  const payload = {
    lane: "pending_approval" as const,
    title: `${pending} Google advertiser candidate${pending === 1 ? "" : "s"} await confirmation`,
    summary:
      "AOOS observed advertiser accounts running ads for watched vendor domains. Each attribution needs an operator decision before it becomes a confirmed advertiser.",
    priority: 2,
    actions: actions as never,
  };

  // Fold every duplicate into the oldest item so the queue stays single-item.
  const [keep, ...duplicates] = existing;
  if (duplicates.length > 0) {
    const { error } = await client
      .from("inbox_items")
      .update({ resolved_at: new Date().toISOString(), lane: "completed" })
      .in("id", duplicates.map((row) => row.id));
    if (error) throw new Error(`Inbox dedupe failed: ${error.message}`);
  }

  if (keep) {
    const { error } = await client.from("inbox_items").update(payload).eq("id", keep.id);
    if (error) throw new Error(`Inbox update failed: ${error.message}`);
    return { pending, itemId: keep.id };
  }

  const { data, error } = await client
    .from("inbox_items")
    .insert({
      tenant_id: tenantId,
      source_module: ADVERTISER_MODULE,
      subject_kind: "capability",
      ...payload,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Inbox insert failed: ${error.message}`);
  return { pending, itemId: data.id };
}

/**
 * Bulk domain to advertiser resolution across the watchlist. Every observed
 * advertiser is filed as a pending candidate; nothing is confirmed here.
 */
export async function resolveVendorAdvertisers(
  client: Client,
  tenantId: string,
  options: { runId?: string | null; limit?: number } = {},
): Promise<ResolutionResult> {
  const { data: watchlist, error: watchlistError } = await client
    .from("ad_vendor_watchlist")
    .select("id, domain, resolution_state")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .neq("resolution_state", "resolved")
    .order("domain")
    .limit(Math.min(options.limit ?? 20, MAX_SEARCHES_PER_RUN));
  if (watchlistError) throw new Error(`Watchlist read failed: ${watchlistError.message}`);

  const result: ResolutionResult = {
    domainsSearched: 0,
    candidatesFiled: 0,
    ambiguousDomains: [],
    unresolvedDomains: [],
    credits: 0,
  };

  for (const vendor of watchlist ?? []) {
    const domain = rootDomain(vendor.domain);
    const { data, credits, sourceUrl } = await serpApiSearch("google_ads_transparency_center", {
      text: domain,
      num: 40,
    });
    result.domainsSearched += 1;
    result.credits += credits;

    const candidates = extractAdvertiserCandidates(data, domain);

    if (candidates.length === 0) {
      result.unresolvedDomains.push(domain);
      await client
        .from("ad_vendor_watchlist")
        .update({ resolution_state: "no_advertiser_found" })
        .eq("id", vendor.id);
      continue;
    }

    result.candidatesFiled += await persistAdvertiserCandidates(client, tenantId, {
      domain,
      watchlistId: vendor.id,
      candidates,
      sourceUrl,
    });

    result.ambiguousDomains.push(domain);
    await client
      .from("ad_vendor_watchlist")
      .update({ resolution_state: "pending_review" })
      .eq("id", vendor.id);
  }

  await recordSerpApiSpend(client, tenantId, {
    credits: result.credits,
    module: ADVERTISER_MODULE,
    note: `Advertiser resolution across ${result.domainsSearched} vendor domains.`,
    runId: options.runId ?? null,
  });

  await syncAdvertiserReviewInbox(client, tenantId);

  await logActivity(client, {
    tenantId,
    verb: "ads.advertisers_resolved",
    subjectKind: "capability",
    summary: `Advertiser resolution: ${result.candidatesFiled} candidates filed for review across ${result.domainsSearched} domains, ${result.unresolvedDomains.length} with no advertiser found.`,
    payload: { ...result } as never,
  });

  return result;
}
