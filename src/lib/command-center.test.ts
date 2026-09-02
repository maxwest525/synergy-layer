import { describe, expect, it } from "vitest";

import { buildCommandCenter, selectGa4Comparison, type CommandCenterFacts } from "./command-center";
import type { QueueSource } from "./suggestion-queue";

const NOW = "2026-08-20T12:00:00.000Z";

function daysBefore(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

const facts: CommandCenterFacts = {
  now: NOW,
  property: "trumoveinc.com",
  search: { status: "insufficient", availableDays: 12, requiredDays: 56, latestDate: null },
  ga4: { connectionStatement: "GA4 is connected.", windowDays: 28, snapshots: [] },
  changes: { fixesLive: 0, pagesImproved: 0 },
  audit: { lastObservedAt: null, pagesNeedingFixes: 0 },
  health: {
    brokenConnections: 0,
    failingProviders: 0,
    connectionsChecked: 1,
    lastCheckedAt: daysBefore(1),
    latestRunAt: daysBefore(2),
    overdueCadences: 0,
  },
  queueSources: [],
};

function withFacts(overrides: Partial<CommandCenterFacts>): CommandCenterFacts {
  return { ...facts, ...overrides };
}

function tile(view: ReturnType<typeof buildCommandCenter>, label: string) {
  const found = view.tiles.find((candidate) => candidate.label === label);
  if (!found) throw new Error(`no tile labelled ${label}`);
  return found;
}

function queueSource(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): QueueSource {
  return {
    kind: "recommendation",
    categoryId: "search",
    title: "Title does not say Tulsa",
    targetUrl: "https://trumoveinc.com/corporate-relocation",
    storedState: "proposed",
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: daysBefore(1),
    updatedAt: daysBefore(1),
    ...overrides,
  };
}

describe("the honesty invariant", () => {
  it("never emits a number for a tile that has no stored evidence", () => {
    const view = buildCommandCenter(facts);
    for (const entry of view.tiles) {
      if (entry.value === null) {
        // An absence must say why, in words the operator can act on.
        expect(entry.missingReason).not.toBeNull();
        expect(entry.missingReason?.length ?? 0).toBeGreaterThan(10);
      } else {
        expect(entry.missingReason).toBeNull();
      }
    }
  });

  it("never emits a delta without both periods stored", () => {
    const view = buildCommandCenter(facts);
    for (const entry of view.tiles) {
      if (entry.delta !== null) expect(entry.value).not.toBeNull();
    }
  });

  it("gives every tile a plain-words explanation", () => {
    for (const entry of buildCommandCenter(facts).tiles) {
      expect(entry.explanation.length).toBeGreaterThan(10);
      expect(entry.explanation).not.toContain("—");
    }
  });
});

describe("Google clicks tile", () => {
  it("shows nothing but the stored reason until both 28-day windows exist", () => {
    const entry = tile(buildCommandCenter(facts), "Google clicks · 28d");
    expect(entry.value).toBeNull();
    expect(entry.delta).toBeNull();
    expect(entry.missingReason).toContain("12 of 56");
  });

  it("shows the real total and the real change once both windows are stored", () => {
    const entry = tile(
      buildCommandCenter(
        withFacts({
          search: {
            status: "ready",
            windowDays: 28,
            previous: {
              startDate: "2026-06-25",
              endDate: "2026-07-22",
              clicks: 28,
              impressions: 900,
              ctr: 0.031,
              position: 12,
            },
            current: {
              startDate: "2026-07-23",
              endDate: "2026-08-19",
              clicks: 23,
              impressions: 950,
              ctr: 0.024,
              position: 14,
            },
            change: {
              clicksPercent: -17.86,
              impressionsPercent: 5.6,
              ctrPoints: -0.7,
              position: 2,
            },
          },
        }),
      ),
      "Google clicks · 28d",
    );
    expect(entry.value).toBe(23);
    expect(entry.delta).toEqual({ direction: "down", percent: -17.86, tone: "danger" });
  });

  it("says no property is connected rather than showing a zero", () => {
    const entry = tile(
      buildCommandCenter(withFacts({ property: null, search: null })),
      "Google clicks · 28d",
    );
    expect(entry.value).toBeNull();
    expect(entry.missingReason).toMatch(/Search Console/i);
  });

  it("treats a real drop to zero clicks as a real zero", () => {
    const entry = tile(
      buildCommandCenter(
        withFacts({
          search: {
            status: "ready",
            windowDays: 28,
            previous: {
              startDate: "2026-06-25",
              endDate: "2026-07-22",
              clicks: 4,
              impressions: 90,
              ctr: 0.04,
              position: 20,
            },
            current: {
              startDate: "2026-07-23",
              endDate: "2026-08-19",
              clicks: 0,
              impressions: 80,
              ctr: 0,
              position: 22,
            },
            change: { clicksPercent: -100, impressionsPercent: -11, ctrPoints: -4, position: 2 },
          },
        }),
      ),
      "Google clicks · 28d",
    );
    expect(entry.value).toBe(0);
    expect(entry.missingReason).toBeNull();
  });
});

describe("selectGa4Comparison", () => {
  it("compares only genuinely disjoint windows", () => {
    const result = selectGa4Comparison(
      [
        { startDate: "2026-07-23", endDate: "2026-08-19", sessions: 412 },
        { startDate: "2026-06-25", endDate: "2026-07-22", sessions: 389 },
      ],
      28,
    );
    expect(result.current?.sessions).toBe(412);
    expect(result.prior?.sessions).toBe(389);
  });

  it("refuses to diff two rolling windows one day apart", () => {
    // Snapshots roll daily. Diffing them would be a fabricated period change.
    const result = selectGa4Comparison(
      [
        { startDate: "2026-07-23", endDate: "2026-08-19", sessions: 412 },
        { startDate: "2026-07-22", endDate: "2026-08-18", sessions: 405 },
      ],
      28,
    );
    expect(result.current?.sessions).toBe(412);
    expect(result.prior).toBeNull();
    expect(result.reason).toMatch(/prior/i);
  });

  it("reports no window at all when nothing is stored", () => {
    const result = selectGa4Comparison([], 28);
    expect(result.current).toBeNull();
    expect(result.prior).toBeNull();
  });
});

describe("Visits tile", () => {
  it("names the connection state rather than showing a zero", () => {
    const entry = tile(
      buildCommandCenter(
        withFacts({
          ga4: {
            connectionStatement:
              "No server-side GA4 credential is present, so AOOS cannot make a reporting request.",
            windowDays: 28,
            snapshots: [],
          },
        }),
      ),
      "Visits · 28d",
    );
    expect(entry.value).toBeNull();
    expect(entry.missingReason).toContain("GA4 credential");
  });

  it("shows the stored number with no delta when only one window exists", () => {
    const entry = tile(
      buildCommandCenter(
        withFacts({
          ga4: {
            connectionStatement: "GA4 is connected.",
            windowDays: 28,
            snapshots: [{ startDate: "2026-07-23", endDate: "2026-08-19", sessions: 412 }],
          },
        }),
      ),
      "Visits · 28d",
    );
    expect(entry.value).toBe(412);
    expect(entry.delta).toBeNull();
  });
});

describe("Fixes live and Pages improved tiles", () => {
  it("counts only fixes proven live on the rendered page", () => {
    const entry = tile(
      buildCommandCenter(withFacts({ changes: { fixesLive: 14, pagesImproved: 3 } })),
      "Fixes live",
    );
    expect(entry.value).toBe(14);
  });

  it("treats a genuine zero as a zero, not as missing data", () => {
    const entry = tile(buildCommandCenter(facts), "Fixes live");
    expect(entry.value).toBe(0);
    expect(entry.missingReason).toBeNull();
  });

  it("says Pages improved means the outcome was checked, not guessed", () => {
    const entry = tile(buildCommandCenter(facts), "Pages improved");
    expect(entry.explanation).toMatch(/verified|checked/i);
  });
});

describe("Pages needing fixes tile", () => {
  it("says the audit is blind until it has run once", () => {
    const entry = tile(buildCommandCenter(facts), "Pages needing fixes");
    expect(entry.value).toBeNull();
    expect(entry.missingReason).toMatch(/audit/i);
  });

  it("counts the pages the stored audit actually flagged", () => {
    const entry = tile(
      buildCommandCenter(
        withFacts({ audit: { lastObservedAt: daysBefore(3), pagesNeedingFixes: 4 } }),
      ),
      "Pages needing fixes",
    );
    expect(entry.value).toBe(4);
  });
});

describe("waiting counts and the assist line", () => {
  it("counts open work per category and leaves quiet categories uncounted", () => {
    const view = buildCommandCenter(
      withFacts({
        queueSources: [
          queueSource({ id: "s1", categoryId: "search" }),
          queueSource({ id: "s2", categoryId: "search" }),
          queueSource({ id: "p1", categoryId: "pages" }),
          queueSource({ id: "done", categoryId: "health", storedState: "verified" }),
        ],
      }),
    );
    const counts = Object.fromEntries(view.categories.map((row) => [row.category.id, row.waiting]));
    expect(counts["search"]).toBe(2);
    expect(counts["pages"]).toBe(1);
    expect(counts["health"]).toBe(0);
  });

  it("gives a category with nothing waiting no badge at all", () => {
    const view = buildCommandCenter(facts);
    expect(view.categories.every((row) => row.tone === null)).toBe(true);
  });

  it("colours a category by its most urgent waiting item", () => {
    const view = buildCommandCenter(
      withFacts({
        queueSources: [
          queueSource({ id: "old", categoryId: "search", createdAt: daysBefore(30) }),
          queueSource({ id: "new", categoryId: "search", createdAt: daysBefore(1) }),
        ],
      }),
    );
    const search = view.categories.find((row) => row.category.id === "search");
    expect(search?.tone).toBe("danger");
  });

  it("reads green when a category holds nothing but nice-to-haves", () => {
    // The boards only ever paint a nav badge green, yellow or red. Blue belongs
    // to the rank pill inside a card, which answers a different question.
    const view = buildCommandCenter(
      withFacts({
        queueSources: [queueSource({ id: "calm", categoryId: "search", createdAt: daysBefore(1) })],
      }),
    );
    const search = view.categories.find((row) => row.category.id === "search");
    expect(search?.tone).toBe("positive");
  });

  it("never paints a nav badge with the card's blue", () => {
    const view = buildCommandCenter(
      withFacts({
        queueSources: [
          queueSource({ id: "a", categoryId: "search", createdAt: daysBefore(1) }),
          queueSource({ id: "b", categoryId: "pages", createdAt: daysBefore(5) }),
          queueSource({ id: "c", categoryId: "visitors", createdAt: daysBefore(30) }),
        ],
      }),
    );
    for (const row of view.categories) {
      if (row.tone !== null) expect(["positive", "warning", "danger"]).toContain(row.tone);
    }
  });

  it("writes the assist line in plain words with real counts, each linked to its category", () => {
    const view = buildCommandCenter(
      withFacts({
        queueSources: [
          queueSource({ id: "s1", categoryId: "search" }),
          queueSource({ id: "s2", categoryId: "search" }),
          queueSource({ id: "c1", categoryId: "connections" }),
        ],
      }),
    );
    expect(view.assistLine).toEqual([
      { phrase: "2 search fixes waiting", to: "/search" },
      { phrase: "1 connection to finish", to: "/capabilities" },
    ]);
  });

  it("says nothing needs you when the queue is empty", () => {
    const view = buildCommandCenter(facts);
    expect(view.assistLine).toEqual([]);
    expect(view.emptyHeadline).toBe("Nothing needs you");
  });
});

describe("top cards", () => {
  it("shows at most three, most urgent first, across every category", () => {
    const view = buildCommandCenter(
      withFacts({
        queueSources: [
          queueSource({ id: "a", categoryId: "search", createdAt: daysBefore(1) }),
          queueSource({ id: "b", categoryId: "pages", createdAt: daysBefore(30) }),
          queueSource({ id: "c", categoryId: "visitors", createdAt: daysBefore(5) }),
          queueSource({ id: "d", categoryId: "health", createdAt: daysBefore(2) }),
        ],
      }),
    );
    // b is fix_now, c is worth_doing, then the two nice_to_have cards by the
    // longer wait: d at two days before a at one.
    expect(view.topCards.map((card) => card.id)).toEqual(["b", "c", "d"]);
  });

  it("reports the true total waiting, not the three it shows", () => {
    const view = buildCommandCenter(
      withFacts({
        queueSources: Array.from({ length: 11 }, (_unused, index) =>
          queueSource({ id: `r${index}`, createdAt: daysBefore(index + 1) }),
        ),
      }),
    );
    expect(view.topCards).toHaveLength(3);
    expect(view.totalWaiting).toBe(11);
  });

  it("routes a change request card at the governed review screen", () => {
    const view = buildCommandCenter(
      withFacts({
        queueSources: [queueSource({ id: "c1", kind: "change", storedState: "proposed" })],
      }),
    );
    expect(view.topCards[0]?.action).toEqual({
      label: "Review the fix",
      to: "/changes/$id",
      params: { id: "c1" },
    });
  });
});

describe("top bar status", () => {
  it("says all systems are normal only when the stored health rows agree", () => {
    expect(buildCommandCenter(facts).statusLine).toMatchObject({
      text: "All systems normal",
      tone: "positive",
    });
  });

  it("says nothing has checked the plumbing rather than claiming it is fine", () => {
    expect(
      buildCommandCenter(
        withFacts({
          health: {
            brokenConnections: 0,
            failingProviders: 0,
            connectionsChecked: 0,
            lastCheckedAt: null,
            latestRunAt: null,
            overdueCadences: 0,
          },
        }),
      ).statusLine,
    ).toEqual({ text: "Connections have never been checked", tone: "warning", asOf: null });
  });

  it("names a broken connection rather than staying green", () => {
    const view = buildCommandCenter(
      withFacts({
        health: {
          brokenConnections: 1,
          failingProviders: 0,
          connectionsChecked: 1,
          lastCheckedAt: daysBefore(1),
          latestRunAt: daysBefore(2),
          overdueCadences: 0,
        },
      }),
    );
    expect(view.statusLine).toMatchObject({ text: "1 connection needs attention", tone: "danger" });
  });

  it("names the providers that are failing now, not every failure ever stored", () => {
    const view = buildCommandCenter(
      withFacts({
        health: {
          brokenConnections: 0,
          failingProviders: 3,
          connectionsChecked: 1,
          lastCheckedAt: daysBefore(1),
          latestRunAt: daysBefore(2),
          overdueCadences: 0,
        },
      }),
    );
    expect(view.statusLine).toMatchObject({
      text: "3 measurement providers are failing",
      tone: "warning",
    });
  });

  it("says provider in the singular when only one is failing", () => {
    const view = buildCommandCenter(
      withFacts({
        health: {
          brokenConnections: 0,
          failingProviders: 1,
          connectionsChecked: 1,
          lastCheckedAt: daysBefore(1),
          latestRunAt: daysBefore(2),
          overdueCadences: 0,
        },
      }),
    );
    expect(view.statusLine).toMatchObject({
      text: "1 measurement provider is failing",
      tone: "warning",
    });
  });

  it("leads with the broken connection when both are wrong", () => {
    const view = buildCommandCenter(
      withFacts({
        health: {
          brokenConnections: 2,
          failingProviders: 5,
          connectionsChecked: 1,
          lastCheckedAt: daysBefore(1),
          latestRunAt: daysBefore(2),
          overdueCadences: 0,
        },
      }),
    );
    expect(view.statusLine).toMatchObject({ text: "2 connections need attention", tone: "danger" });
  });

  it("names an overdue daily read ahead of a failing provider", () => {
    // A stopped scheduler records no failure, so nothing else on the bar
    // could say the evidence is going stale (MEAS-10).
    const view = buildCommandCenter(
      withFacts({ health: { ...facts.health, overdueCadences: 1, failingProviders: 2 } }),
    );
    expect(view.statusLine).toMatchObject({ text: "1 daily read is overdue", tone: "danger" });
  });

  it("dates the claim by the check it rests on", () => {
    // Green rests on the probes and the runs together, so the older one dates it.
    expect(buildCommandCenter(facts).statusLine.asOf).toBe(daysBefore(2));
    const health = { ...facts.health, brokenConnections: 1 };
    expect(buildCommandCenter(withFacts({ health })).statusLine.asOf).toBe(daysBefore(1));
    const failing = { ...facts.health, failingProviders: 1 };
    expect(buildCommandCenter(withFacts({ health: failing })).statusLine.asOf).toBe(daysBefore(2));
    const unchecked = { ...facts.health, connectionsChecked: 0, lastCheckedAt: null };
    expect(buildCommandCenter(withFacts({ health: unchecked })).statusLine.asOf).toBeNull();
  });

  it("does not turn red just because the queue is busy", () => {
    // The status light is about the plumbing. What is waiting is already
    // carried by the assist line and the nav badges.
    const view = buildCommandCenter(
      withFacts({
        queueSources: [queueSource({ id: "urgent", createdAt: daysBefore(30) })],
      }),
    );
    expect(view.statusLine.tone).toBe("positive");
  });
});

describe("suggested next rows", () => {
  it("offers the first page audit with its cost written on the button", () => {
    const view = buildCommandCenter(facts);
    const row = view.suggestedNext.find((entry) => entry.id === "run-page-audit");
    expect(row?.actionLabel).toBe("Set it up · reads up to 100 pages");
    expect(row?.metered).toBe(true);
  });

  it("sends the audit row to the route that owns the audit button", () => {
    // The category page at /pages has no audit control: only the workspace
    // behind it imports PageAuditPanel. This row is the first thing a new
    // workspace is told to do, so landing it on a page without the button
    // makes the instruction dead on arrival.
    const row = buildCommandCenter(facts).suggestedNext.find(
      (entry) => entry.id === "run-page-audit",
    );
    expect(row?.to).toBe("/pages/tools");
  });

  it("stops offering the first audit once the audit has run", () => {
    const view = buildCommandCenter(
      withFacts({ audit: { lastObservedAt: daysBefore(3), pagesNeedingFixes: 4 } }),
    );
    expect(view.suggestedNext.some((entry) => entry.id === "run-page-audit")).toBe(false);
  });

  it("points at a category that has work waiting", () => {
    const view = buildCommandCenter(
      withFacts({
        audit: { lastObservedAt: daysBefore(3), pagesNeedingFixes: 0 },
        queueSources: [
          queueSource({ id: "s1", categoryId: "search" }),
          queueSource({ id: "s2", categoryId: "search" }),
          queueSource({ id: "s3", categoryId: "search" }),
        ],
      }),
    );
    const row = view.suggestedNext.find((entry) => entry.id === "category-search");
    expect(row?.title).toBe("3 search fixes waiting in Getting found on Google");
    expect(row?.actionLabel).toBe("Go through them");
    expect(row?.metered).toBe(false);
  });

  it("never marks a plain navigation row as metered", () => {
    const view = buildCommandCenter(
      withFacts({ queueSources: [queueSource({ id: "s1", categoryId: "search" })] }),
    );
    for (const row of view.suggestedNext) {
      if (row.metered) expect(row.actionLabel).toMatch(/reads|costs|·/);
    }
  });
});

describe("the as-of line", () => {
  it("dates every number the page draws on, and says which are missing", () => {
    // A two-minute cache and a reading from days ago used to look the same:
    // nothing on the page said when anything was read (STATE-4).
    expect(buildCommandCenter(facts).asOfLine).toBe(
      "No search window stored · no visits window stored · pages never read · connections checked 2026-08-19",
    );
    const dated = buildCommandCenter(
      withFacts({
        search: {
          status: "insufficient",
          availableDays: 12,
          requiredDays: 56,
          latestDate: "2026-08-18",
        },
        ga4: {
          connectionStatement: "GA4 is connected.",
          windowDays: 28,
          snapshots: [{ startDate: "2026-07-22", endDate: "2026-08-18", sessions: 40 }],
        },
        audit: { lastObservedAt: daysBefore(3), pagesNeedingFixes: 0 },
      }),
    );
    expect(dated.asOfLine).toBe(
      "Search numbers to 2026-08-18 · visits to 2026-08-18 · pages read 2026-08-17 · connections checked 2026-08-19",
    );
  });
});
