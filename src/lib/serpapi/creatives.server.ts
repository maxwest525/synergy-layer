import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "../os.server";
import { MAX_SEARCHES_PER_RUN, checksum, recordSerpApiSpend, serpApiSearch } from "./transport.server";

type Client = SupabaseClient<Database>;

const MODULE = "ads.creative_intelligence";

type ListRow = {
  advertiser_id?: string;
  advertiser?: string;
  ad_creative_id?: string;
  format?: string;
  link?: string;
  target_domain?: string;
  image?: string;
  video_link?: string;
  first_shown?: number;
  last_shown?: number;
  total_days_shown?: number;
  details_link?: string;
};

type DetailCreative = {
  headline?: string;
  long_headline?: string;
  title?: string;
  snippet?: string;
  call_to_action?: string;
  sitelink_texts?: string[];
  sitelink_descriptions?: string[];
  image?: string;
  video_link?: string;
  link?: string;
  is_verified?: boolean;
};

export type CreativeIngestResult = {
  advertisers: number;
  creativesSeen: number;
  creativesNew: number;
  creativesUpdated: number;
  creativesRetired: number;
  detailFetches: number;
  familiesTouched: number;
  familiesNew: number;
  credits: number;
};

function epochToIso(value: number | undefined): string | null {
  if (!value || Number.isNaN(value)) return null;
  return new Date(value * 1000).toISOString();
}

const STOPWORDS = new Set(["the", "a", "an", "your", "you", "our", "for", "and", "to", "with", "of", "in", "on", "get", "now"]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Creative family key. Twenty copy tweaks of one concept must not read as
 * twenty strategies, so the key is built from the stable signal in a creative:
 * its destination, its format, and the strongest tokens of its message.
 */
function familyKey(input: { targetDomain: string | null; format: string | null; text: string }): string {
  const core = [...new Set(tokens(input.text))].sort().slice(0, 6).join("-");
  return [input.targetDomain ?? "unknown", input.format ?? "unknown", core || "no-copy"].join("|");
}

const PROMISE_PATTERNS: [string, RegExp][] = [
  ["price_certainty", /\b(guaranteed|binding|no hidden|flat rate|fixed price|upfront)\b/i],
  ["speed", /\b(fast|same day|next day|instant|quick|today)\b/i],
  ["savings", /\b(save|cheap|affordable|discount|% off|low cost|budget)\b/i],
  ["choice", /\b(compare|quotes?|multiple movers|top movers|match)\b/i],
  ["reassurance", /\b(licensed|insured|bonded|verified|trusted|dot #?\d*)\b/i],
];

const FUNNEL_PATTERNS: [string, RegExp][] = [
  ["call_now", /\b(call|phone|speak|talk now|dial)\b/i],
  ["quote_form", /\b(quote|estimate|get started|free quote|request)\b/i],
  ["marketplace", /\b(compare|matching|top 5|best movers|reviews)\b/i],
];

/**
 * Normalizes creative copy into evidence fields. Every field is derived from
 * text the advertiser published. Nothing here infers spend, clicks, or results.
 */
export function normalizeMessaging(input: {
  headline: string | null;
  longHeadline: string | null;
  snippet: string | null;
  callToAction: string | null;
  targetDomain: string | null;
  advertiserName: string | null;
}): Record<string, unknown> {
  const text = [input.headline, input.longHeadline, input.snippet, input.callToAction]
    .filter(Boolean)
    .join(" ");
  const promises = PROMISE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const funnel = FUNNEL_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "unclassified";
  const brandTerms = (input.advertiserName ?? "").toLowerCase().split(/\s+/).filter((term) => term.length > 3);
  const brandPositioned = brandTerms.some((term) => text.toLowerCase().includes(term));

  return {
    mainSubject: input.headline ?? input.longHeadline ?? null,
    consumerProblem: /\b(moving|move|relocat|storage|pack)\b/i.test(text) ? "relocation" : null,
    promise: promises,
    offer: /\b(free|no obligation|\$\d+|% off)\b/i.test(text) ? text.match(/\b(free[^.,!]*|\$\d[^.,!]*|\d+% off)/i)?.[0]?.trim() ?? null : null,
    audience: /\b(long distance|interstate|cross country|local|commercial|office)\b/i.exec(text)?.[0]?.toLowerCase() ?? null,
    trustMechanism: /\b(licensed|insured|bbb|reviews?|rated|verified|years)\b/i.exec(text)?.[0]?.toLowerCase() ?? null,
    urgency: /\b(today|now|limited|book now|hurry|last minute)\b/i.test(text),
    differentiator: promises[0] ?? null,
    cta: input.callToAction ?? null,
    positioning: brandPositioned ? "brand" : "generic",
    funnelType: funnel,
    evidenceLabel: "observed",
  };
}

/**
 * Ingests creatives for every confirmed advertiser. Snapshots are immutable in
 * substance: an unchanged creative only has its last-detected stamp moved, and
 * detail is fetched once per unseen creative ID so credits are not re-spent.
 */
export async function ingestAdvertiserCreatives(
  client: Client,
  tenantId: string,
  options: { runId?: string | null; maxSearches?: number } = {},
): Promise<CreativeIngestResult> {
  const budget = Math.min(options.maxSearches ?? MAX_SEARCHES_PER_RUN, MAX_SEARCHES_PER_RUN);
  const result: CreativeIngestResult = {
    advertisers: 0,
    creativesSeen: 0,
    creativesNew: 0,
    creativesUpdated: 0,
    creativesRetired: 0,
    detailFetches: 0,
    familiesTouched: 0,
    familiesNew: 0,
    credits: 0,
  };

  const { data: advertisers } = await client
    .from("ad_advertisers")
    .select("id, advertiser_id, advertiser_name, vendor_domain")
    .eq("tenant_id", tenantId);

  const now = new Date().toISOString();

  for (const advertiser of advertisers ?? []) {
    if (result.credits >= budget) break;
    result.advertisers += 1;

    const seenIds: string[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 3; page += 1) {
      if (result.credits >= budget) break;
      const { data, credits, sourceUrl } = await serpApiSearch("google_ads_transparency_center", {
        advertiser_id: advertiser.advertiser_id,
        num: 40,
        next_page_token: pageToken,
      });
      result.credits += credits;

      const rows = (data["ad_creatives"] as ListRow[] | undefined) ?? [];
      for (const row of rows) {
        const creativeId = row.ad_creative_id;
        if (!creativeId) continue;
        seenIds.push(creativeId);
        result.creativesSeen += 1;

        const { data: existing } = await client
          .from("ad_creatives")
          .select("id, content_checksum")
          .eq("tenant_id", tenantId)
          .eq("ad_creative_id", creativeId)
          .maybeSingle();

        if (existing) {
          await client
            .from("ad_creatives")
            .update({ last_detected_at: now, last_shown: epochToIso(row.last_shown), retired_at: null })
            .eq("id", existing.id);
          result.creativesUpdated += 1;
          continue;
        }

        // Detail is only worth a credit for a creative we have never stored.
        let detail: DetailCreative = {};
        let detailSource: string | null = null;
        if (result.credits < budget) {
          try {
            const response = await serpApiSearch("google_ads_transparency_center_ad_details", {
              advertiser_id: advertiser.advertiser_id,
              creative_id: creativeId,
            });
            result.credits += response.credits;
            result.detailFetches += 1;
            detail = ((response.data["ad_creatives"] as DetailCreative[] | undefined) ?? [])[0] ?? {};
            detailSource = response.sourceUrl;
          } catch {
            detail = {};
          }
        }

        const headline = detail.headline ?? detail.title ?? null;
        const messaging = normalizeMessaging({
          headline,
          longHeadline: detail.long_headline ?? null,
          snippet: detail.snippet ?? null,
          callToAction: detail.call_to_action ?? null,
          targetDomain: row.target_domain ?? null,
          advertiserName: advertiser.advertiser_name,
        });
        const family = familyKey({
          targetDomain: row.target_domain ?? null,
          format: row.format ?? null,
          text: [headline, detail.long_headline, detail.snippet, detail.call_to_action].filter(Boolean).join(" "),
        });

        const { error } = await client.from("ad_creatives").insert({
          tenant_id: tenantId,
          advertiser_fk: advertiser.id,
          ad_creative_id: creativeId,
          format: row.format ?? null,
          target_domain: row.target_domain ?? null,
          link: detail.link ?? row.link ?? null,
          headline,
          long_headline: detail.long_headline ?? null,
          snippet: detail.snippet ?? null,
          call_to_action: detail.call_to_action ?? null,
          sitelinks: ((detail.sitelink_texts ?? []).map((title, index) => ({
            title,
            description: detail.sitelink_descriptions?.[index] ?? null,
          })) ?? []) as never,
          image_ref: detail.image ?? row.image ?? null,
          video_ref: detail.video_link ?? row.video_link ?? null,
          content_checksum: checksum([headline, detail.long_headline, detail.snippet, detail.call_to_action, row.target_domain]),
          first_shown: epochToIso(row.first_shown),
          last_shown: epochToIso(row.last_shown),
          total_days_shown: row.total_days_shown ?? null,
          messaging: messaging as never,
          family_key: family,
          raw_payload: { list: row, detail } as never,
          source_url: detailSource ?? sourceUrl,
        });
        if (!error) result.creativesNew += 1;
      }

      pageToken = (data.serpapi_pagination?.next_page_token as string | undefined) ?? undefined;
      if (!pageToken) break;
    }

    // A creative that stopped appearing is retired, never deleted.
    if (seenIds.length > 0) {
      const { data: retired } = await client
        .from("ad_creatives")
        .update({ retired_at: now })
        .eq("tenant_id", tenantId)
        .eq("advertiser_fk", advertiser.id)
        .is("retired_at", null)
        .not("ad_creative_id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`)
        .select("id");
      result.creativesRetired += retired?.length ?? 0;
    }
  }

  const families = await rebuildCreativeFamilies(client, tenantId);
  result.familiesTouched = families.touched;
  result.familiesNew = families.created;

  await recordSerpApiSpend(client, tenantId, {
    credits: result.credits,
    module: MODULE,
    note: `Creative ingestion for ${result.advertisers} advertisers.`,
    runId: options.runId ?? null,
  });

  await logActivity(client, {
    tenantId,
    verb: "ads.creatives_ingested",
    subjectKind: "capability",
    summary: `Creative ingestion: ${result.creativesNew} new, ${result.creativesUpdated} still running, ${result.creativesRetired} retired, ${result.familiesNew} new creative families.`,
    payload: { ...result },
  });

  if (result.familiesNew > 0 || result.creativesRetired > 0) {
    await fileInboxItem(client, {
      tenantId,
      lane: "fyi",
      sourceModule: MODULE,
      title: `Vendor ad activity changed: ${result.familiesNew} new creative families, ${result.creativesRetired} retired`,
      summary:
        "Material change in observed vendor advertising. Transparency evidence shows what ran, never how it performed.",
      priority: 3,
      subjectKind: "capability",
    });
  }

  return result;
}

/** Rebuilds creative families from stored creatives. No provider calls, no cost. */
export async function rebuildCreativeFamilies(
  client: Client,
  tenantId: string,
): Promise<{ touched: number; created: number }> {
  const { data: creatives } = await client
    .from("ad_creatives")
    .select("id, ad_creative_id, family_key, advertiser_fk, retired_at, first_detected_at")
    .eq("tenant_id", tenantId);

  const groups = new Map<string, { advertiser: string; ids: string[]; representative: string }>();
  for (const creative of creatives ?? []) {
    const key = creative.family_key ?? "unassigned";
    const entry = groups.get(key) ?? { advertiser: creative.advertiser_fk, ids: [], representative: creative.id };
    entry.ids.push(creative.ad_creative_id);
    groups.set(key, entry);
  }

  let created = 0;
  const now = new Date().toISOString();
  for (const [key, entry] of groups) {
    const { data: existing } = await client
      .from("ad_creative_families")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("family_key", key)
      .maybeSingle();

    if (existing) {
      await client
        .from("ad_creative_families")
        .update({ member_creative_ids: entry.ids, member_count: entry.ids.length, last_detected_at: now })
        .eq("id", existing.id);
      continue;
    }

    const { error } = await client.from("ad_creative_families").insert({
      tenant_id: tenantId,
      advertiser_fk: entry.advertiser,
      family_key: key,
      representative_creative_fk: entry.representative,
      member_creative_ids: entry.ids,
      member_count: entry.ids.length,
    });
    if (!error) created += 1;
  }

  return { touched: groups.size, created };
}
