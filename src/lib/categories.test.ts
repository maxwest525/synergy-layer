import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CATEGORY_NAV_CAP,
  breadcrumbsForPath,
  categoryForPath,
  navEntries,
} from "./categories";

describe("category model", () => {
  it("keeps the nav at or under the permanent cap", () => {
    // The cap is the whole point of the redesign: new features go inside a
    // category, never beside one. A future phase that adds a seventh category
    // is fine; an eighth must fail here rather than in review.
    expect(CATEGORIES.length).toBeLessThanOrEqual(CATEGORY_NAV_CAP);
  });

  it("ships the six categories the spec table defines, in spec order", () => {
    expect(CATEGORIES.map((category) => category.title)).toEqual([
      "Getting found on Google",
      "Who visits your site",
      "Your pages",
      "Your competition",
      "Site health",
      "Connections",
    ]);
  });

  it("gives every category a distinct route, slug and id", () => {
    const routes = new Set(CATEGORIES.map((category) => category.to));
    const slugs = new Set(CATEGORIES.map((category) => category.slug));
    const ids = new Set(CATEGORIES.map((category) => category.id));
    expect(routes.size).toBe(CATEGORIES.length);
    expect(slugs.size).toBe(CATEGORIES.length);
    expect(ids.size).toBe(CATEGORIES.length);
  });

  it("gives every category a plain-words sentence saying what it is for", () => {
    for (const category of CATEGORIES) {
      expect(category.purpose.length).toBeGreaterThan(10);
      // The spec bans em dashes in operator copy.
      expect(category.purpose).not.toContain("—");
    }
  });

  it("puts the command center first in the nav and settings last", () => {
    const entries = navEntries();
    expect(entries[0]?.kind).toBe("home");
    expect(entries[0]?.to).toBe("/");
    expect(entries.at(-1)?.kind).toBe("settings");
    // home + categories + settings, nothing else.
    expect(entries.length).toBe(CATEGORIES.length + 2);
  });

  it("never lets the nav exceed the cap plus home and settings", () => {
    expect(navEntries().length).toBeLessThanOrEqual(CATEGORY_NAV_CAP + 2);
  });
});

describe("categoryForPath", () => {
  it("matches a category's reserved route and its nested views", () => {
    expect(categoryForPath("/getting-found-on-google")?.id).toBe("search");
    expect(categoryForPath("/getting-found-on-google/suggestions")?.id).toBe("search");
  });

  it("matches the route a category currently absorbs", () => {
    expect(categoryForPath("/search")?.id).toBe("search");
    expect(categoryForPath("/pages")?.id).toBe("pages");
    expect(categoryForPath("/capabilities")?.id).toBe("connections");
  });

  it("returns undefined for the home route so home is never a category", () => {
    expect(categoryForPath("/")).toBeUndefined();
  });

  it("returns undefined for the old routes that stay reachable but unlinked", () => {
    expect(categoryForPath("/command-center")).toBeUndefined();
    expect(categoryForPath("/studio")).toBeUndefined();
    expect(categoryForPath("/seo-runs")).toBeUndefined();
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(categoryForPath("/your-pages-archive")).toBeUndefined();
  });
});

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

  it("returns an empty trail for an unlinked legacy route", () => {
    expect(breadcrumbsForPath("/studio", "trumoveinc.com")).toEqual([]);
  });
});
