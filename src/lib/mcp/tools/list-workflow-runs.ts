import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { guardedRead } from "../guard";
import { errorResult, jsonResult } from "../result";

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
  handler: async (args, ctx) => {
    const { workflow_key, limit } = args;
    return guardedRead(ctx, "list_workflow_runs", args as Record<string, unknown>, async (supabase) => {
      let query = supabase
        .from("workflow_runs")
        .select("id, workflow_id, state, trigger_source, started_at, finished_at, duration_ms, error, workflows(key, name)")
        .order("created_at", { ascending: false })
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
    });
  },
});

