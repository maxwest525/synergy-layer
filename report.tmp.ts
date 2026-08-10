import { createClient } from "@supabase/supabase-js";
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: cands } = await c.from("competitor_candidates").select("domain,domain_class,review_state,metrics");
const sl = (cands??[]).filter(r=>(r.metrics as any)?.intelligence_pass?.shortlisted);
for (const r of sl) { const p=(r.metrics as any).intelligence_pass; const pe=(r.metrics as any).page_evidence;
console.log(r.domain, "| share", p.serp_share, "| median", p.median_position, "| outranks", (p.outranks_owned||[]).length, "| conf", p.confidence, "| page", pe?.pageType, pe?.intentMatch, pe?.wordCount, "| reason:", p.shortlist_reason); }
const { data: obs } = await c.from("search_console_observations").select("rule,issue_fingerprint").order("created_at",{ascending:false}).limit(20);
console.log("observations", obs);
const { data: recs } = await c.from("recommendations").select("title,state,source_module").order("created_at",{ascending:false}).limit(8);
console.log("recs", recs);
const { data: bud } = await c.from("dataforseo_budgets").select("spent_usd,ceiling_usd");
console.log("budget", bud);
const { data: inbox } = await c.from("inbox_items").select("title,lane,resolved_at").is("resolved_at",null);
console.log("inbox", inbox);
const { data: ke } = await c.from("knowledge_entries").select("title").order("created_at",{ascending:false}).limit(10);
console.log("knowledge", ke);
