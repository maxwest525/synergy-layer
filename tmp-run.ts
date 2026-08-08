import { createClient } from "@supabase/supabase-js";
const c: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { definition } = await import("./src/registry/modules/research-operations");
const cap = definition.capabilities![0];
console.log("upsert", await c.from("capabilities").upsert({
  key: cap.key, name: cap.name, kind: cap.kind, category: cap.category, description: cap.description,
  integration_state: cap.integrationState, auth_kind: cap.authKind, operations: cap.operations, config: cap.config,
}, { onConflict: "key" }).select("key,integration_state"));
const { data: wf } = await c.from("workflows").select("id").eq("key", "wf.research_refresh").single();
const { runWorkflow } = await import("./src/lib/workflow-runner.server");
console.log("run", await runWorkflow(c, wf.id, "manual", null));
const { data: steps } = await c.from("workflow_steps").select("node_key,state,output,error").order("created_at", { ascending: false }).limit(3);
console.log(JSON.stringify(steps, null, 2));
