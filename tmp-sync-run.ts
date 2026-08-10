import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { syncRegistryDefinitions } from "@/registry/sync.server";
import { suggestKeywords } from "@/lib/dataforseo/keywords.server";

const c = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const sync = await syncRegistryDefinitions(c);
console.log("sync", JSON.stringify(sync));

const { data: tenant } = await c.from("tenants").select("id").limit(1).single();
try {
  const r = await suggestKeywords(c, tenant!.id, "trumoveinc.com", { key: "dfs-keyword-discovery" });
  console.log("keywords", JSON.stringify(r, null, 1));
} catch (e) {
  console.log("keyword_error", String(e));
}
