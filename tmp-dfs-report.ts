import { createClient } from "@supabase/supabase-js";
const c = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const { data: reqs } = await c.from("dataforseo_requests").select("endpoint, cost_usd, created_at").order("created_at", { ascending: false }).limit(10);
console.log("ledger", JSON.stringify(reqs, null, 1));
const { data: bl } = await c.from("dataforseo_snapshots").select("payload").eq("kind", "backlinks_summary").order("created_at", { ascending: false }).limit(1);
const t = (bl?.[0]?.payload as any)?.totals ?? {};
console.log("backlinks", JSON.stringify({ rank: t.rank, backlinks: t.backlinks, referring_domains: t.referring_domains, referring_main_domains: t.referring_main_domains, spam: t.backlinks_spam_score, dofollow: t.referring_links_types }, null, 1));
const { data: comp } = await c.from("competitor_candidates").select("domain, metrics").order("domain").limit(8);
console.log("competitors", (comp ?? []).map((x:any)=>`${x.domain} (avg pos ${x.metrics?.avg_position ?? "-"} , inter ${x.metrics?.intersections ?? "-"})`).join("\n"));
