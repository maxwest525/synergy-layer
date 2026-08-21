import { describe, expect, it } from "vitest";

import {
  buildGettingFound,
  countOf,
  countShownPages,
  describeAnswerability,
  LIST_LIMIT,
  topRows,
  type GettingFoundFacts,
} from "./getting-found";
import { RULE_ASSIGNMENTS } from "./rule-buckets";
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
  coverage: null,
  sessions: null,
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
        coverage: { pagesKnown: 39, pagesWithImpressions: 0 },
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
        coverage: { pagesKnown: 10, pagesWithImpressions: 9 },
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
        coverage: { pagesKnown: 39, pagesWithImpressions: 0 },
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
        coverage: { pagesKnown: 39, pagesWithImpressions: 0 },
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
        coverage: { pagesKnown: 39, pagesWithImpressions: 0 },
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

describe("defects an adversarial review found before this shipped", () => {
  it("refuses a diagnosis when the coverage window was never collected", () => {
    // The window is absent, not empty. Assembling zeros out of it told a site
    // with 612 impressions on screen that none of its 39 pages were findable.
    const view = buildGettingFound(withFacts({ comparison: READY, coverage: null }));
    expect(view.constraint).toBeNull();
    expect(view.parkedFrom).toBeNull();
  });

  it("refuses a diagnosis when the comparison behind the tiles is not ready", () => {
    const view = buildGettingFound(
      withFacts({ coverage: { pagesKnown: 39, pagesWithImpressions: 0 } }),
    );
    expect(view.constraint).toBeNull();
  });

  it("counts the same impressions the tiles show, so the two cannot disagree", () => {
    // The banner used to read its totals from the page-dimension window, a
    // separate measurement that legitimately differs from the daily totals.
    // Two impression counts on one screen, and the verdict could flip between
    // them.
    const view = buildGettingFound(
      withFacts({
        comparison: READY,
        coverage: { pagesKnown: 10, pagesWithImpressions: 9 },
      }),
    );
    // READY carries 612 impressions and 23 clicks: a 3.8% rate, well clear of
    // the weak-CTR floor, so the click constraint must not fire.
    expect(view.constraint?.reason).toContain("612");
    expect(view.constraint?.reason).not.toMatch(/choosing someone else/);
  });

  it("dates the window rather than presenting a stale one as current", () => {
    expect(buildGettingFound(withFacts({ latestDate: "2026-08-17" })).asOf).toBe("2026-08-17");
    expect(buildGettingFound(withFacts({ latestDate: null })).asOf).toBeNull();
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
    // The two lists carry no count, and there is no Overview tab: it rendered
    // the identical component to Suggestions, so it was a second door to one
    // room. The tiles above the strip are the overview.
    expect(tabs["queries"]).toBeNull();
    expect(view.tabs.map((tab) => tab.id)).not.toContain("overview");
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

describe("what this volume can and cannot answer", () => {
  it("names the observed volume and lists what the query dimension needs, in plain words", () => {
    const { line, beyond } = describeAnswerability(500, 48, RULE_ASSIGNMENTS);
    expect(line).toContain("500");
    expect(line).toContain("48");
    expect(line).not.toMatch(/\brule\b/i);
    for (const rule of RULE_ASSIGNMENTS) {
      expect(line).not.toContain(rule.rule);
    }
    // 500 / 48 rounds to 10.
    expect(beyond.some((entry) => entry.includes("about 10 a month"))).toBe(true);
    expect(beyond.some((entry) => /position/i.test(entry))).toBe(true);
    expect(beyond.every((entry) => !RULE_ASSIGNMENTS.some((a) => entry.includes(a.rule)))).toBe(
      true,
    );
  });

  it("names the lever that changes the volume, so absence never reads as a dead end", () => {
    const { line } = describeAnswerability(500, 48, RULE_ASSIGNMENTS);
    expect(line).toMatch(/internal links first/);
    expect(line).toMatch(/sitemap second/);
    expect(line).toMatch(/recrawl request third/);
  });

  it("carries one entry per beyond_current_volume rule, needing its live threshold", () => {
    const { beyond } = describeAnswerability(500, 48, RULE_ASSIGNMENTS);
    const beyondCount = RULE_ASSIGNMENTS.filter((a) => a.bucket === "beyond_current_volume").length;
    expect(beyond).toHaveLength(beyondCount);
  });

  it("is null on the view model until both the volume and the page count are stored", () => {
    const view = buildGettingFound(
      withFacts({ comparison: READY, coverage: { pagesKnown: 48, pagesWithImpressions: 9 } }),
    );
    expect(view.answerability).not.toBeNull();
    expect(view.answerability?.line).toContain(String(READY.current.impressions));
    expect(view.answerability?.line).toContain("48");
  });

  it("stays null when the coverage window was never collected, leaving the tile's own reason as the only message", () => {
    const view = buildGettingFound(withFacts({ comparison: READY, coverage: null }));
    expect(view.answerability).toBeNull();
  });

  it("stays null when the comparison behind the tiles is not ready", () => {
    const view = buildGettingFound(
      withFacts({ coverage: { pagesKnown: 48, pagesWithImpressions: 9 } }),
    );
    expect(view.answerability).toBeNull();
  });
});

describe("counting how much of the site Google shows", () => {
  const readable = new Set(["https://x.test/a", "https://x.test/b", "https://x.test/c"]);

  it("counts only pages the audit actually read", () => {
    // Search Console reports whatever it has; the audit stops at its own limit.
    // Counting the window's rows straight off produced shares above one, which
    // silently un-fired the diagnosis on exactly the large sites that need it.
    const rows = [
      { keys: ["https://x.test/a"], impressions: 40 },
      { keys: ["https://x.test/unknown"], impressions: 900 },
    ];
    expect(countShownPages(rows, readable)).toBe(1);
  });

  it("never returns more than the audit knows about", () => {
    const rows = Array.from({ length: 500 }, (_unused, index) => ({
      keys: [`https://x.test/${index}`],
      impressions: 10,
    }));
    expect(countShownPages(rows, readable)).toBeLessThanOrEqual(readable.size);
  });

  it("does not count a page that was never shown", () => {
    const rows = [{ keys: ["https://x.test/a"], impressions: 0 }, { keys: ["https://x.test/b"] }];
    expect(countShownPages(rows, readable)).toBe(0);
  });

  it("counts a page once however many rows carry it", () => {
    const rows = [
      { keys: ["https://x.test/a"], impressions: 5 },
      { keys: ["https://x.test/a"], impressions: 9 },
    ];
    expect(countShownPages(rows, readable)).toBe(1);
  });
});
