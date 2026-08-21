import { describe, expect, it } from "vitest";

import {
  buildYourPages,
  defectsByPage,
  type PageEvidence,
  type YourPagesFacts,
} from "./your-pages";
import type { CheckFinding } from "./page-checks";
import { RULE_ASSIGNMENTS } from "./rule-buckets";
import type { PeriodComparison } from "./search-console";

const NOW = "2026-08-20T12:00:00.000Z";

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
  change: { clicksPercent: -17.86, impressionsPercent: 9.09, ctrPoints: -1.1, position: -0.3 },
};

function page(url: string, overrides: Partial<PageEvidence> = {}): PageEvidence {
  return {
    url,
    clicks: 0,
    impressions: 0,
    ctr: null,
    position: null,
    changeId: null,
    changeState: null,
    ...overrides,
  };
}

function finding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    check: "title_missing",
    label: "Missing title",
    severity: "critical",
    instruction: "Give the page a title.",
    fixableByWordingProposal: true,
    pages: [],
    ...overrides,
  } as CheckFinding;
}

const base: YourPagesFacts = {
  now: NOW,
  property: "trumoveinc.com",
  pages: [],
  findings: [],
  auditedUrls: [],
  queueSources: [],
  observedPages: 0,
  failedPages: 0,
  lastObservedAt: null,
  fixesLive: 0,
  comparison: { status: "insufficient", availableDays: 0, requiredDays: 56, latestDate: null },
  coverage: null,
  sessions: null,
  orphanBailReason: null,
};

function withFacts(overrides: Partial<YourPagesFacts>): YourPagesFacts {
  return { ...base, ...overrides };
}

describe("inverting the grouping the rules produce", () => {
  it("turns one finding listing many pages into many pages listing their defects", () => {
    // The rules answer "how many pages have a missing title". The operator is
    // asking "what is wrong with /services/packing".
    const byPage = defectsByPage([
      finding({
        check: "title_missing",
        pages: [
          { url: "/a", detail: "no title tag" },
          { url: "/b", detail: "no title tag" },
        ],
      }),
      finding({
        check: "h1_missing",
        label: "Missing H1",
        severity: "warning",
        pages: [{ url: "/a", detail: "no h1" }],
      }),
    ]);
    expect(byPage.get("/a")?.map((defect) => defect.check)).toEqual([
      "title_missing",
      "h1_missing",
    ]);
    expect(byPage.get("/b")?.map((defect) => defect.check)).toEqual(["title_missing"]);
  });

  it("puts the worst defect on a page first", () => {
    const byPage = defectsByPage([
      finding({ check: "thin_content", severity: "advice", pages: [{ url: "/a", detail: "x" }] }),
      finding({
        check: "title_missing",
        severity: "critical",
        pages: [{ url: "/a", detail: "y" }],
      }),
    ]);
    expect(byPage.get("/a")?.[0]?.check).toBe("title_missing");
  });

  it("carries what the check actually saw, not a generic label", () => {
    const byPage = defectsByPage([
      finding({ pages: [{ url: "/a", detail: "title is 4 characters" }] }),
    ]);
    expect(byPage.get("/a")?.[0]?.detail).toBe("title is 4 characters");
  });

  it("says nothing about a page with nothing wrong", () => {
    expect(defectsByPage([]).get("/a")).toBeUndefined();
  });
});

describe("which page is worth opening first", () => {
  const pages = [
    page("/seen-and-broken", { impressions: 400, clicks: 0 }),
    page("/never-seen", { impressions: 0, clicks: 0 }),
    page("/working", { impressions: 900, clicks: 60 }),
  ];
  const findings = [
    finding({ pages: [{ url: "/seen-and-broken", detail: "no title" }] }),
    finding({ pages: [{ url: "/never-seen", detail: "no title" }] }),
  ];
  // Every page here has been read. Ordering by what is wrong only means
  // anything once the audit has actually looked.
  const read = ["/seen-and-broken", "/never-seen", "/working"];

  it("puts pages Google has never shown first when being found is the problem", () => {
    // A title rewrite cannot help a page that is not being found at all.
    const view = buildYourPages(
      withFacts({
        pages,
        findings,
        auditedUrls: read,
        comparison: READY,
        coverage: { pagesKnown: 39, pagesWithImpressions: 2 },
      }),
    );
    expect(view.rows[0]?.url).toBe("/never-seen");
    expect(view.ordering).toMatch(/never shown/i);
  });

  it("puts pages people see and pass over first when the click is the problem", () => {
    const view = buildYourPages(
      withFacts({
        pages,
        findings,
        auditedUrls: read,
        comparison: READY,
        coverage: { pagesKnown: 10, pagesWithImpressions: 9 },
      }),
    );
    expect(view.rows[0]?.url).toBe("/seen-and-broken");
    expect(view.ordering).toMatch(/see and do not click/i);
  });

  it("flips the order between the two diagnoses, on identical pages", () => {
    // This is the whole point: the same defect on the same page is worth
    // different amounts depending on what is actually holding the site back.
    const reachability = buildYourPages(
      withFacts({
        pages,
        findings,
        auditedUrls: read,
        comparison: READY,
        coverage: { pagesKnown: 39, pagesWithImpressions: 2 },
      }),
    );
    const click = buildYourPages(
      withFacts({
        pages,
        findings,
        auditedUrls: read,
        comparison: READY,
        coverage: { pagesKnown: 10, pagesWithImpressions: 9 },
      }),
    );
    expect(reachability.rows[0]?.url).not.toBe(click.rows[0]?.url);
  });

  it("falls back to worst defect first when no diagnosis backs an order", () => {
    const view = buildYourPages(withFacts({ pages, findings, auditedUrls: read }));
    expect(view.ordering).toBeNull();
    expect(view.rows[0]?.worst).toBe("critical");
    // The clean page sorts last rather than being dropped.
    expect(view.rows.map((row) => row.url)).toContain("/working");
  });

  it("says why each page sits where it does", () => {
    const view = buildYourPages(
      withFacts({
        pages,
        findings,
        auditedUrls: read,
        comparison: READY,
        coverage: { pagesKnown: 39, pagesWithImpressions: 2 },
      }),
    );
    for (const row of view.rows) expect(row.reason.length).toBeGreaterThan(20);
    expect(view.rows[0]?.reason).toMatch(/never shown/i);
  });

  it("orders identically named pages predictably rather than by chance", () => {
    const view = buildYourPages(withFacts({ pages: [page("/b"), page("/a")], findings: [] }));
    expect(view.rows.map((row) => row.url)).toEqual(["/a", "/b"]);
  });
});

describe("the honesty invariant", () => {
  it("says the audit has never run rather than reporting zero pages read", () => {
    const view = buildYourPages(withFacts({ pages: [page("/a", { impressions: 5 })] }));
    const read = view.tiles.find((tile) => tile.label === "Pages read");
    expect(read?.value).toBeNull();
    expect(read?.missingReason).toMatch(/never run/i);
  });

  it("reports a real zero once the audit has run", () => {
    const view = buildYourPages(
      withFacts({ lastObservedAt: NOW, observedPages: 12, failedPages: 0 }),
    );
    expect(view.tiles.find((tile) => tile.label === "Pages that would not open")?.value).toBe("0");
  });

  it("will not count pages Google has never shown when it has reported none", () => {
    const view = buildYourPages(withFacts({ lastObservedAt: NOW, pages: [] }));
    const tile = view.tiles.find((tile) => tile.label === "Never shown by Google");
    expect(tile?.value).toBeNull();
    expect(tile?.missingReason).toMatch(/reported no pages/i);
  });

  it("counts a page with a stored zero impressions as never shown", () => {
    const view = buildYourPages(
      withFacts({ lastObservedAt: NOW, pages: [page("/a"), page("/b", { impressions: 3 })] }),
    );
    expect(view.tiles.find((tile) => tile.label === "Never shown by Google")?.value).toBe("1");
  });

  it("refuses to order by a constraint it could not establish", () => {
    // Coverage present but the comparison is not ready, and the reverse.
    expect(
      buildYourPages(withFacts({ coverage: { pagesKnown: 39, pagesWithImpressions: 0 } })).ordering,
    ).toBeNull();
    expect(buildYourPages(withFacts({ comparison: READY })).ordering).toBeNull();
  });

  it("dates the audit rather than presenting a stale read as current", () => {
    expect(buildYourPages(withFacts({ lastObservedAt: NOW })).asOf).toBe(NOW);
    expect(buildYourPages(withFacts({})).asOf).toBeNull();
  });
});

describe("the status line, written as a consequence", () => {
  it("leads with pages that are badly broken", () => {
    const view = buildYourPages(
      withFacts({
        pages: [page("/a")],
        findings: [finding({ pages: [{ url: "/a", detail: "no title" }] })],
      }),
    );
    expect(view.status.tone).toBe("danger");
    expect(view.status.text).toMatch(/badly broken/i);
  });

  it("says nothing needs you when nothing does", () => {
    const view = buildYourPages(
      withFacts({ lastObservedAt: NOW, pages: [page("/a")], auditedUrls: ["/a"] }),
    );
    expect(view.status).toEqual({ text: "Nothing needs you here", tone: "positive" });
  });
});

describe("the tabs", () => {
  it("counts the pages and the queue separately", () => {
    const source = {
      id: "a",
      kind: "recommendation" as const,
      categoryId: "pages" as const,
      title: "A finding",
      targetUrl: null,
      storedState: "proposed",
      fingerprint: null,
      severity: null,
      linkedChangeId: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const view = buildYourPages(
      withFacts({
        pages: [page("/a"), page("/b")],
        queueSources: [source, { ...source, id: "done", storedState: "applied" }],
      }),
    );
    const tabs = Object.fromEntries(view.tabs.map((tab) => [tab.id, tab.count]));
    expect(tabs["pages"]).toBe(2);
    expect(tabs["suggestions"]).toBe(1);
    expect(tabs["history"]).toBe(1);
  });
});

describe("defects an adversarial review found before this shipped", () => {
  it("still shows a stored finding on a page Search Console did not report", () => {
    // The rows used to come only from the search window, so a finding on a page
    // outside it vanished and the page printed a green all-clear beside it. The
    // audit deliberately reads pages the window does not contain.
    const view = buildYourPages(
      withFacts({
        lastObservedAt: NOW,
        observedPages: 4,
        pages: [page("/home", { impressions: 40 })],
        auditedUrls: ["/home", "/services", "/contact"],
        findings: [
          finding({
            pages: [
              { url: "/services", detail: "no title" },
              { url: "/contact", detail: "no title" },
            ],
          }),
        ],
      }),
    );
    expect(view.rows.map((row) => row.url).sort()).toEqual(["/contact", "/home", "/services"]);
    expect(view.status.tone).toBe("danger");
    expect(view.tiles.find((tile) => tile.label === "Pages with something wrong")?.value).toBe("2");
  });

  it("says an unreported page has no counts rather than printing zeros", () => {
    const view = buildYourPages(
      withFacts({
        lastObservedAt: NOW,
        pages: [],
        auditedUrls: ["/services"],
        findings: [finding({ pages: [{ url: "/services", detail: "no title" }] })],
      }),
    );
    const row = view.rows.find((entry) => entry.url === "/services");
    expect(row?.reported).toBe(false);
    expect(row?.reason).toMatch(/did not report this page/i);
  });

  it("never calls a page the audit has not read clean", () => {
    // The audit stops at its own page limit; the window does not. Past that
    // limit every page used to be declared "nothing is wrong with this page".
    const view = buildYourPages(
      withFacts({
        lastObservedAt: NOW,
        observedPages: 1,
        pages: [page("/audited", { impressions: 10 }), page("/beyond-cap", { impressions: 10 })],
        auditedUrls: ["/audited"],
      }),
    );
    const beyond = view.rows.find((row) => row.url === "/beyond-cap");
    expect(beyond?.audited).toBe(false);
    expect(beyond?.reason).toMatch(/has not read this page yet/i);
    expect(beyond?.reason).not.toMatch(/nothing is wrong/i);
  });

  it("refuses an all-clear while pages remain unread", () => {
    const view = buildYourPages(
      withFacts({
        lastObservedAt: NOW,
        pages: [page("/a", { impressions: 10 })],
        auditedUrls: [],
      }),
    );
    expect(view.status.text).toMatch(/never read/i);
    expect(view.status.tone).not.toBe("positive");
  });

  it("refuses an all-clear before the audit has ever run", () => {
    const view = buildYourPages(
      withFacts({ pages: [page("/a", { impressions: 4000, clicks: 3 })] }),
    );
    expect(view.status.text).toBe("Nothing has been read yet");
  });

  it("ranks by the impression count it quotes, not just by alphabet", () => {
    // The click branch printed "shown 500000 times" beside a key that ignored
    // impressions, so a page shown once outranked it on alphabetical order.
    const view = buildYourPages(
      withFacts({
        lastObservedAt: NOW,
        comparison: READY,
        coverage: { pagesKnown: 10, pagesWithImpressions: 9 },
        pages: [
          page("/apple-tiny", { impressions: 1, clicks: 0 }),
          page("/zebra-huge", { impressions: 500_000, clicks: 0 }),
        ],
        auditedUrls: ["/apple-tiny", "/zebra-huge"],
      }),
    );
    expect(view.rows[0]?.url).toBe("/zebra-huge");
  });

  it("keeps severity in the order when nothing has been shown", () => {
    const view = buildYourPages(
      withFacts({
        lastObservedAt: NOW,
        comparison: READY,
        coverage: { pagesKnown: 39, pagesWithImpressions: 0 },
        pages: [page("/a-clean"), page("/z-critical")],
        auditedUrls: ["/a-clean", "/z-critical"],
        findings: [finding({ pages: [{ url: "/z-critical", detail: "no title" }] })],
      }),
    );
    expect(view.rows[0]?.url).toBe("/z-critical");
  });

  it("does not flatten every busy page into one tie", () => {
    const view = buildYourPages(
      withFacts({
        lastObservedAt: NOW,
        pages: [page("/a-1000", { impressions: 1000 }), page("/z-5m", { impressions: 5_000_000 })],
        auditedUrls: ["/a-1000", "/z-5m"],
        findings: [
          finding({
            pages: [
              { url: "/a-1000", detail: "no title" },
              { url: "/z-5m", detail: "no title" },
            ],
          }),
        ],
      }),
    );
    expect(view.rows[0]?.url).toBe("/z-5m");
  });

  it("reports no fixes counted rather than zero when no property is selected", () => {
    const view = buildYourPages(withFacts({ fixesLive: null }));
    const tile = view.tiles.find((entry) => entry.label === "Fixes live now");
    expect(tile?.value).toBeNull();
    expect(tile?.missingReason).toMatch(/no property is selected/i);
  });

  it("names the property the rows belong to", () => {
    expect(buildYourPages(withFacts({})).property).toBe("trumoveinc.com");
  });
});

describe("naming what the audit has never run", () => {
  it("states that the audit has never run, with what it costs", () => {
    const view = buildYourPages(withFacts({ lastObservedAt: null }));
    expect(view.neverRunNotice).toContain("never run");
    expect(view.neverRunNotice).toContain("100");
    expect(view.waitingOn.join(" ")).toContain("page audit");
  });

  it("says nothing once the audit has run", () => {
    expect(buildYourPages(withFacts({ lastObservedAt: NOW })).neverRunNotice).toBeNull();
  });

  it("says nothing about prerequisites once every one this page can see is met", () => {
    const view = buildYourPages(
      withFacts({ lastObservedAt: NOW, comparison: READY, sessions: 40 }),
    );
    expect(view.waitingOn).toEqual([]);
  });

  it("never puts a rule id on screen", () => {
    const view = buildYourPages(withFacts({ lastObservedAt: null }));
    for (const assignment of RULE_ASSIGNMENTS) {
      expect(`${view.neverRunNotice} ${view.waitingOn.join(" ")}`).not.toContain(assignment.rule);
    }
  });
});

describe("naming why orphan detection could not run", () => {
  it("says why detection could not run, rather than staying silent", () => {
    const view = buildYourPages(
      withFacts({ orphanBailReason: "no home page is among the pages the audit read" }),
    );
    expect(view.orphanNote).toContain("Orphan detection could not run");
    expect(view.orphanNote).toContain("no home page");
  });

  it("says nothing when detection ran, whether or not it found an orphan", () => {
    expect(buildYourPages(withFacts({ orphanBailReason: null })).orphanNote).toBeNull();
  });
});
