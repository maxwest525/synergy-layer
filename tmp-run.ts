import { createClient } from "@supabase/supabase-js";
const c: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: wf } = await c.from("workflows").select("id").eq("key", "wf.research_refresh").single();
const { runWorkflow } = await import("./src/lib/workflow-runner.server");
console.log("rerun", await runWorkflow(c, wf.id, "manual", null));
const { data: steps } = await c.from("workflow_steps").select("output").eq("node_key","collect").order("created_at",{ascending:false}).limit(1);
console.log(JSON.stringify(steps));
const { data: inbox } = await c.from("inbox_items").select("id,title,lane,resolved_at").eq("lane","needs_attention");
console.log(inbox);
