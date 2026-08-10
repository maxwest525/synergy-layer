import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { collectReadySerpTasks } from "@/lib/dataforseo/serp.server";

const tenant = (await supabaseAdmin.from("dataforseo_serp_tasks").select("tenant_id").eq("state","queued").limit(1).maybeSingle()).data!.tenant_id;
const res = await collectReadySerpTasks(supabaseAdmin, tenant);
console.log(JSON.stringify({ tenant, ...res }));
