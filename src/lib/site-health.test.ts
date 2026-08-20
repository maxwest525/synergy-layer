import { describe, expect, it } from "vitest";

import {
  buildSiteHealth,
  gradeOutcomes,
  type SiteHealthFacts,
  type StoredOutcome,
} from "./site-health";
import { GROUNDED_WINDOWS } from "./outcome-verdict";
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
    const [graded] = gradeOutcomes([outcome({ windowDays: 28, impressions: 400, clicks: 6 })]);
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
    const [graded] = gradeOutcomes([outcome({ impressions: 140, clicks: 0 })]);
    expect(graded?.verdict).toBe("neutral");
  });

  it("still calls almost no impressions and no clicks a failure", () => {
    const [graded] = gradeOutcomes([outcome({ impressions: 12, clicks: 0 })]);
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
          outcome({ changeId: "worked", impressions: 400, clicks: 6 }),
          outcome({ changeId: "failed", impressions: 12, clicks: 0 }),
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
      withFacts({ siteObservedAt: NOW, outcomes: [outcome({ impressions: 12, clicks: 0 })] }),
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
  it("says the checks have not run rather than reporting zero problems", () => {
    const view = buildSiteHealth(withFacts({}));
    const tile = view.tiles.find((entry) => entry.label === "Crawl problems");
    expect(tile?.value).toBeNull();
    expect(tile?.missingReason).toMatch(/have not run/i);
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
          { url: "/a", performanceScore: null, collectedAt: NOW },
          { url: "/b", performanceScore: 41, collectedAt: NOW },
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
