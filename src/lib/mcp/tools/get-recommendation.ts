import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { guardedRead } from "../guard";
import { errorResult, jsonResult } from "../result";

/** Explicit allowlist: nothing outside these keys leaves AOOS over MCP, so
 * internal metadata, prompts, credentials, and connector payloads stay inside. */
const RECOMMENDATION_FIELDS = [
  "id",
  "title",
  "description",
  "state",
  "source_module",
  "confidence",
  "reasoning",
  "business_impact",
  "revenue_impact",
  "traffic_impact",
  "risk",
  "time_saved_minutes",
  "requires_approval",
  "issue_fingerprint",
  "approved_at",
  "run_id",
  "created_at",
  "updated_at",
].join(", ");

/** The suggested action can carry connector arguments, so only its shape is exposed. */
function summariseAction(action: unknown): Record<string, unknown> {
  if (!action || typeof action !== "object" || Array.isArray(action))
    return { kind: null, fields: [] };
  const record = action as Record<string, unknown>;
  return {
    kind: typeof record["kind"] === "string" ? record["kind"] : null,
    capability: typeof record["capability"] === "string" ? record["capability"] : null,
    fields: Object.keys(record),
  };
}

export default defineTool({
  name: "get_recommendation",
  title: "Get recommendation detail",
  description:
    "Read one AOOS recommendation in full, including its reasoning, the shape of its suggested action, and the targets it applies to.",
  inputSchema: { id: z.string().uuid().describe("The recommendation id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) => {
    const { id } = args;
    return guardedRead(
      ctx,
      "get_recommendation",
      args as Record<string, unknown>,
      async (supabase) => {
        const { data, error } = await supabase
          .from("recommendations")
          .select(RECOMMENDATION_FIELDS)
          .eq("id", id)
          .maybeSingle();
        if (error) return errorResult(error.message);
        if (!data) return errorResult(`No recommendation found with id ${id}`);

        const { data: action } = await supabase
          .from("recommendations")
          .select("suggested_action")
          .eq("id", id)
          .maybeSingle();
        const { data: targets } = await supabase
          .from("recommendation_targets")
          .select("subject_kind, subject_id")
          .eq("recommendation_id", id);

        return jsonResult({
          recommendation: data,
          suggested_action: summariseAction(action?.suggested_action),
          targets: targets ?? [],
        });
      },
    );
  },
});
