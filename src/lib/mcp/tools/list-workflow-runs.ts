import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult } from "../result";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_workflow_runs",
  title: "List workflow runs",
  description:
    "List recent AOOS workflow runs with status, timing, and the workflow they belong to. Use it to check whether scheduled automation is healthy.",
  inputSchema: {
    workflow_key: z.string().optional().describe("Restrict results to one workflow key, for example gsc-daily-observe."),
    limit: z.number().int().optional().describe("Maximum number of runs to return, default 20."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workflow_key, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("workflow_runs")
      .select("id, workflow_id, status, trigger_kind, started_at, finished_at, error, workflows(key, name)")
      .order("started_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));
    if (workflow_key) {
      const { data: workflow, error: workflowError } = await supabase
        .from("workflows")
        .select("id")
        .eq("key", workflow_key)
        .maybeSingle();
      if (workflowError) return errorResult(workflowError.message);
      if (!workflow) return errorResult(`No workflow found with key ${workflow_key}`);
      query = query.eq("workflow_id", workflow.id);
    }
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ runs: data ?? [], count: data?.length ?? 0 });
  },
});
