import { createClient } from "@supabase/supabase-js";
import { definition } from "@/registry/modules/search-console";
import { runWorkflow } from "@/lib/workflow-runner.server";

const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

for (const c of definition.capabilities ?? []) {
  const { error } = await client.from("capabilities").upsert({
    key: c.key, name: c.name, kind: c.kind, category: c.category ?? null,
    description: c.description ?? null, integration_state: c.integrationState,
    auth_kind: c.authKind ?? null, operations: (c.operations ?? []) as never, config: (c.config ?? {}) as never,
  }, { onConflict: "key" });
  if (error) throw error;
}
for (const w of definition.workflows ?? []) {
  const { error } = await client.from("workflows").upsert({
    key: w.key, name: w.name, description: w.description ?? null, trigger_kind: w.triggerKind, graph: w.graph as never,
  }, { onConflict: "key" });
  if (error) throw error;
}

const { data: wf } = await client.from("workflows").select("id,key,graph").eq("key", "wf.seo_validation").single();
console.log("graph", JSON.stringify(wf!.graph));
const result = await runWorkflow(client as never, wf!.id, "manual:verify", null);
console.log("run", result);
const { data: steps } = await client.from("workflow_steps").select("node_key,state,output,error").eq("run_id", result.runId).order("sequence");
console.log(JSON.stringify(steps, null, 2));
