import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult } from "../result";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_inbox",
  title: "List inbox items",
  description:
    "List AOOS inbox items, the operational centre of the marketing operating system. Optionally filter by lane.",
  inputSchema: {
    lane: z
      .enum(["needs_attention", "pending_approval", "scheduled", "completed", "fyi"])
      .optional()
      .describe("Restrict results to one inbox lane."),
    include_resolved: z.boolean().optional().describe("Include items that are already resolved."),
    limit: z.number().int().optional().describe("Maximum number of items to return, default 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lane, include_resolved, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("inbox_items")
      .select("id, title, summary, lane, priority, source_module, subject_kind, subject_id, due_at, resolved_at, created_at")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 25, 1), 100));
    if (lane) query = query.eq("lane", lane);
    if (!include_resolved) query = query.is("resolved_at", null);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [], count: data?.length ?? 0 });
  },
});
