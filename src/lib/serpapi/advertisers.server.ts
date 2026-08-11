import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "../os.server";
import { MAX_SEARCHES_PER_RUN, recordSerpApiSpend, serpApiSearch } from "./transport.server";

type Client = SupabaseClient<Database>;

const MODULE = "ads.advertiser_resolution";

type CreativeRow = {
  advertiser_id?: string;
  advertiser?: string;
  ad_creative_id?: string;
  target_domain?: string;
  format?: string;
};

export type ResolutionResult = {
  domainsSearched: number;
  candidatesFiled: number;
  advertisersConfirmed: number;
  ambiguousDomains: string[];
  unresolvedDomains: string[];
  credits: number;
};

function rootDomain(value: string): string {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/**
 * Domain to advertiser resolution. The provider does not disambiguate: a single
 * vendor domain can return creatives from several distinct advertiser IDs, so
 * every distinct ID is stored as a reviewable candidate. A domain resolves
 * automatically only when exactly one advertiser serves it; anything else is an
 * operator decision, filed to the Inbox.
 */
export async function resolveVendorAdvertisers(
  client: Client,
  tenantId: string,
  options: { runId?: string | null; limit?: number } = {},
): Promise<ResolutionResult> {
  const { data: watchlist } = await client
    .from("ad_vendor_watchlist")
    .select("id, domain, resolution_state")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .neq("resolution_state", "resolved")
    .order("domain")
    .limit(Math.min(options.limit ?? 20, MAX_SEARCHES_PER_RUN));

  const rows = watchlist ?? [];
  const result: ResolutionResult = {
    domainsSearched: 0,
    candidatesFiled: 0,
    advertisersConfirmed: 0,
    ambiguousDomains: [],
    unresolvedDomains: [],
    credits: 0,
  };

  for (const vendor of rows) {
    const domain = rootDomain(vendor.domain);
    const { data, credits, sourceUrl } = await serpApiSearch("google_ads_transparency_center", {
      text: domain,
      num: 40,
    });
    result.domainsSearched += 1;
    result.credits += credits;

    const creatives = ((data["ad_creatives"] as CreativeRow[] | undefined) ?? []).filter(
      (row) => typeof row.advertiser_id === "string",
    );

    const grouped = new Map<string, { name: string | null; creatives: number; domains: Set<string> }>();
    for (const row of creatives) {
      const id = row.advertiser_id as string;
      const entry = grouped.get(id) ?? { name: row.advertiser ?? null, creatives: 0, domains: new Set<string>() };
      entry.creatives += 1;
      if (row.target_domain) entry.domains.add(rootDomain(row.target_domain));
      grouped.set(id, entry);
    }

    if (grouped.size === 0) {
      result.unresolvedDomains.push(domain);
      await client
        .from("ad_vendor_watchlist")
        .update({ resolution_state: "no_advertiser_found" })
        .eq("id", vendor.id);
      continue;
    }

    const candidates = [...grouped.entries()].map(([advertiserId, entry]) => {
      // Confidence is evidence, not certainty: it rises when the advertiser
      // actually points ads at the vendor domain we searched for.
      const serves = entry.domains.has(domain);
      const confidence = serves ? Math.min(0.9, 0.6 + entry.creatives / 100) : 0.35;
      return { advertiserId, name: entry.name, creatives: entry.creatives, domains: [...entry.domains], serves, confidence };
    });

    for (const candidate of candidates) {
      const { error } = await client.from("ad_advertiser_candidates").upsert(
        {
          tenant_id: tenantId,
          query_text: domain,
          advertiser_id: candidate.advertiserId,
          advertiser_name: candidate.name,
          match_confidence: candidate.confidence,
          evidence: {
            creativesObserved: candidate.creatives,
            targetDomains: candidate.domains,
            servesQueriedDomain: candidate.serves,
          } as never,
          source_url: sourceUrl,
        },
        { onConflict: "tenant_id,query_text,advertiser_id", ignoreDuplicates: true },
      );
      if (!error) result.candidatesFiled += 1;
    }

    const unambiguous = candidates.filter((candidate) => candidate.serves);
    if (unambiguous.length === 1) {
      const chosen = unambiguous[0]!;
      await client.from("ad_advertisers").upsert(
        {
          tenant_id: tenantId,
          advertiser_id: chosen.advertiserId,
          advertiser_name: chosen.name,
          vendor_domain: domain,
          source_url: sourceUrl,
        },
        { onConflict: "tenant_id,advertiser_id" },
      );
      await client
        .from("ad_advertiser_candidates")
        .update({ review_state: "confirmed", reviewed_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("query_text", domain)
        .eq("advertiser_id", chosen.advertiserId);
      await client.from("ad_vendor_watchlist").update({ resolution_state: "resolved" }).eq("id", vendor.id);
      result.advertisersConfirmed += 1;
    } else {
      result.ambiguousDomains.push(domain);
      await client.from("ad_vendor_watchlist").update({ resolution_state: "ambiguous" }).eq("id", vendor.id);
    }
  }

  await recordSerpApiSpend(client, tenantId, {
    credits: result.credits,
    module: MODULE,
    note: `Advertiser resolution across ${result.domainsSearched} vendor domains.`,
    runId: options.runId ?? null,
  });

  if (result.ambiguousDomains.length > 0) {
    await fileInboxItem(client, {
      tenantId,
      lane: "approval",
      sourceModule: MODULE,
      title: `${result.ambiguousDomains.length} vendor domains need advertiser confirmation`,
      summary: `Several Google advertiser accounts serve ads for ${result.ambiguousDomains.join(", ")}. AOOS will not guess which account belongs to the vendor.`,
      priority: 2,
      subjectKind: "capability",
      actions: [{ kind: "open", label: "Review advertiser candidates", href: "/competitors" }],
    });
  }

  await logActivity(client, {
    tenantId,
    verb: "ads.advertisers_resolved",
    subjectKind: "capability",
    summary: `Advertiser resolution: ${result.advertisersConfirmed} confirmed, ${result.ambiguousDomains.length} ambiguous, ${result.unresolvedDomains.length} with no advertiser found.`,
    payload: { ...result, ambiguousDomains: result.ambiguousDomains, unresolvedDomains: result.unresolvedDomains },
  });

  return result;
}
