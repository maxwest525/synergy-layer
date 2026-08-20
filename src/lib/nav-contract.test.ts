import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { describe, expect, it } from "vitest";

import { CATEGORIES, CATEGORY_NAV_CAP, navEntries } from "./categories";

/**
 * The navigation contract.
 *
 * The redesign's whole premise is that the nav stops growing: a new feature goes
 * inside a category, never beside one. These tests are the enforcement, so
 * breaking the cap fails a build rather than passing a review.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("navigation contract", () => {
  it("renders home, the categories and settings, and nothing else", () => {
    const entries = navEntries();
    expect(entries.filter((entry) => entry.kind === "home")).toHaveLength(1);
    expect(entries.filter((entry) => entry.kind === "settings")).toHaveLength(1);
    expect(entries.filter((entry) => entry.kind === "category")).toHaveLength(CATEGORIES.length);
  });

  it("never exceeds the permanent cap", () => {
    expect(CATEGORIES.length).toBeLessThanOrEqual(CATEGORY_NAV_CAP);
  });

  it("points every nav entry at a route that exists", () => {
    // A nav item that 404s is worse than no nav item. Each destination must
    // correspond to a route file, either an existing one it absorbs or its own.
    const routeFiles = read("../routeTree.gen.ts");
    for (const entry of navEntries()) {
      if (entry.to === "/") continue;
      expect(routeFiles).toContain(`'${entry.to}'`);
    }
  });

  it("keeps the old shell out of the rendered tree", () => {
    // The previous ~30-item sidebar stays on disk but must not be linked, or the
    // redesign ships two navigations at once.
    expect(read("../routes/__root.tsx")).not.toMatch(/from "\.\.\/components\/os\/shell"/);
  });
});
