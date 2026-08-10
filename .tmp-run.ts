import { createClient } from "@supabase/supabase-js";
import type { Database } from "./src/integrations/supabase/types";

const client = createClient<Database>(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false } },
);

const TENANT = "c94a41b3-08d0-4a6d-88f8-0dcb1eb4e2e6";
const TARGET = "trumoveinc.com";
const SEEDS = ["long distance movers", "interstate moving company", "long distance moving company"];

const out: Record<string, unknown> = {};

// 1. Registry sync so capabilities and workflows are visible in AOOS.
const { syncRegistryDefinitions } = await import("./src/registry/sync.server");
out["registrySync"] = await syncRegistryDefinitions(client);

// 2. Record the operator-approved seed concepts on the tenant.
const { data: tenant } = await client.from("tenants").select("metadata").eq("id", TENANT).single();
await client
  .from("tenants")
  .update({
    metadata: {
      ...((tenant?.metadata as Record<string, unknown>) ?? {}),
      keyword_seeds: SEEDS,
      keyword_seeds_approved_at: new Date().toISOString(),
      keyword_seeds_note:
        "National service-intent seeds. Deliberately not city-specific so the first competitor universe is not biased to one market.",
    } as never,
  })
  .eq("id", TENANT);

// 3. Retire the junk candidate set from the pre-approval discovery logic.
const { data: retired } = await client
  .from("keyword_candidates")
  .update({ review_state: "rejected", reviewed_at: new Date().toISOString() })
  .eq("tenant_id", TENANT)
  .eq("review_state", "pending")
  .select("id");
out["retiredCandidates"] = (retired ?? []).length;

await client
  .from("inbox_items")
  .update({ resolved_at: new Date().toISOString() })
  .eq("tenant_id", TENANT)
  .is("resolved_at", null)
  .in("title", ["40 keyword candidates need approval"]);

// 4. Keyword discovery on the approved seeds.
try {
  const { suggestKeywords } = await import("./src/lib/dataforseo/keywords.server");
  out["keywords"] = await suggestKeywords(client, TENANT, TARGET, { key: "dfs-keyword-discovery" }, SEEDS);
} catch (error) {
  out["keywords"] = { error: String(error) };
}

// 5. Full owned backlink evidence pass.
try {
  const { collectBacklinkEvidence } = await import("./src/lib/dataforseo/backlink-evidence.server");
  const evidence = await collectBacklinkEvidence(client, TENANT, TARGET, { key: "dfs-backlink-baseline" });
  out["backlinks"] = {
    costUsd: evidence.costUsd,
    missingFactors: evidence.missingFactors,
    health: evidence.health,
    profile: (evidence.normalized as Record<string, unknown>)["profile"],
    anchors: (evidence.normalized as Record<string, unknown>)["anchors"],
    quality: (evidence.normalized as Record<string, unknown>)["referringDomainQuality"],
    follow: (evidence.normalized as Record<string, unknown>)["followSplit"],
    pages: (evidence.normalized as Record<string, unknown>)["topLinkedPages"],
    geography: (evidence.normalized as Record<string, unknown>)["geography"],
    history: (evidence.normalized as { history: { months: number } }).history.months,
  };
} catch (error) {
  out["backlinks"] = { error: String(error) };
}

// 6. Competitor derivation from whatever SERP evidence exists (free).
try {
  const { deriveCompetitorsFromSerp } = await import("./src/lib/dataforseo/competitors.server");
  out["competitors"] = await deriveCompetitorsFromSerp(client, TENANT, TARGET);
} catch (error) {
  out["competitors"] = { error: String(error) };
}

const { getBudget } = await import("./src/lib/dataforseo/budget.server");
out["budget"] = await getBudget(client, TENANT);

console.log(JSON.stringify(out, null, 2));
