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

  it("keeps the analytics subtree under evidence", () => {
    for (const path of ["/ga4", "/ga4/tools"]) {
      expect(taxonomyGroupForPath(path)?.key, path).toBe("evidence");
    }
  });

  it("keeps the whole capabilities subtree under system health", () => {
    // Resolution is longest-matching-prefix, so re-homing /capabilities alone
    // silently re-homes the registry, the detail route and the systems
    // workspaces with it. That happened once: the category page was moved to
    // "decisions" and every screen below it changed its eyebrow to match.
    for (const path of [
      "/capabilities",
      "/capabilities/registry",
      "/capabilities/some-capability-id",
      "/capabilities/systems",
      "/capabilities/systems/search-console",
    ]) {
      expect(taxonomyGroupForPath(path)?.key, path).toBe("system_health");
    }
  });
});
