import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult } from "../result";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_capabilities",
  title: "List capabilities",
  description:
    "List registered AOOS capabilities (connectors, MCPs, APIs, skills, models) with their integration state and health.",
  inputSchema: {
    integration_state: z
      .enum(["real", "simulated", "pending", "mock"])
      .optional()
      .describe("Restrict results to one integration state."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ integration_state }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("capabilities")
      .select("id, key, name, description, kind, category, integration_state, status, health, last_run_at")
      .order("name", { ascending: true });
    if (integration_state) query = query.eq("integration_state", integration_state);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ capabilities: data ?? [], count: data?.length ?? 0 });
  },
});
