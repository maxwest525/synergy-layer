import { createClient } from "@supabase/supabase-js";
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { syncRegistryDefinitions } = await import("./src/registry/sync.server");
console.log("sync", await syncRegistryDefinitions(c as never));
const { data: wf } = await c.from("workflows").select("id,key").eq("key", "wf.research_refresh").single();
const { runWorkflow } = await import("./src/lib/workflow-runner.server");
console.log("run", await runWorkflow(c as never, wf!.id, "manual", null));
const { data: steps } = await c.from("workflow_steps").select("node_key,state,output,error").order("created_at", { ascending: false }).limit(6);
console.log(JSON.stringify(steps, null, 2));
