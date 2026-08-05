import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult } from "../result";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_recommendation",
  title: "Get recommendation detail",
  description:
    "Read one AOOS recommendation in full, including its reasoning, suggested action, and the targets it applies to.",
  inputSchema: { id: z.string().describe("The recommendation id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("recommendations").select("*").eq("id", id).maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult(`No recommendation found with id ${id}`);
    const { data: targets } = await supabase
      .from("recommendation_targets")
      .select("target_kind, target_id, target_label")
      .eq("recommendation_id", id);
    return jsonResult({ recommendation: data, targets: targets ?? [] });
  },
});
