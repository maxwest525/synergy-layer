import { describe, expect, it } from "vitest";

import { classifyOpenSeoTool } from "./catalog";
import type { OpenSeoMcpTool } from "./types";

function tool(overrides: Partial<OpenSeoMcpTool>): OpenSeoMcpTool {
  return {
    name: "example",
    description: "Uses no credits — reads stored OpenSEO state.",
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    ...overrides,
  };
}

describe("classifyOpenSeoTool", () => {
  it("keeps a free read eligible for direct execution", () => {
    expect(classifyOpenSeoTool(tool({ name: "list_projects" }))).toEqual({
      mode: "free_read",
      cost: "free",
      readOnly: true,
      destructive: false,
      requiresConfirmation: false,
    });
  });

  it("requires confirmation when a read charges credits", () => {
    expect(
      classifyOpenSeoTool(
        tool({
          name: "get_ranked_keywords",
          description: "Returns ranked keywords. Charges credits (~100-300 typical).",
        }),
      ),
    ).toEqual({
      mode: "metered_read",
      cost: "metered",
      readOnly: true,
      destructive: false,
      requiresConfirmation: true,
    });
  });

  it("requires confirmation for a state-changing tool even when it is free", () => {
    expect(
      classifyOpenSeoTool(
        tool({
          name: "save_keywords",
          description: "Uses no credits — saves keywords to OpenSEO.",
          annotations: { readOnlyHint: false, destructiveHint: false },
        }),
      ),
    ).toEqual({
      mode: "mutation",
      cost: "free",
      readOnly: false,
      destructive: false,
      requiresConfirmation: true,
    });
  });

  it("classifies destructive metadata above every other signal", () => {
    expect(
      classifyOpenSeoTool(
        tool({
          name: "remove_rank_tracking_keywords",
          annotations: { readOnlyHint: false, destructiveHint: true },
        }),
      ),
    ).toEqual({
      mode: "destructive",
      cost: "free",
      readOnly: false,
      destructive: true,
      requiresConfirmation: true,
    });
  });

  it("governs a tool whose annotations and cost are uncertain", () => {
    expect(
      classifyOpenSeoTool(
        tool({ name: "future_tool", description: "A newly added capability.", annotations: {} }),
      ),
    ).toEqual({
      mode: "mutation",
      cost: "unknown",
      readOnly: false,
      destructive: false,
      requiresConfirmation: true,
    });
  });
});
