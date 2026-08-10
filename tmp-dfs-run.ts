/* Temporary one-off ingestion runner. Deleted after use. */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { discoverCompetitors } from "@/lib/dataforseo/labs.server";
import { collectBacklinkSummary, collectReferringDomains } from "@/lib/dataforseo/backlinks.server";
import { queueSerpTasks } from "@/lib/dataforseo/serp.server";

const client = createClient<Database>(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false } },
);

async function main(): Promise<void> {
  const { data: tenant } = await client.from("tenants").select("id, slug").limit(1).single();
  const tenantId = tenant!.id;
  const { data: prop } = await client
    .from("search_console_properties")
    .select("property_url")
    .eq("selected", true)
    .maybeSingle();
  const raw = prop?.property_url ?? "sc-domain:trumoveinc.com";
  const target = raw.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const out: Record<string, unknown> = { tenant: tenant!.slug, target };

  try {
    out["labs"] = await discoverCompetitors(client, tenantId, target, { key: "dfs-competitor-discovery" });
  } catch (e) {
    out["labs_error"] = String(e);
  }

  try {
    const summary = await collectBacklinkSummary(client, tenantId, target, { key: "dfs-backlink-baseline" });
    const domains = await collectReferringDomains(client, tenantId, target, { key: "dfs-backlink-baseline" });
    out["backlinks"] = {
      summarySnapshot: summary.snapshotId,
      summaryCost: summary.costUsd,
      referringDomains: domains.rows,
      domainsCost: domains.costUsd,
    };
  } catch (e) {
    out["backlinks_error"] = String(e);
  }

  try {
    const { data: snaps } = await client
      .from("search_console_snapshots")
      .select("payload")
      .eq("kind", "query")
      .order("reporting_date", { ascending: false })
      .limit(1);
    const rows = ((snaps?.[0]?.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? []);
    const keywords = rows
      .map((r) => String((r["keys"] as string[] | undefined)?.[0] ?? r["query"] ?? ""))
      .filter(Boolean)
      .slice(0, 5);
    const fallback = keywords.length ? keywords : ["movers " + target];
    out["serp"] = await queueSerpTasks(
      client,
      tenantId,
      fallback,
      "https://id-preview--4aa4b3cf-b3ab-4721-aff6-e0d55ce13276.lovable.app",
      { key: "dfs-serp-observe" },
    );
    out["serp_keywords"] = fallback;
  } catch (e) {
    out["serp_error"] = String(e);
  }

  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

void main();
