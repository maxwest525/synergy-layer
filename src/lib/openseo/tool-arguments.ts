import type { OpenSeoMcpTool, OpenSeoToolClassification } from "./types";

type Tool = OpenSeoMcpTool & { classification: OpenSeoToolClassification };

function projectField(tool: Tool): "project_id" | "projectId" | null {
  const properties = tool.inputSchema.properties ?? {};
  if ("project_id" in properties) return "project_id";
  if ("projectId" in properties) return "projectId";
  return null;
}

export function initialToolArguments(tool: Tool, projectId: string): Record<string, unknown> {
  const field = projectField(tool);
  return field && projectId.trim() ? { [field]: projectId.trim() } : {};
}

export function toolUsesProjectId(tool: Tool): boolean {
  return projectField(tool) !== null;
}
