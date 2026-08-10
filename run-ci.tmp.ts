import { createClient } from "@supabase/supabase-js";
const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { syncRegistryDefinitions } = await import("/dev-server/src/registry/sync.server.ts");
console.log("sync", JSON.stringify(await syncRegistryDefinitions(client as never)));
const { runWorkflow } = await import("/dev-server/src/lib/workflow-runner.server.ts");
const { data: wf } = await client.from("workflows").select("id").eq("key", "dfs-competitor-intelligence").maybeSingle();
console.log("workflow", wf?.id);
const res = await runWorkflow(client as never, wf!.id, "operator-script", null);
console.log("run", JSON.stringify(res));
const { data: steps } = await client.from("workflow_steps").select("node_key,state,output,error").eq("run_id", res.runId).order("sequence");
console.log(JSON.stringify(steps, null, 2).slice(0, 6000));
