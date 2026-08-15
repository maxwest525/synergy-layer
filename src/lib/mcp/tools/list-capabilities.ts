import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { guardedRead } from "../guard";
import { errorResult, jsonResult } from "../result";

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
  handler: async (args, ctx) => {
    const { integration_state } = args;
    return guardedRead(
      ctx,
      "list_capabilities",
      args as Record<string, unknown>,
      async (supabase) => {
        let query = supabase
          .from("capabilities")
          .select(
            "id, key, name, description, kind, category, integration_state, status, health, last_run_at",
          )
          .order("name", { ascending: true });
        if (integration_state) query = query.eq("integration_state", integration_state);
        const { data, error } = await query;
        if (error) return errorResult(error.message);
        return jsonResult({ capabilities: data ?? [], count: data?.length ?? 0 });
      },
    );
  },
});
