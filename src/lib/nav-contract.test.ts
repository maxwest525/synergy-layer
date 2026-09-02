import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { describe, expect, it } from "vitest";

import { CATEGORIES, CATEGORY_NAV_CAP, navEntries } from "./categories";
import { buildCommandCenter } from "./command-center";

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

  it("points every destination the Command center emits at a route that exists", () => {
    // Five independent reviewers caught one dead link by reading the code. This
    // asserts it instead, for every destination the view model can produce.
    const routeFiles = read("../routeTree.gen.ts");
    const view = buildCommandCenter({
      now: "2026-08-20T12:00:00.000Z",
      property: "trumoveinc.com",
      search: null,
      ga4: { connectionStatement: "not connected", windowDays: 28, snapshots: [] },
      changes: { fixesLive: 0, pagesImproved: 0 },
      audit: { lastObservedAt: null, pagesNeedingFixes: 0 },
      health: {
        brokenConnections: 0,
        failingProviders: 0,
        connectionsChecked: 1,
        lastCheckedAt: "2026-08-19T12:00:00.000Z",
        latestRunAt: null,
      },
      queueSources: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          kind: "change",
          categoryId: "pages",
          title: "A drafted fix",
          targetUrl: null,
          storedState: "proposed",
          fingerprint: null,
          severity: null,
          linkedChangeId: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          kind: "recommendation",
          categoryId: "search",
          title: "A raised finding",
          targetUrl: null,
          storedState: "proposed",
          fingerprint: null,
          severity: null,
          linkedChangeId: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "audit:title",
          kind: "audit",
          categoryId: "pages",
          title: "A page check",
          targetUrl: null,
          storedState: "proposed",
          fingerprint: "audit:title",
          severity: "critical",
          linkedChangeId: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });

    const destinations = [
      ...view.suggestedNext.map((row) => row.to),
      ...view.topCards.map((card) => card.action.to),
    ];
    expect(destinations.length).toBeGreaterThan(0);
    for (const to of destinations) {
      expect(routeFiles).toContain(`'${to}'`);
    }
  });

  it("keeps the old shell out of the rendered tree", () => {
    // The previous ~30-item sidebar stays on disk but must not be linked, or the
    // redesign ships two navigations at once.
    expect(read("../routes/__root.tsx")).not.toMatch(/from "\.\.\/components\/os\/shell"/);
  });
});
