import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runWorkflow } from "@/lib/workflow-runner.server";

const client = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const keys = ["dfs-backlink-baseline", "dfs-competitor-derive", "gsc-daily-observe", "wf.seo_validation"];
for (const key of keys) {
  const { data: wf } = await client.from("workflows").select("id").eq("key", key).single();
  try {
    const result = await runWorkflow(client, wf!.id, "operator:cli", null);
    const { data: steps } = await client.from("workflow_steps").select("node_key,state,error").eq("run_id", result.runId).order("sequence");
    console.log(key, result.state, JSON.stringify(steps));
  } catch (e) { console.log(key, "THREW", String(e)); }
}
