import { createClient } from "@supabase/supabase-js";
import { syncRegistryDefinitions } from "@/registry/sync.server";
import { runWorkflow } from "@/lib/workflow-runner.server";

const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const sync = await syncRegistryDefinitions(client as never);
console.log("sync", sync);
const { data: wf } = await client.from("workflows").select("id,key,graph").eq("key", "wf.seo_validation").single();
console.log("graph", JSON.stringify(wf!.graph));
const result = await runWorkflow(client as never, wf!.id, "manual:verify", null);
console.log("run", result);
const { data: steps } = await client.from("workflow_steps").select("node_key,state,output,error").eq("run_id", result.runId).order("sequence");
console.log(JSON.stringify(steps, null, 2));
