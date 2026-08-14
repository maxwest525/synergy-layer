import { describe, expect, it, vi } from "vitest";

import { runAgent } from "./agent-runtime.server";
import { assertRunnableGraph } from "./workflow-runner.server";

describe("unwired runtime paths", () => {
  it("does not create an agent approval request", async () => {
    const client = { from: vi.fn() };
    await expect(runAgent(client as never, "agent-1", "operator-1")).rejects.toThrow(
      /runtime agents are intentionally disabled/i,
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects workflow approval nodes before a run is created", () => {
    expect(() =>
      assertRunnableGraph({
        nodes: [{ key: "review", kind: "approval" }],
        edges: [],
      }),
    ).toThrow(/approval continuation is not implemented/i);
  });
});
