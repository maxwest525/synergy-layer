import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { breadcrumbsForPath } from "./breadcrumbs";

describe("breadcrumbsForPath", () => {
  it("reads property then Categories then the page, as the board shows", () => {
    expect(breadcrumbsForPath("/getting-found-on-google", "trumoveinc.com")).toEqual([
      { label: "trumoveinc.com" },
      { label: "Categories" },
      { label: "Getting found on Google", to: "/search" },
    ]);
  });

  it("names the category from the route it currently absorbs", () => {
    // Until a category's own page exists the nav points at the route it
    // absorbs, and that route must read as the category it now belongs to.
    expect(breadcrumbsForPath("/search", "trumoveinc.com").at(-1)).toEqual({
      label: "Getting found on Google",
      to: "/search",
    });
  });

  it("names a view inside a category after the category, so the category is the way back", () => {
    // The trail used to stop at the category, so the bold current crumb said
    // "Getting found on Google" on the Search tools page and the category was
    // the one crumb that could not be clicked (NAV-8).
    expect(breadcrumbsForPath("/search/tools", null)).toEqual([
      { label: "Categories" },
      { label: "Getting found on Google", to: "/search" },
      { label: "Search tools", to: "/search/tools" },
    ]);
    expect(breadcrumbsForPath("/capabilities/systems/sys.openseo", null)).toEqual([
      { label: "Categories" },
      { label: "Connections", to: "/capabilities" },
      { label: "Connection health", to: "/capabilities/systems" },
      { label: "System", to: "/capabilities/systems/sys.openseo" },
    ]);
  });

  it("names the command center directly under the property", () => {
    expect(breadcrumbsForPath("/", "trumoveinc.com")).toEqual([
      { label: "trumoveinc.com" },
      { label: "Command center", to: "/" },
    ]);
  });

  it("omits the property crumb when no property is connected yet", () => {
    // An unconnected workspace must not invent a domain to fill the slot.
    expect(breadcrumbsForPath("/", null)).toEqual([{ label: "Command center", to: "/" }]);
  });

  it("routes a page outside the categories back through the command center", () => {
    // These used to return an empty trail, which blanked the breadcrumb bar on
    // exactly the deep pages an operator gets lost on. Every page now carries
    // a clickable way back to the start.
    expect(breadcrumbsForPath("/studio", "trumoveinc.com")).toEqual([
      { label: "trumoveinc.com" },
      { label: "Command center", to: "/" },
      { label: "Studio", to: "/studio" },
    ]);
  });

  it("takes every label from a name a person wrote, never from the URL", () => {
    expect(breadcrumbsForPath("/seo-runs", null).at(-1)).toEqual({
      label: "SEO runs",
      to: "/seo-runs",
    });
    expect(breadcrumbsForPath("/openseo", null).at(-1)?.label).toBe("SEO tools");
    expect(breadcrumbsForPath("/openai-ads", null).at(-1)?.label).toBe("OpenAI Ads");
    expect(breadcrumbsForPath("/gaps", null).at(-1)?.label).toBe("Connection gaps");
    expect(breadcrumbsForPath("/operators", null).at(-1)?.label).toBe("People and access");
  });

  it("names the kind of row on a detail page, with the list above it as the way back", () => {
    expect(breadcrumbsForPath("/recommendations/abc-123", null)).toEqual([
      { label: "Command center", to: "/" },
      { label: "Observations", to: "/recommendations" },
      { label: "Observation", to: "/recommendations/abc-123" },
    ]);
    expect(breadcrumbsForPath("/changes/abc-123", null).slice(1)).toEqual([
      { label: "Page changes", to: "/changes" },
      { label: "Page change", to: "/changes/abc-123" },
    ]);
  });
});

/**
 * Every operator route, with a stand-in id where the file takes one, so a new
 * page cannot land with a crumb that is missing or read off its slug.
 */
function operatorRoutes(): string[] {
  const files = readdirSync("src/routes").filter((name) => name.endsWith(".tsx"));
  const routes = new Set<string>();
  for (const file of files) {
    const stem = file.slice(0, -".tsx".length);
    if (stem.startsWith("__") || stem.startsWith("[")) continue;
    if (stem === "auth" || stem.startsWith("auth.")) continue;
    if (stem === "index") {
      routes.add("/");
      continue;
    }
    const path = `/${stem.split(".").join("/")}`
      .replace(/\/index$/, "")
      .replace(/\$[a-z]+/g, "abc-123");
    routes.add(path);
  }
  return [...routes].sort();
}

describe("every operator route ends its trail on its own page", () => {
  it.each(operatorRoutes())("%s", (route) => {
    // One crumb per path segment on top of one lead-in crumb: the Command
    // center outside the categories, or "Categories" inside one (the category
    // crumb itself stands for the first segment). A segment nothing names is
    // left out, which shortens the trail and fails here.
    const crumbs = breadcrumbsForPath(route, null);
    const segments = route.split("/").filter(Boolean);
    expect(crumbs.length, `${route} dropped a segment nothing names`).toBe(segments.length + 1);
  });
});
