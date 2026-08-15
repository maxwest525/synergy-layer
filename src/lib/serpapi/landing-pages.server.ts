import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "../os.server";
import { scrapeFirecrawl } from "../web-research.server";

type Client = SupabaseClient<Database>;

const MODULE = "ads.landing_page_intelligence";

export type LandingPageResult = {
  destinations: number;
  observed: number;
  unchanged: number;
  failed: number;
};

/**
 * Observation only. AOOS records what the funnel does, never the vendor's copy:
 * markdown is hashed for change detection and discarded, and only structural
 * facts are stored.
 */
function observe(markdown: string, title: string): Record<string, unknown> {
  const text = markdown.toLowerCase();
  const formFields = (markdown.match(/\n\s*(input|select|textarea|\[.*?\]\(#\))/gi) ?? []).length;
  return {
    title,
    heading: markdown.match(/^#\s+(.+)$/m)?.[1]?.slice(0, 160) ?? null,
    hasPhone: /\b(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/.test(markdown),
    hasForm: /\b(get (a )?quote|submit|continue|next step|zip code)\b/.test(text),
    quoteWizard: /\b(step \d|of \d steps|progress)\b/.test(text),
    observableFormFields: formFields,
    trustSignals: ["bbb", "licensed", "insured", "usdot", "reviews", "rated", "guarantee"].filter(
      (signal) => text.includes(signal),
    ),
    brokerDisclosure: /\b(broker|not a (moving )?carrier|third[- ]party|partner network)\b/.test(
      text,
    ),
    urgency: /\b(today|limited|book now|act now|last minute)\b/.test(text),
    offerLanguage: /\b(free|no obligation|save up to|% off)\b/.test(text),
    intent: /\b(long distance|interstate|cross country)\b/.test(text) ? "long_distance" : "general",
    evidenceLabel: "observed",
    contentStored: false,
  };
}

/** Follows every unique creative destination once and stores funnel observations. */
export async function observeAdDestinations(
  client: Client,
  tenantId: string,
  options: { limit?: number } = {},
): Promise<LandingPageResult> {
  const { data: creatives } = await client
    .from("ad_creatives")
    .select("id, link, target_domain")
    .eq("tenant_id", tenantId)
    .is("retired_at", null)
    .not("link", "is", null)
    .limit(200);

  const unique = new Map<string, string>();
  for (const creative of creatives ?? []) {
    const url = creative.link;
    if (!url) continue;
    if (!unique.has(url)) unique.set(url, creative.id);
  }

  const targets = [...unique.entries()].slice(0, options.limit ?? 15);
  const result: LandingPageResult = {
    destinations: targets.length,
    observed: 0,
    unchanged: 0,
    failed: 0,
  };

  for (const [url, creativeId] of targets) {
    let page: { title: string; markdown: string } | null = null;
    try {
      page = await scrapeFirecrawl(url);
    } catch {
      page = null;
    }

    if (!page) {
      await client.from("ad_destination_pages").upsert(
        {
          tenant_id: tenantId,
          creative_fk: creativeId,
          url,
          dom_hash: "unreadable",
          fetch_error: "Destination could not be read.",
          observations: { evidenceLabel: "unavailable" } as never,
        },
        { onConflict: "tenant_id,url,dom_hash", ignoreDuplicates: true },
      );
      result.failed += 1;
      continue;
    }

    const domHash = createHash("sha256").update(page.markdown).digest("hex");
    const { data: existing } = await client
      .from("ad_destination_pages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("url", url)
      .eq("dom_hash", domHash)
      .maybeSingle();

    if (existing) {
      result.unchanged += 1;
      continue;
    }

    await client.from("ad_destination_pages").insert({
      tenant_id: tenantId,
      creative_fk: creativeId,
      url,
      final_url: url,
      dom_hash: domHash,
      observations: observe(page.markdown, page.title) as never,
    });
    result.observed += 1;
  }

  await logActivity(client, {
    tenantId,
    verb: "ads.destinations_observed",
    subjectKind: "capability",
    summary: `Destination observation: ${result.observed} new page states, ${result.unchanged} unchanged, ${result.failed} unreadable.`,
    payload: { ...result, module: MODULE },
  });

  return result;
}
