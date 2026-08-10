import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("inbox_items")
  .update({ lane: "completed", resolved_at: new Date().toISOString(),
    summary: "Superseded: 40 keywords approved, SERP observation now succeeds and 39 of 40 tasks returned real results." })
  .eq("title", "DataForSEO SERP observation failed").is("resolved_at", null).select("id");
await supabaseAdmin.from("activity_events").insert({
  actor_kind: "system", verb: "inbox.resolved", subject_kind: "inbox_item",
  summary: "Stale pre-approval SERP failure resolved after a successful SERP observation run.",
  payload: { resolved: data?.length ?? 0 },
});
console.log("resolved", data?.length ?? 0);
