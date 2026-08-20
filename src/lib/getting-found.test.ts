import { describe, expect, it } from "vitest";

import {
  buildGettingFound,
  countOf,
  LIST_LIMIT,
  topRows,
  type GettingFoundFacts,
} from "./getting-found";
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
  constraintFacts: null,
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

describe("the diagnosis that precedes the ranking", () => {
  it("shows nothing when there are no facts to diagnose from", () => {
    expect(buildGettingFound(withFacts({ comparison: READY })).constraint).toBeNull();
  });

  it("names visibility as the problem, and parks the click fixes", () => {
    // 39 pages, none ever shown. Sorting title rewrites here would be exactly
    // the error the research warns about.
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        constraintFacts: {
          pagesKnown: 39,
          pagesWithImpressions: 0,
          impressions: 0,
          clicks: 0,
          sessions: null,
          conversions: null,
        },
        queueSources: [
          { ...source("indexed", 5), rule: "index_coverage_drift" },
          { ...source("unseen", 5), rule: "zero_impression_page" },
          { ...source("ctr", 5), rule: "weak_ctr_page" },
          { ...source("striking", 5), rule: "striking_distance_query" },
        ],
      }),
    );
    expect(view.constraint?.reason).toContain("39");
    expect(view.constraint?.addressing).toBe(2);
    expect(view.constraint?.parked).toBe(2);
  });

  it("counts the parked ones rather than hiding them", () => {
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        constraintFacts: {
          pagesKnown: 10,
          pagesWithImpressions: 9,
          impressions: 4000,
          clicks: 6,
          sessions: null,
          conversions: null,
        },
        queueSources: [
          { ...source("ctr", 5), rule: "weak_ctr_page" },
          { ...source("unseen", 5), rule: "zero_impression_page" },
        ],
      }),
    );
    // Now the click is the constraint, so the pair flips.
    expect(view.constraint?.addressing).toBe(1);
    expect(view.constraint?.parked).toBe(1);
  });
});

describe("the suggestion list the page renders", () => {
  it("puts what addresses the constraint first, and parks the rest below", () => {
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        constraintFacts: {
          pagesKnown: 39,
          pagesWithImpressions: 0,
          impressions: 0,
          clicks: 0,
          sessions: null,
          conversions: null,
        },
        queueSources: [
          { ...source("ctr", 5), rule: "weak_ctr_page" },
          { ...source("unseen", 5), rule: "zero_impression_page" },
        ],
      }),
    );
    expect(view.suggestions.map((item) => item.id)).toEqual(["unseen", "ctr"]);
    expect(view.parkedFrom).toBe(1);
  });

  it("parks nothing out of sight: every open item is still in the list", () => {
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        constraintFacts: {
          pagesKnown: 39,
          pagesWithImpressions: 0,
          impressions: 0,
          clicks: 0,
          sessions: null,
          conversions: null,
        },
        queueSources: [
          { ...source("ctr", 5), rule: "weak_ctr_page" },
          { ...source("unseen", 5), rule: "zero_impression_page" },
          { ...source("striking", 5), rule: "striking_distance_query" },
        ],
      }),
    );
    expect(view.suggestions).toHaveLength(3);
    expect(view.suggestions.map((item) => item.id).sort()).toEqual(["ctr", "striking", "unseen"]);
  });

  it("draws no divider when there is no diagnosis to justify one", () => {
    const view = buildGettingFound(
      withFacts({ comparison: READY, queueSources: [source("a", 30), source("b", 5)] }),
    );
    expect(view.parkedFrom).toBeNull();
    expect(view.suggestions).toHaveLength(2);
  });

  it("draws no divider when every suggestion falls on the same side of it", () => {
    // A divider with nothing below it explains nothing.
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        constraintFacts: {
          pagesKnown: 39,
          pagesWithImpressions: 0,
          impressions: 0,
          clicks: 0,
          sessions: null,
          conversions: null,
        },
        queueSources: [{ ...source("unseen", 5), rule: "zero_impression_page" }],
      }),
    );
    expect(view.parkedFrom).toBeNull();
    expect(view.suggestions).toHaveLength(1);
  });

  it("keeps decided items in history rather than dropping them", () => {
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        queueSources: [source("a", 5), source("done", 5, "applied"), source("gone", 5, "rejected")],
      }),
    );
    expect(view.suggestions.map((item) => item.id)).toEqual(["a"]);
    expect(view.history.map((item) => item.id).sort()).toEqual(["done", "gone"]);
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

describe("the search term and page lists", () => {
  it("puts the biggest contributors first", () => {
    const rows = topRows([
      { keys: ["cheap movers"], clicks: 3 },
      { keys: ["movers near me"], clicks: 41 },
      { keys: ["packing service"], clicks: 12 },
    ]);
    expect(rows.map((row) => row.label)).toEqual([
      "movers near me",
      "packing service",
      "cheap movers",
    ]);
  });

  it("keeps a stored zero, because a term shown and never clicked is a fact", () => {
    expect(topRows([{ keys: ["storage quote"], clicks: 0 }])).toEqual([
      { label: "storage quote", clicks: 0 },
    ]);
  });

  it("drops a row Google withheld the term for rather than showing a blank line", () => {
    // Search Console omits the key on rare queries. An unlabelled row would
    // read as a search nobody typed.
    expect(
      topRows([{ clicks: 9 }, { keys: [""], clicks: 4 }, { keys: ["real"], clicks: 1 }]),
    ).toEqual([{ label: "real", clicks: 1 }]);
  });

  it("treats a missing click count as zero, not as a reason to drop the row", () => {
    expect(topRows([{ keys: ["a"] }])).toEqual([{ label: "a", clicks: 0 }]);
    expect(countOf(undefined)).toBe(0);
    expect(countOf(Number.NaN)).toBe(0);
    expect(countOf(7)).toBe(7);
  });

  it("cuts the list at the limit instead of rendering every stored row", () => {
    const many = Array.from({ length: LIST_LIMIT + 10 }, (_unused, index) => ({
      keys: [`term ${index}`],
      clicks: index,
    }));
    expect(topRows(many)).toHaveLength(LIST_LIMIT);
    // The cut keeps the biggest, not the first stored.
    expect(topRows(many)[0]?.clicks).toBe(LIST_LIMIT + 9);
  });
});
