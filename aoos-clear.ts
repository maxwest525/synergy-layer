import { createClient } from "@supabase/supabase-js";
import { resolveItem } from "./src/lib/os-admin.server";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const uid = "f5bc135a-b595-421e-96b5-5955767e286d";
const { data } = await db.from("inbox_items").select("id,title")
  .eq("title","Search Console Daily Observation failed").is("resolved_at", null);
for (const item of data ?? []) { await resolveItem(db as never, item.id, uid); console.log("cleared:", item.title); }
