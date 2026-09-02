import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { selfHostedFirecrawlRefusal, type SelfHostedFirecrawlCheck } from "./firecrawl-endpoint";

type Client = SupabaseClient<Database>;

/**
 * Refuses to scrape through the self-hosted Firecrawl when its last stored
 * probe failed. The chooser trusts presence; this reads the one thing that
 * validated the credential, the probe the operator ran on Connection health
 * (CODE-17).
 */
export async function assertSelfHostedFirecrawlUsable(
  client: Client,
  tenantId: string,
): Promise<void> {
  const { data, error } = await client
    .from("tenant_connections")
    .select("health, last_checked_at, config")
    .eq("tenant_id", tenantId)
    .eq("capability_key", "selfhosted_firecrawl")
    .maybeSingle();
  if (error) throw new Error(`Could not read the self-hosted Firecrawl check: ${error.message}`);
  const config = (data?.config ?? null) as Record<string, unknown> | null;
  const outcome = config?.["probe_outcome"];
  const check: SelfHostedFirecrawlCheck | null = data
    ? {
        health: data.health,
        lastCheckedAt: data.last_checked_at,
        probeOutcome: typeof outcome === "string" ? outcome : null,
      }
    : null;
  const refusal = selfHostedFirecrawlRefusal(check);
  if (refusal) throw new Error(refusal);
}
