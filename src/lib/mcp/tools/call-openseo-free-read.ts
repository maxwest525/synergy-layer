import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { guardedRead } from "../guard";
import { errorResult, jsonResult } from "../result";
import { classifyOpenSeoTool } from "../../openseo/catalog";
import { discoverOpenSeo } from "../../openseo/mcp.server";
import { invokeOpenSeoToolForOperator } from "../../openseo/runtime.server";
import type { OpenSeoOperatorContext } from "../../openseo/runtime.server";

export async function listOpenSeoTools() {
  const discovery = await discoverOpenSeo();
  return {
    server: discovery.serverInfo,
    protocolVersion: discovery.protocolVersion,
    instructions: discovery.instructions ?? null,
    tools: discovery.tools.map((tool) => ({ ...tool, classification: classifyOpenSeoTool(tool) })),
    count: discovery.tools.length,
  };
}

export async function callOpenSeoFreeRead(
  context: OpenSeoOperatorContext,
  toolName: string,
  argumentsObject: Record<string, unknown>,
) {
  const discovery = await discoverOpenSeo();
  const tool = discovery.tools.find((candidate) => candidate.name === toolName);
  if (!tool || classifyOpenSeoTool(tool).mode !== "free_read") {
    throw new Error("That OpenSEO tool is not a free read and cannot run through AOOS MCP.");
  }
  return invokeOpenSeoToolForOperator(context, {
    toolName,
    arguments: argumentsObject,
    confirmed: false,
  });
}

export default defineTool({
  name: "call_openseo_free_read",
  title: "Call a free OpenSEO read",
  description:
    "Run one live OpenSEO tool only when its current server metadata proves it is a free read. AOOS records immutable tenant evidence for the call.",
  inputSchema: {
    tool_name: z.string().trim().min(1).max(128),
    arguments: z.record(z.string(), z.unknown()),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async (args, ctx) =>
    guardedRead(
      ctx,
      "call_openseo_free_read",
      args as Record<string, unknown>,
      async (supabase) => {
        const userId = ctx.getUserId();
        if (!userId) return errorResult("AOOS could not identify the authenticated operator.");
        try {
          return jsonResult({
            invocation: await callOpenSeoFreeRead(
              { supabase, userId },
              args.tool_name,
              args.arguments,
            ),
          });
        } catch (error) {
          return errorResult(
            error instanceof Error ? error.message : "OpenSEO could not run this tool.",
          );
        }
      },
    ),
});
