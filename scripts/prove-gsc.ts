import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { syncProperties, selectProperty } from "@/lib/search-console.server";
import { observeSearchConsole } from "@/lib/search-console-observe.server";
import { runWorkflow } from "@/lib/workflow-runner.server";

const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const props = await syncProperties(client);
console.log("PROPERTIES", props);

const target = props.find((p) => p.siteUrl.includes("trumove") && p.eligible);
if (!target) throw new Error("no trumove property");
await selectProperty(client, target.siteUrl, null, "8d29c99c-f91a-4060-8bae-6b76ef224e31");
console.log("SELECTED", target.siteUrl);

const first = await observeSearchConsole(client);
console.log("RUN1", JSON.stringify(first));
const c1 = await client.from("search_console_snapshots").select("id", { count: "exact", head: true });
console.log("SNAPSHOTS_AFTER_RUN1", c1.count);

const second = await observeSearchConsole(client);
console.log("RUN2", JSON.stringify(second));
const c2 = await client.from("search_console_snapshots").select("id", { count: "exact", head: true });
console.log("SNAPSHOTS_AFTER_RUN2", c2.count);

const wf = await runWorkflow(client, "90cda469-016d-4d73-955f-b27cbf5c6135", "schedule:gsc-daily-observe", null);
console.log("WORKFLOW", JSON.stringify(wf));
const c3 = await client.from("search_console_snapshots").select("id", { count: "exact", head: true });
console.log("SNAPSHOTS_AFTER_WORKFLOW", c3.count);
