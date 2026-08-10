import { createClient } from "@supabase/supabase-js";
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: runs } = await c.from("workflow_runs").select("id,state,created_at").order("created_at",{ascending:false}).limit(3);
console.log(runs);
const { data: steps } = await c.from("workflow_steps").select("node_key,state,error").eq("run_id", runs![0].id).order("sequence");
console.log(steps);
