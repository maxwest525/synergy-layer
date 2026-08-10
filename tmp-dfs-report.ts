import { createClient } from "@supabase/supabase-js";
const c = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const { data } = await c.from("dataforseo_snapshots").select("kind,payload").in("kind",["backlinks_summary","backlinks_referring_domains"]).order("created_at",{ascending:false}).limit(2);
for (const s of data ?? []) console.log(s.kind, JSON.stringify(s.payload).slice(0, 1400), "\n");
