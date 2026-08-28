import { describe, expect, it } from "vitest";

import { mayExecuteCapability } from "@/lib/serpapi/provider-gate";
import { definition } from "./self-hosted-analytics";

describe("self-hosted analytics registry", () => {
  it("declares cap.umami real, because an authenticated read stored snapshots on 2026-08-18", () => {
    const umami = definition.capabilities?.find((capability) => capability.key === "cap.umami");
    if (!umami) throw new Error("cap.umami must be declared.");
    expect(umami.integrationState).toBe("real");
  });

  it("passes the daily observation workflow's only node through the provider gate", () => {
    const workflow = definition.workflows?.find((entry) => entry.key === "umami-daily-observe");
    if (!workflow) throw new Error("umami-daily-observe must be declared.");
    const umami = definition.capabilities?.find((capability) => capability.key === "cap.umami");
    for (const node of workflow.graph.nodes) {
      if (node.kind !== "capability") continue;
      expect(node.ref).toBe("cap.umami");
      expect(mayExecuteCapability(node.ref ?? "", umami?.integrationState ?? "")).toBe(true);
    }
  });
});
