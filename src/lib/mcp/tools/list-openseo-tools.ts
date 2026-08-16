import { defineTool } from "@lovable.dev/mcp-js";

import { guardedRead } from "../guard";
import { errorResult, jsonResult } from "../result";
import { listOpenSeoTools } from "./call-openseo-free-read";

export default defineTool({
  name: "list_openseo_tools",
  title: "List live OpenSEO tools",
  description:
    "Discover the current self-hosted OpenSEO MCP catalog and show AOOS's server-side free, metered, mutation, or destructive classification.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (args, ctx) =>
    guardedRead(ctx, "list_openseo_tools", args as Record<string, unknown>, async () => {
      try {
        return jsonResult(await listOpenSeoTools());
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "OpenSEO catalog could not be discovered.",
        );
      }
    }),
});
