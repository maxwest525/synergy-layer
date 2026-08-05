import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, jsonResult } from "../result";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_assets",
  title: "List marketing assets",
  description:
    "List AOOS marketing assets such as websites, ad accounts, repositories, and knowledge collections.",
  inputSchema: {
    kind: z.string().optional().describe("Restrict results to one asset kind, for example website."),
    limit: z.number().int().optional().describe("Maximum number of assets to return, default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("assets")
      .select("id, name, kind, status, health, owner_label, external_ref, description, updated_at")
      .order("name", { ascending: true })
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (kind) query = query.eq("kind", kind as never);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ assets: data ?? [], count: data?.length ?? 0 });
  },
});
