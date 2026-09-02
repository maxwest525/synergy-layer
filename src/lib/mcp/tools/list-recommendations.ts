import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { guardedRead } from "../guard";
import { errorResult, jsonResult } from "../result";

export default defineTool({
  name: "list_recommendations",
  title: "List recommendations",
  description:
    "List evidence backed AOOS recommendations with their impact, confidence, and lifecycle state.",
  inputSchema: {
    state: z
      .enum([
        "draft",
        "proposed",
        "under_review",
        "approved",
        "rejected",
        "scheduled",
        "applied",
        "verified",
        "failed",
        "rolled_back",
      ])
      .optional()
      .describe("Restrict results to one lifecycle state."),
    source_module: z
      .string()
      .optional()
      .describe("Restrict results to one source module, for example search-console."),
    limit: z.number().int().optional().describe("Maximum number of items to return, default 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    const { state, source_module, limit } = args;
    return guardedRead(
      ctx,
      "list_recommendations",
      args as Record<string, unknown>,
      async (supabase) => {
        let query = supabase
          .from("recommendations")
          .select(
            "id, title, description, state, source_module, confidence, business_impact, risk, requires_approval, issue_fingerprint, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(limit ?? 25, 1), 100));
        if (state) query = query.eq("state", state);
        if (source_module) query = query.eq("source_module", source_module);
        const { data, error } = await query;
        if (error) return errorResult(error.message);
        return jsonResult({ recommendations: data ?? [], count: data?.length ?? 0 });
      },
    );
  },
});
