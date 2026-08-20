import { describe, expect, it } from "vitest";

import { TAXONOMY_GROUPS, WORKSPACE_GROUP, taxonomyGroupForPath } from "./os-taxonomy";

describe("os taxonomy", () => {
  it("orders the groups as the day-to-day loop, system health last", () => {
    expect(TAXONOMY_GROUPS.map((group) => group.key)).toEqual([
      "decisions",
      "evidence",
      "run_work",
      "system_health",
    ]);
  });

  it("assigns every workspace route exactly one known group", () => {
    const keys = new Set(TAXONOMY_GROUPS.map((group) => group.key));
    for (const [route, group] of Object.entries(WORKSPACE_GROUP)) {
      expect(keys.has(group), `${route} has an unknown group`).toBe(true);
    }
  });

  it("resolves detail routes through their list route", () => {
    expect(taxonomyGroupForPath("/changes/abc")?.key).toBe("decisions");
    expect(taxonomyGroupForPath("/workflows/abc")?.key).toBe("run_work");
    expect(taxonomyGroupForPath("/")?.key).toBe("decisions");
  });

  it("returns null for a route outside the workspaces", () => {
    expect(taxonomyGroupForPath("/auth")).toBeNull();
  });
});
