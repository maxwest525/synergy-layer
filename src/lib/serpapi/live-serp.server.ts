import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";
import { MAX_SEARCHES_PER_RUN, fingerprint, recordSerpApiSpend, serpApiSearch } from "./transport.server";

type Client = SupabaseClient<Database>;

const MODULE = "ads.live_serp_observation";

type AdRow = {
  position?: number;
  block_position?: string;
  title?: string;
  link?: string;
  displayed_link?: string;
  description?: string;
  source?: string;
  sitelinks?: unknown[];
};

export type LiveSerpResult = {
  keywords: number;
  observed: number;
  skipped: number;
  adsSeen: number;
  advertisersSeen: string[];
  credits: number;
};

/**
 * Live paid SERP corroboration for the operator-approved keyword set. This is a
 * point-in-time observation of which advertisers occupy the ads block: it is a
 * separate evidence type from Transparency history and is never merged with it.
 */
export async function observeLivePaidSerps(
  client: Client,
  tenantId: string,
  options: { runId?: string | null; location?: string; device?: string; limit?: number } = {},
): Promise<LiveSerpResult> {
  const { data: tracked } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("keyword")
    .limit(Math.min(options.limit ?? 25, MAX_SEARCHES_PER_RUN));

  const keywords = (tracked ?? []).map((row) => row.keyword);
  const device = options.device ?? "desktop";
  const location = options.location ?? "United States";
  const result: LiveSerpResult = {
    keywords: keywords.length,
    observed: 0,
    skipped: 0,
    adsSeen: 0,
    advertisersSeen: [],
    credits: 0,
  };

  if (keywords.length === 0) return result;

  const advertisers = new Set<string>();
  const reportingDate = new Date().toISOString().slice(0, 10);

  for (const keyword of keywords) {
    const params = { q: keyword, location, device, gl: "us", hl: "en" };
    const fp = fingerprint("google", { ...params, reportingDate });

    const { data: existing } = await client
      .from("ad_live_serp_observations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("request_fingerprint", fp)
      .maybeSingle();
    if (existing) {
      result.skipped += 1;
      continue;
    }

    const { data, credits, sourceUrl } = await serpApiSearch("google", params);
    result.credits += credits;

    const ads = (data["ads"] as AdRow[] | undefined) ?? [];
    for (const ad of ads) {
      if (ad.displayed_link) advertisers.add(ad.displayed_link.replace(/^https?:\/\//, "").split("/")[0] ?? "");
      else if (ad.source) advertisers.add(ad.source);
    }
    result.adsSeen += ads.length;

    await client.from("ad_live_serp_observations").insert({
      tenant_id: tenantId,
      keyword,
      location,
      device,
      ad_count: ads.length,
      ads_payload: ads as never,
      request_fingerprint: fp,
      source_url: sourceUrl,
    });
    result.observed += 1;
  }

  result.advertisersSeen = [...advertisers].filter(Boolean).sort();

  await recordSerpApiSpend(client, tenantId, {
    credits: result.credits,
    module: MODULE,
    note: `Live paid SERP sweep over ${result.observed} approved keywords.`,
    runId: options.runId ?? null,
  });

  await logActivity(client, {
    tenantId,
    verb: "ads.live_serp_observed",
    subjectKind: "capability",
    summary: `Live paid SERP: ${result.adsSeen} ads across ${result.observed} approved keywords, ${result.advertisersSeen.length} distinct displayed domains.`,
    payload: { ...result },
  });

  return result;
}
