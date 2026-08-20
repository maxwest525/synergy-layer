import { describe, expect, it } from "vitest";

import { buildGettingFound, type GettingFoundFacts } from "./getting-found";
import type { PeriodComparison } from "./search-console";

const READY: PeriodComparison = {
  status: "ready",
  windowDays: 28,
  previous: {
    startDate: "2026-06-25",
    endDate: "2026-07-22",
    clicks: 28,
    impressions: 561,
    ctr: 0.049,
    position: 12.4,
  },
  current: {
    startDate: "2026-07-23",
    endDate: "2026-08-19",
    clicks: 23,
    impressions: 612,
    ctr: 0.038,
    position: 12.1,
  },
  change: {
    clicksPercent: -17.86,
    impressionsPercent: 9.09,
    ctrPoints: -1.1,
    position: -0.3,
  },
};

const facts: GettingFoundFacts = {
  now: "2026-08-20T12:00:00.000Z",
  property: "trumoveinc.com",
  comparison: { status: "insufficient", availableDays: 12, requiredDays: 56, latestDate: null },
  latestDate: null,
  queries: [],
  pages: [],
  queueSources: [],
};

function withFacts(overrides: Partial<GettingFoundFacts>): GettingFoundFacts {
  return { ...facts, ...overrides };
}

function tile(view: ReturnType<typeof buildGettingFound>, label: string) {
  const found = view.tiles.find((candidate) => candidate.label === label);
  if (!found) throw new Error(`no tile labelled ${label}`);
  return found;
}

describe("the honesty invariant", () => {
  it("shows no number on any tile until both windows are stored", () => {
    for (const entry of buildGettingFound(facts).tiles) {
      expect(entry.value).toBeNull();
      expect(entry.missingReason).toContain("12 of 56");
    }
  });

  it("says no property is connected rather than showing zeroes", () => {
    const view = buildGettingFound(withFacts({ property: null }));
    for (const entry of view.tiles) {
      expect(entry.value).toBeNull();
      expect(entry.missingReason).toMatch(/Search Console/i);
    }
  });

  it("gives every tile a plain-words explanation with no em dash", () => {
    for (const entry of buildGettingFound(withFacts({ comparison: READY })).tiles) {
      expect(entry.explanation.length).toBeGreaterThan(8);
      expect(entry.explanation).not.toContain("—");
    }
  });
});

describe("the four tiles the board shows", () => {
  it("renders them in the board's order and wording", () => {
    const view = buildGettingFound(withFacts({ comparison: READY }));
    expect(view.tiles.map((entry) => entry.label)).toEqual([
      "People who clicked",
      "Times you showed up",
      "Seeing to clicking",
      "Average spot",
    ]);
  });

  it("counts clicks, and a fall in clicks is bad", () => {
    const entry = tile(buildGettingFound(withFacts({ comparison: READY })), "People who clicked");
    expect(entry.value).toBe("23");
    expect(entry.delta).toEqual({ direction: "down", label: "18%", tone: "danger" });
  });

  it("counts impressions, and a rise in them is good", () => {
    const entry = tile(buildGettingFound(withFacts({ comparison: READY })), "Times you showed up");
    expect(entry.value).toBe("612");
    expect(entry.delta).toEqual({ direction: "up", label: "9%", tone: "positive" });
    expect(entry.explanation).toContain('"impressions"');
  });

  it("turns the stored click-through fraction into a percent exactly once", () => {
    const entry = tile(buildGettingFound(withFacts({ comparison: READY })), "Seeing to clicking");
    // 0.038 is a fraction. 3.8%, never 0.038% and never 380%.
    expect(entry.value).toBe("3.8%");
  });

  it("does not multiply the click-through delta a second time", () => {
    // `ctrPoints` is already in percentage points, unlike `ctr`.
    const entry = tile(buildGettingFound(withFacts({ comparison: READY })), "Seeing to clicking");
    expect(entry.delta).toEqual({ direction: "down", label: "1.1 points", tone: "danger" });
  });

  it("reads average spot as a rank, where a smaller number is better", () => {
    const entry = tile(buildGettingFound(withFacts({ comparison: READY })), "Average spot");
    expect(entry.value).toBe("#12.1");
    // Position moved from 12.4 to 12.1: the number fell, which is an improvement.
    expect(entry.delta).toEqual({ direction: "down", label: "0.3 better", tone: "positive" });
  });

  it("calls a rising position number worse, not better", () => {
    const entry = tile(
      buildGettingFound(
        withFacts({
          comparison: { ...READY, change: { ...READY.change, position: 2.4 } },
        }),
      ),
      "Average spot",
    );
    expect(entry.delta).toEqual({ direction: "up", label: "2.4 worse", tone: "danger" });
  });

  it("shows no delta when a period had nothing to divide by", () => {
    const entry = tile(
      buildGettingFound(
        withFacts({
          comparison: { ...READY, change: { ...READY.change, clicksPercent: null } },
        }),
      ),
      "People who clicked",
    );
    expect(entry.value).toBe("23");
    expect(entry.delta).toBeNull();
  });

  it("treats a genuine zero as a zero", () => {
    const entry = tile(
      buildGettingFound(
        withFacts({
          comparison: { ...READY, current: { ...READY.current, clicks: 0 } },
        }),
      ),
      "People who clicked",
    );
    expect(entry.value).toBe("0");
    expect(entry.missingReason).toBeNull();
  });

  it("shows no average spot when no impression carried one", () => {
    const entry = tile(
      buildGettingFound(
        withFacts({
          comparison: { ...READY, current: { ...READY.current, position: null } },
        }),
      ),
      "Average spot",
    );
    expect(entry.value).toBeNull();
    expect(entry.missingReason).toMatch(/position/i);
  });
});

describe("the status line", () => {
  it("says nothing needs you when the queue is clear", () => {
    const view = buildGettingFound(withFacts({ comparison: READY }));
    expect(view.status.text).toBe("Nothing needs you here");
    expect(view.status.tone).toBe("positive");
  });

  it("names what is worth fixing, written as a consequence", () => {
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        queueSources: [source("a", 30), source("b", 5), source("c", 1)],
      }),
    );
    expect(view.status.text).toBe("1 thing to fix now, 2 more worth a look");
    expect(view.status.tone).toBe("danger");
  });

  it("stays yellow when nothing is urgent", () => {
    const view = buildGettingFound(
      withFacts({ comparison: READY, queueSources: [source("a", 5)] }),
    );
    expect(view.status.text).toBe("1 thing worth fixing");
    expect(view.status.tone).toBe("warning");
  });
});

describe("the tab strip", () => {
  it("carries the counts the board shows", () => {
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        queueSources: [source("a", 5), source("done", 5, "applied"), source("gone", 5, "rejected")],
      }),
    );
    const tabs = Object.fromEntries(view.tabs.map((tab) => [tab.id, tab.count]));
    expect(tabs["suggestions"]).toBe(1);
    expect(tabs["history"]).toBe(2);
    expect(tabs["overview"]).toBeNull();
  });
});

function source(id: string, ageDays: number, storedState = "proposed") {
  const created = new Date(Date.parse(facts.now) - ageDays * 86_400_000).toISOString();
  return {
    id,
    kind: "recommendation" as const,
    categoryId: "search" as const,
    title: "A finding",
    targetUrl: null,
    storedState,
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: created,
    updatedAt: created,
  };
}
