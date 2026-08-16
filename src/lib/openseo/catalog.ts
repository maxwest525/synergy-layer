import type { OpenSeoMcpTool, OpenSeoToolClassification, OpenSeoToolCost } from "./types";

const EXPLICIT_FREE = /\b(?:uses? no credits?|no credits?|free)\b/i;
const EXPLICIT_METERED =
  /\b(?:charges?|costs?|spends?)\s+(?:credits?|~?\d)|\bcredits?\s+(?:per|each|required|charged)|\bcredit cost\b/i;

function costFor(tool: OpenSeoMcpTool): OpenSeoToolCost {
  const description = tool.description ?? "";
  if (EXPLICIT_FREE.test(description)) return "free";
  if (EXPLICIT_METERED.test(description)) return "metered";
  return "unknown";
}

export function classifyOpenSeoTool(tool: OpenSeoMcpTool): OpenSeoToolClassification {
  const readOnly = tool.annotations?.readOnlyHint === true;
  const destructive = tool.annotations?.destructiveHint === true;
  const cost = costFor(tool);

  if (destructive) {
    return {
      mode: "destructive",
      cost,
      readOnly,
      destructive: true,
      requiresConfirmation: true,
    };
  }
  if (!readOnly) {
    return {
      mode: "mutation",
      cost,
      readOnly: false,
      destructive: false,
      requiresConfirmation: true,
    };
  }
  if (cost === "free") {
    return {
      mode: "free_read",
      cost,
      readOnly: true,
      destructive: false,
      requiresConfirmation: false,
    };
  }
  return {
    mode: "metered_read",
    cost,
    readOnly: true,
    destructive: false,
    requiresConfirmation: true,
  };
}
