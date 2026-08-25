import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ALL_NAV_ROUTES, NAV_EXEMPT, navDirectory } from "./nav-directory";

/**
 * A page an operator cannot find is a page that does not exist. Twenty
 * workflows, ten schedules, activity, spend and the SEO run history all had
 * routes and no link for months. This test makes that state impossible to
 * reach again: a new route either appears in the sidebar or is named in
 * NAV_EXEMPT with a reason.
 */
function operatorRoutes(): string[] {
  const files = readdirSync("src/routes").filter((name) => name.endsWith(".tsx"));
  const routes = new Set<string>();
  for (const file of files) {
    const stem = file.slice(0, -".tsx".length);
    if (stem.startsWith("__") || stem.startsWith("[")) continue;
    if (stem.includes("$")) continue;
    if (stem === "auth" || stem.startsWith("auth.")) continue;
    if (stem === "index") {
      routes.add("/");
      continue;
    }
    const path = `/${stem.split(".").join("/")}`.replace(/\/index$/, "");
    routes.add(path);
  }
  return [...routes].sort();
}

describe("every operator route is reachable from the sidebar", () => {
  const linked = new Set(ALL_NAV_ROUTES);

  it.each(operatorRoutes())("%s is linked or explicitly exempt", (route) => {
    const covered = linked.has(route) || route in NAV_EXEMPT;
    expect(covered, `${route} has no sidebar link and no NAV_EXEMPT reason`).toBe(true);
  });

  it("exempts nothing it also links, so the reason cannot go stale", () => {
    for (const route of Object.keys(NAV_EXEMPT)) {
      if (route === "/" || route === "/operators") continue;
      expect(linked.has(route), `${route} is both linked and exempt`).toBe(false);
    }
  });

  it("gives every exemption a stated reason", () => {
    for (const [route, reason] of Object.entries(NAV_EXEMPT)) {
      expect(reason.trim().length, `${route} has an empty reason`).toBeGreaterThan(0);
    }
  });

  it("groups the directory and never renders an empty heading", () => {
    const groups = navDirectory();
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) expect(group.entries.length).toBeGreaterThan(0);
  });

  it("links the workflow and schedule pages that had no door", () => {
    expect(linked.has("/workflows")).toBe(true);
    expect(linked.has("/scheduler")).toBe(true);
  });
});
