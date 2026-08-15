import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";

type Client = SupabaseClient<Database>;

export type NetworkResult = {
  advertisers: number;
  sharedDomains: { domain: string; advertiserIds: string[] }[];
  sharedFunders: { funder: string; advertiserIds: string[] }[];
  repeatedOffers: { offer: string; count: number }[];
  dominantFunnelTypes: { funnelType: string; count: number }[];
};

/**
 * Derived analysis only. No provider call, no cost: it re-reads stored creative
 * evidence and reports overlap between advertisers. Shared infrastructure is an
 * observation, never an accusation.
 */
export async function analyzeVendorNetwork(
  client: Client,
  tenantId: string,
): Promise<NetworkResult> {
  const { data: advertisers } = await client
    .from("ad_advertisers")
    .select("id, advertiser_id, ad_funded_by")
    .eq("tenant_id", tenantId);

  const { data: creatives } = await client
    .from("ad_creatives")
    .select("advertiser_fk, target_domain, messaging")
    .eq("tenant_id", tenantId);

  const idByFk = new Map((advertisers ?? []).map((row) => [row.id, row.advertiser_id]));

  const domainMap = new Map<string, Set<string>>();
  const offerCounts = new Map<string, number>();
  const funnelCounts = new Map<string, number>();

  for (const creative of creatives ?? []) {
    const advertiserId = idByFk.get(creative.advertiser_fk);
    if (creative.target_domain && advertiserId) {
      const set = domainMap.get(creative.target_domain) ?? new Set<string>();
      set.add(advertiserId);
      domainMap.set(creative.target_domain, set);
    }
    const messaging = (creative.messaging ?? {}) as {
      offer?: string | null;
      funnelType?: string | null;
    };
    if (messaging.offer)
      offerCounts.set(messaging.offer, (offerCounts.get(messaging.offer) ?? 0) + 1);
    if (messaging.funnelType)
      funnelCounts.set(messaging.funnelType, (funnelCounts.get(messaging.funnelType) ?? 0) + 1);
  }

  const funderMap = new Map<string, string[]>();
  for (const advertiser of advertisers ?? []) {
    if (!advertiser.ad_funded_by) continue;
    funderMap.set(advertiser.ad_funded_by, [
      ...(funderMap.get(advertiser.ad_funded_by) ?? []),
      advertiser.advertiser_id,
    ]);
  }

  const result: NetworkResult = {
    advertisers: advertisers?.length ?? 0,
    sharedDomains: [...domainMap.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([domain, ids]) => ({ domain, advertiserIds: [...ids] })),
    sharedFunders: [...funderMap.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([funder, advertiserIds]) => ({ funder, advertiserIds })),
    repeatedOffers: [...offerCounts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([offer, count]) => ({ offer, count })),
    dominantFunnelTypes: [...funnelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([funnelType, count]) => ({ funnelType, count })),
  };

  await logActivity(client, {
    tenantId,
    verb: "ads.network_analyzed",
    subjectKind: "capability",
    summary: `Vendor network analysis over ${result.advertisers} advertisers: ${result.sharedDomains.length} shared destination domains, ${result.sharedFunders.length} shared funders.`,
    payload: { ...result } as never,
  });

  return result;
}
