import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runWorkflow } from "@/lib/workflow-runner.server";
for (const key of ["dfs-competitor-derive", "wf.seo_validation", "dfs-serp-observe"]) {
  const { data: wf } = await supabaseAdmin.from("workflows").select("id").eq("key", key).maybeSingle();
  if (!wf) { console.log(key, "MISSING"); continue; }
  try {
    const r = await runWorkflow(supabaseAdmin, wf.id, "operator_manual", null);
    const { data: steps } = await supabaseAdmin.from("workflow_steps").select("node_key,state,output,error").eq("run_id", r.runId).order("sequence");
    console.log(key, r.state, JSON.stringify(steps));
  } catch (e) { console.log(key, "ERROR", (e as Error).message); }
}
