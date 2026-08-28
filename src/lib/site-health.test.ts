import { describe, expect, it } from "vitest";

import {
  buildSiteHealth,
  gradeOutcomes,
  STORABLE_WINDOWS,
  sumSiteWindow,
  worstSpeed,
  type SiteHealthFacts,
  type StoredOutcome,
} from "./site-health";
import { GROUNDED_WINDOWS } from "./outcome-verdict";
import { RULE_ASSIGNMENTS } from "./rule-buckets";
import type { SiteFinding } from "./site-checks";

const NOW = "2026-08-20T12:00:00.000Z";

function outcome(overrides: Partial<StoredOutcome> = {}): StoredOutcome {
  return {
    changeId: "chg-1",
    title: "Rewrite the packing page title",
    targetUrl: "https://x.test/services/packing",
    windowDays: 28,
    daysSinceLive: 30,
    impressions: 400,
    clicks: 6,
    measurable: true,
    readingStatus: "complete" as const,
    coverage: null,
    baseline: null,
    siteTrend: null,
    wordingTreatment: false,
    ...overrides,
  };
}

function crawl(overrides: Partial<SiteFinding> = {}): SiteFinding {
  return {
    check: "sitemap_missing",
    label: "No sitemap found",
    severity: "critical",
    instruction: "Publish a sitemap.",
    detail: "No sitemap was reachable.",
    fixableByChangeKind: "site.crawl_directives",
    ...overrides,
  } as SiteFinding;
}

const base: SiteHealthFacts = {
  now: NOW,
  property: "trumoveinc.com",
  siteFindings: [],
  siteObservedAt: null,
  outcomes: [],
  speed: [],
  queueSources: [],
};

function withFacts(overrides: Partial<SiteHealthFacts>): SiteHealthFacts {
  return { ...base, ...overrides };
}

describe("grading the fixes, which nothing has ever done", () => {
  it("grades a reading on a window the research derives", () => {
    const [graded] = gradeOutcomes([
      outcome({
        windowDays: 28,
        impressions: 400,
        clicks: 6,
        baseline: { impressions: 50, clicks: 0 },
      }),
    ]);
    expect(graded?.verdict).toBe("success");
    expect(graded?.reason.length).toBeGreaterThan(20);
  });

  it("keeps a reading on a window nothing derives, and says so instead of grading it", () => {
    // 7 is the window with no derivation anywhere. Deleting the reading would
    // hide it; grading it would assert something we cannot justify.
    const [graded] = gradeOutcomes([outcome({ windowDays: 7 })]);
    expect(graded?.verdict).toBeNull();
    expect(graded?.reason).toContain("7 day window");
    expect(graded?.reason).toMatch(/kept but not graded/i);
  });

  it("treats the approval snapshot as a before picture, not an outcome", () => {
    const [graded] = gradeOutcomes([outcome({ windowDays: 0 })]);
    expect(graded?.verdict).toBeNull();
    expect(graded?.reason).toMatch(/before picture/i);
  });

  it("carries the AI Overview rule through: shown but unclicked is not a failure", () => {
    const [graded] = gradeOutcomes([
      outcome({ impressions: 140, clicks: 0, baseline: { impressions: 300, clicks: 0 } }),
    ]);
    expect(graded?.verdict).toBe("neutral");
    expect(graded?.reason).toMatch(/AI Overview/i);
  });

  it("still calls almost no impressions and no clicks a failure", () => {
    const [graded] = gradeOutcomes([
      outcome({ impressions: 12, clicks: 0, baseline: { impressions: 100, clicks: 20 } }),
    ]);
    expect(graded?.verdict).toBe("failure");
  });

  it("says unmeasurable rather than failure for a page the property cannot see", () => {
    const [graded] = gradeOutcomes([outcome({ measurable: false })]);
    expect(graded?.verdict).toBe("unmeasurable");
  });
});

describe("what the page leads with", () => {
  it("puts a failed fix above a successful one", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({
            changeId: "worked",
            impressions: 400,
            clicks: 6,
            baseline: { impressions: 50, clicks: 0 },
          }),
          outcome({
            changeId: "failed",
            impressions: 12,
            clicks: 0,
            baseline: { impressions: 100, clicks: 20 },
          }),
        ],
      }),
    );
    expect(view.outcomes[0]?.changeId).toBe("failed");
  });

  it("puts ungraded readings last, because they are not a verdict", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ changeId: "ungraded", windowDays: 7 }),
          outcome({ changeId: "graded", impressions: 400, clicks: 6 }),
        ],
      }),
    );
    expect(view.outcomes.at(-1)?.changeId).toBe("ungraded");
  });

  it("leads with what is blocking Google over a fix that did not work", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        siteFindings: [crawl()],
        outcomes: [outcome({ impressions: 12, clicks: 0 })],
      }),
    );
    expect(view.status.tone).toBe("danger");
    expect(view.status.text).toMatch(/blocking Google/i);
  });

  it("says a fix did not work when nothing is blocking Google", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ impressions: 12, clicks: 0, baseline: { impressions: 100, clicks: 20 } }),
        ],
      }),
    );
    expect(view.status.text).toMatch(/did not work/i);
  });

  it("says Google can read the site only once the checks have run", () => {
    expect(buildSiteHealth(withFacts({})).status.text).toMatch(
      /not been checked|nothing has been checked/i,
    );
    expect(buildSiteHealth(withFacts({ siteObservedAt: NOW })).status).toEqual({
      text: "Google can read your site",
      tone: "positive",
    });
  });

  it("sorts crawl findings worst first", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        siteFindings: [
          crawl({ check: "sitemap_not_declared", severity: "advice" }),
          crawl({ check: "sitemap_missing", severity: "critical" }),
        ],
      }),
    );
    expect(view.crawl[0]?.severity).toBe("critical");
  });
});

describe("the honesty invariant", () => {
  it("says the checks have never run rather than reporting zero problems", () => {
    const view = buildSiteHealth(withFacts({}));
    const tile = view.tiles.find((entry) => entry.label === "Crawl problems");
    expect(tile?.value).toBeNull();
    expect(tile?.missingReason).toMatch(/never run/i);
  });

  it("reports a real zero once the checks have run", () => {
    const view = buildSiteHealth(withFacts({ siteObservedAt: NOW }));
    expect(view.tiles.find((entry) => entry.label === "Crawl problems")?.value).toBe("0");
  });

  it("will not report a slowest page when no speed reading is stored", () => {
    const tile = buildSiteHealth(withFacts({ siteObservedAt: NOW })).tiles.find(
      (entry) => entry.label === "Slowest page",
    );
    expect(tile?.value).toBeNull();
    expect(tile?.missingReason).toMatch(/no speed reading/i);
  });

  it("ignores a stored reading with no score rather than treating it as zero", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        speed: [
          { url: "/a", strategy: "mobile", performanceScore: null, collectedAt: NOW },
          { url: "/b", strategy: "mobile", performanceScore: 41, collectedAt: NOW },
        ],
      }),
    );
    expect(view.tiles.find((entry) => entry.label === "Slowest page")?.value).toBe("41");
  });

  it("will not say how many fixes worked when none has been graded", () => {
    const tile = buildSiteHealth(withFacts({ siteObservedAt: NOW })).tiles.find(
      (entry) => entry.label === "Fixes that worked",
    );
    expect(tile?.value).toBeNull();
    expect(tile?.missingReason).toMatch(/nothing has been live long enough/i);
  });

  it("does not count an ungraded reading as a graded one", () => {
    const view = buildSiteHealth(
      withFacts({ siteObservedAt: NOW, outcomes: [outcome({ windowDays: 7 })] }),
    );
    expect(view.tiles.find((entry) => entry.label === "Fixes graded")?.value).toBe("0");
  });
});

describe("naming the window nothing derives, on screen", () => {
  it("says how many readings are stored but not graded, and which windows are", () => {
    const view = buildSiteHealth(
      withFacts({ siteObservedAt: NOW, outcomes: [outcome({ windowDays: 7 })] }),
    );
    expect(view.ungradedNote).toContain("7 days");
    for (const window of GROUNDED_WINDOWS) {
      expect(view.ungradedNote).toContain(String(window));
    }
  });

  it("says nothing when every reading was graded", () => {
    const view = buildSiteHealth(withFacts({ siteObservedAt: NOW, outcomes: [outcome()] }));
    expect(view.ungradedNote).toBeNull();
  });

  it("does not count the approval snapshot as an ungraded window", () => {
    // Window zero is the before picture. It is meant not to be graded.
    const view = buildSiteHealth(
      withFacts({ siteObservedAt: NOW, outcomes: [outcome({ windowDays: 0 })] }),
    );
    expect(view.ungradedNote).toBeNull();
  });
});

describe("judging many small changes together", () => {
  it("says nothing below three eligible members", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ changeId: "a", baseline: { impressions: 120, clicks: 0 }, impressions: 155 }),
          outcome({ changeId: "b", baseline: { impressions: 120, clicks: 0 }, impressions: 155 }),
        ],
      }),
    );
    expect(view.cohortNote).toBeNull();
  });

  it("pools three or more graded 28-day readings into one cohort line", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ changeId: "a", baseline: { impressions: 40, clicks: 0 }, impressions: 52 }),
          outcome({ changeId: "b", baseline: { impressions: 40, clicks: 0 }, impressions: 52 }),
          outcome({ changeId: "c", baseline: { impressions: 40, clicks: 0 }, impressions: 51 }),
        ],
      }),
    );
    expect(view.cohortNote).toMatch(/\b3 measured changes\b/);
    expect(view.cohortNote).toMatch(/120 to 155/);
  });

  it("leaves out too-early and unmeasurable readings, pooling only the graded ones", () => {
    // Three too-early changes and one unmeasurable page must not contribute to
    // the pool: their windows have not closed, or nothing can be read from
    // them at all, so "3 measured changes, judged together" would be
    // reporting a verdict on readings that never earned one.
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ changeId: "a", baseline: { impressions: 40, clicks: 0 }, impressions: 52 }),
          outcome({ changeId: "b", baseline: { impressions: 40, clicks: 0 }, impressions: 52 }),
          outcome({
            changeId: "too-early-1",
            daysSinceLive: 10,
            baseline: { impressions: 40, clicks: 0 },
            impressions: 52,
          }),
          outcome({
            changeId: "too-early-2",
            daysSinceLive: 10,
            baseline: { impressions: 40, clicks: 0 },
            impressions: 52,
          }),
          outcome({
            changeId: "unmeasurable",
            measurable: false,
            baseline: { impressions: 40, clicks: 0 },
            impressions: 52,
          }),
        ],
      }),
    );
    // Two graded members sit under MIN_COHORT_MEMBERS, so the note is null
    // rather than built from the two graded readings plus the three others.
    expect(view.cohortNote).toBeNull();
  });

  it("leaves out a reading with no baseline or on a window other than 28 days", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ changeId: "a", baseline: { impressions: 40, clicks: 0 }, impressions: 52 }),
          outcome({ changeId: "b", baseline: { impressions: 40, clicks: 0 }, impressions: 52 }),
          outcome({ changeId: "c", baseline: null, impressions: 51 }),
          outcome({
            changeId: "d",
            windowDays: 14,
            daysSinceLive: 14,
            baseline: { impressions: 40, clicks: 0 },
            impressions: 52,
          }),
        ],
      }),
    );
    expect(view.cohortNote).toBeNull();
  });
});

describe("defects an adversarial review found before this shipped", () => {
  it("grades a closed window instead of calling every reading too early", () => {
    // daysSinceLive was measured from live_at to the window's own end date.
    // period_end_pt is a Pacific calendar date derived from live_at, so the
    // difference always floored to one day short and every reading on every
    // tenant graded "too early", forever. The whole feature was unreachable.
    const [graded] = gradeOutcomes([
      outcome({
        windowDays: 28,
        daysSinceLive: 28,
        impressions: 5000,
        clicks: 400,
        baseline: { impressions: 500, clicks: 50 },
      }),
    ]);
    expect(graded?.verdict).toBe("success");
  });

  it("keeps a partial reading rather than grading its short totals", () => {
    // A partial reading sums only the days Search Console returned. Grading it
    // turned a reporting gap into a failure, which is the one thing the
    // measurement code says explicitly not to do.
    const [graded] = gradeOutcomes([
      outcome({
        readingStatus: "partial",
        coverage: { expectedDays: 28, observedDays: 10 },
        impressions: 90,
        clicks: 2,
      }),
    ]);
    expect(graded?.verdict).toBeNull();
    expect(graded?.reason).toContain("10 of 28 days");
  });

  it("does not invent a not-indexed failure out of a reporting gap", () => {
    const [graded] = gradeOutcomes([
      outcome({ windowDays: 14, readingStatus: "partial", impressions: 0, clicks: 0 }),
    ]);
    expect(graded?.verdict).toBeNull();
    expect(graded?.reason).not.toMatch(/not indexed/i);
  });

  it("does not count a reading it could not grade as a graded fix", () => {
    // "Fixes graded: 2" sat directly above two cards saying neither had been
    // live long enough.
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ windowDays: 14, daysSinceLive: 3 }),
          outcome({ windowDays: 28, daysSinceLive: 3 }),
        ],
      }),
    );
    expect(view.tiles.find((entry) => entry.label === "Fixes graded")?.value).toBe("0");
    const worked = view.tiles.find((entry) => entry.label === "Fixes that worked");
    expect(worked?.value).toBeNull();
    expect(worked?.missingReason).toMatch(/nothing has been live long enough/i);
  });

  it("does not count an unmeasurable reading as graded either", () => {
    const view = buildSiteHealth(
      withFacts({ siteObservedAt: NOW, outcomes: [outcome({ measurable: false })] }),
    );
    expect(view.tiles.find((entry) => entry.label === "Fixes graded")?.value).toBe("0");
  });

  it("grades a quiet 14 day window not_yet, and does not count it as graded", () => {
    // Google's own recrawl timeline says this can take a few days to a few
    // weeks, so silence at 14 days is not a verdict on the fix.
    const [graded] = gradeOutcomes([
      outcome({ windowDays: 14, daysSinceLive: 14, impressions: 0 }),
    ]);
    expect(graded?.verdict).toBe("not_yet");

    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [outcome({ windowDays: 14, daysSinceLive: 14, impressions: 0 })],
      }),
    );
    expect(view.tiles.find((entry) => entry.label === "Fixes graded")?.value).toBe("0");
  });

  it("sorts a success above the readings still waiting, so it reads decided rather than pending", () => {
    // A success buried under "too early" cards read as one more thing pending.
    // Decided verdicts come first, worst news still leading; only the waits
    // trail them.
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ changeId: "too-early", windowDays: 14, daysSinceLive: 3 }),
          outcome({ changeId: "not-yet", windowDays: 14, daysSinceLive: 14, impressions: 0 }),
          outcome({
            changeId: "worked",
            impressions: 400,
            clicks: 6,
            baseline: { impressions: 50, clicks: 0 },
          }),
        ],
      }),
    );
    const ids = view.outcomes.map((entry) => entry.changeId);
    expect(ids.indexOf("worked")).toBeLessThan(ids.indexOf("not-yet"));
    expect(ids.indexOf("worked")).toBeLessThan(ids.indexOf("too-early"));
  });

  it("sorts a not_yet reading after neutral and before too early", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        outcomes: [
          outcome({ changeId: "too-early", windowDays: 14, daysSinceLive: 3 }),
          outcome({ changeId: "neutral", impressions: 140, clicks: 0 }),
          outcome({ changeId: "not-yet", windowDays: 14, daysSinceLive: 14, impressions: 0 }),
        ],
      }),
    );
    const ids = view.outcomes.map((entry) => entry.changeId);
    expect(ids.indexOf("neutral")).toBeLessThan(ids.indexOf("not-yet"));
    expect(ids.indexOf("not-yet")).toBeLessThan(ids.indexOf("too-early"));
  });

  it("says the counts are a floor when a read hit its limit", () => {
    const view = buildSiteHealth(withFacts({ siteObservedAt: NOW, truncated: true }));
    expect(view.truncatedNote).toMatch(/floor rather than a total/i);
    expect(buildSiteHealth(withFacts({ siteObservedAt: NOW })).truncatedNote).toBeNull();
  });

  it("names every grounded window, now that all four can be stored", () => {
    // The CHECK constraint used to stop at 28, so 56 and 90 could never arrive
    // however well the research derived them. The migration widened it and
    // taught the lifecycle trigger to cut them.
    const view = buildSiteHealth(
      withFacts({ siteObservedAt: NOW, outcomes: [outcome({ windowDays: 7 })] }),
    );
    expect(view.ungradedNote).toContain("14 and 28 and 56 and 90");
    expect(view.ungradedNote).not.toMatch(/nothing collects them yet/i);
    expect(STORABLE_WINDOWS).toEqual([0, 7, 14, 28, 56, 90]);
  });

  it("grades a 90 day reading, which the database could not previously hold", () => {
    const [graded] = gradeOutcomes([
      outcome({
        windowDays: 90,
        daysSinceLive: 95,
        impressions: 900,
        clicks: 30,
        baseline: { impressions: 100, clicks: 5 },
      }),
    ]);
    expect(graded?.verdict).toBe("success");
  });

  it("reads the current speed score, not a superseded one", () => {
    // Reducing over the raw rows reported a page that scored 18 in June and 91
    // today as the site's worst page.
    const worst = worstSpeed([
      { url: "/slow", strategy: "mobile", performanceScore: 18, collectedAt: "2026-06-01" },
      { url: "/slow", strategy: "mobile", performanceScore: 91, collectedAt: "2026-08-20" },
      { url: "/fast", strategy: "mobile", performanceScore: 88, collectedAt: "2026-08-20" },
    ]);
    expect(worst?.performanceScore).toBe(88);
    expect(worst?.url).toBe("/fast");
  });

  it("keeps mobile and desktop as separate readings of one address", () => {
    const worst = worstSpeed([
      { url: "/a", strategy: "mobile", performanceScore: 40, collectedAt: "2026-08-20" },
      { url: "/a", strategy: "desktop", performanceScore: 95, collectedAt: "2026-08-20" },
    ]);
    expect(worst?.performanceScore).toBe(40);
  });

  it("names the page and the day behind the slowest score", () => {
    const view = buildSiteHealth(
      withFacts({
        siteObservedAt: NOW,
        speed: [{ url: "/a", strategy: "mobile", performanceScore: 41, collectedAt: "2026-08-19" }],
      }),
    );
    const tile = view.tiles.find((entry) => entry.label === "Slowest page");
    expect(tile?.explanation).toContain("/a");
    expect(tile?.explanation).toContain("2026-08-19");
  });

  it("sums daily site impressions across an inclusive date range", () => {
    const days = [
      { date: "2026-08-01", impressions: 10 },
      { date: "2026-08-02", impressions: 20 },
      { date: "2026-08-03", impressions: 30 },
    ];
    expect(sumSiteWindow(days, "2026-08-01", "2026-08-03")).toEqual({ impressions: 60 });
  });

  it("returns null when a day inside the range is missing", () => {
    const days = [
      { date: "2026-08-01", impressions: 10 },
      { date: "2026-08-03", impressions: 30 },
    ];
    expect(sumSiteWindow(days, "2026-08-01", "2026-08-03")).toBeNull();
  });

  it("does not say Google can read the site while crawl problems are open", () => {
    const view = buildSiteHealth(
      withFacts({ siteObservedAt: NOW, siteFindings: [crawl({ severity: "advice" })] }),
    );
    expect(view.status.text).not.toMatch(/can read your site/i);
    expect(view.status.tone).toBe("warning");
  });
});

describe("naming what the checks have never run", () => {
  it("states that the checks have never run, with what it costs", () => {
    const view = buildSiteHealth(withFacts({ siteObservedAt: null }));
    expect(view.neverRunNotice).toContain("never run");
    expect(view.neverRunNotice).toMatch(/robots\.txt/i);
    expect(view.waitingOn.join(" ")).toContain("page audit");
  });

  it("says nothing once the checks have run", () => {
    expect(buildSiteHealth(withFacts({ siteObservedAt: NOW })).neverRunNotice).toBeNull();
  });

  it("says nothing about prerequisites once the checks have run", () => {
    expect(buildSiteHealth(withFacts({ siteObservedAt: NOW })).waitingOn).toEqual([]);
  });

  it("never puts a rule id on screen", () => {
    const view = buildSiteHealth(withFacts({ siteObservedAt: null }));
    for (const assignment of RULE_ASSIGNMENTS) {
      expect(`${view.neverRunNotice} ${view.waitingOn.join(" ")}`).not.toContain(assignment.rule);
    }
  });
});
