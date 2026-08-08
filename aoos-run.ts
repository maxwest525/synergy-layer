import { createClient } from "@supabase/supabase-js";
import { runWorkflow } from "./src/lib/workflow-runner.server";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const key = process.argv[2]!;
const { data: wf } = await db.from("workflows").select("id,name").eq("key", key).single();
const res = await runWorkflow(db as never, wf!.id, "manual:agent-run", null);
console.log(wf!.name, JSON.stringify(res));
const { data: steps } = await db
  .from("workflow_steps").select("node_key,state,error,duration_ms,output")
  .eq("run_id", res.runId).order("sequence");
console.log(JSON.stringify(steps, null, 2).slice(0, 3000));
