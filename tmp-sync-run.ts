import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { suggestKeywords } from "@/lib/dataforseo/keywords.server";

const c = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const { data: tenant } = await c.from("tenants").select("id").limit(1).single();
try {
  console.log("keywords", JSON.stringify(await suggestKeywords(c, tenant!.id, "trumoveinc.com", { key: "dfs-keyword-discovery" }), null, 1));
} catch (e) { console.log("keyword_error", String(e)); }
const { data: top } = await c.from("keyword_candidates").select("keyword, source, metrics").eq("review_state","pending").limit(200);
const rows = (top ?? []).map((r:any)=>({k:r.keyword,v:r.metrics?.search_volume ?? 0,s:r.source})).sort((a,b)=>b.v-a.v);
console.log("total_pending", rows.length);
console.log(rows.slice(0,25).map(r=>`${String(r.v).padStart(6)}  ${r.k}   [${r.s.replace("labs.","")}]`).join("\n"));
