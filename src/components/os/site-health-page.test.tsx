// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSiteHealth, type SiteHealthFacts, type StoredOutcome } from "@/lib/site-health";
import type { SiteFinding } from "@/lib/site-checks";

// The page only ever reads through this hook, and the router is not the subject
// here, so both are replaced with the smallest thing that renders.
const useSiteHealth = vi.hoisted(() => vi.fn());
vi.mock("./site-health-facts", () => ({ useSiteHealth }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { SiteHealthPage } = await import("./site-health-page");

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

function facts(overrides: Partial<SiteHealthFacts> = {}): SiteHealthFacts {
  return {
    now: NOW,
    property: "trumoveinc.com",
    siteFindings: [],
    siteObservedAt: NOW,
    outcomes: [],
    speed: [],
    queueSources: [],
    ...overrides,
  };
}

function show(overrides: Partial<SiteHealthFacts> = {}) {
  useSiteHealth.mockReturnValue({
    view: buildSiteHealth(facts(overrides)),
    isPending: false,
    error: null,
  });
  render(<SiteHealthPage />);
}

/** The tile card carrying one label, so an assertion cannot drift onto a tab count. */
function tile(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const card = heading.parentElement;
  if (!card) throw new Error(`no card around ${label}`);
  return card;
}

beforeEach(() => {
  useSiteHealth.mockReset();
});

describe("grading the fixes, on screen", () => {
  it("says whether a fix worked, in words rather than a stored enum", async () => {
    show({ outcomes: [outcome({ impressions: 400, clicks: 6 })] });
    await userEvent.click(screen.getByRole("tab", { name: /Did the fixes work/ }));
    expect(screen.getByText("It worked")).toBeInTheDocument();
    // The operator never sees the stored value.
    expect(screen.queryByText(/too_early|unmeasurable/)).not.toBeInTheDocument();
  });

  it("explains a verdict rather than asserting it", async () => {
    show({ outcomes: [outcome({ impressions: 140, clicks: 0 })] });
    await userEvent.click(screen.getByRole("tab", { name: /Did the fixes work/ }));
    expect(screen.getByText("No change yet")).toBeInTheDocument();
    expect(screen.getByText(/AI Overview|shown/i)).toBeInTheDocument();
  });

  it("shows a reading on an underived window as not graded, and names why", async () => {
    show({ outcomes: [outcome({ windowDays: 7 })] });
    await userEvent.click(screen.getByRole("tab", { name: /Did the fixes work/ }));
    expect(screen.getByText("Not graded")).toBeInTheDocument();
    expect(screen.getByText(/Nothing derives a 7 day window/i)).toBeInTheDocument();
    // And the page says it out loud above the list, not only per row.
    expect(screen.getByText(/stored at 7 days and not graded/i)).toBeInTheDocument();
  });

  it("opens the change a reading measured, never grading from here", async () => {
    show({ outcomes: [outcome()] });
    await userEvent.click(screen.getByRole("tab", { name: /Did the fixes work/ }));
    expect(screen.getByRole("link", { name: /Open the change/ })).toHaveAttribute(
      "href",
      "/changes/$id",
    );
  });

  it("says nothing has been measured rather than showing an empty grade", async () => {
    show({});
    await userEvent.click(screen.getByRole("tab", { name: /Did the fixes work/ }));
    expect(screen.getByText(/Nothing has been measured yet/i)).toBeInTheDocument();
  });
});

describe("the honesty invariant, on screen", () => {
  it("says the checks have not run rather than showing a zero", () => {
    show({ siteObservedAt: null });
    expect(within(tile("Crawl problems")).queryByText("0")).not.toBeInTheDocument();
    expect(screen.getAllByText(/have not run yet/i).length).toBeGreaterThan(0);
  });

  it("shows a measured zero once the checks have run", () => {
    show({});
    expect(within(tile("Crawl problems")).getByText("0")).toBeInTheDocument();
  });

  it("will not report a slowest page with no speed reading stored", () => {
    show({});
    expect(within(tile("Slowest page")).getByText(/no speed reading/i)).toBeInTheDocument();
  });

  it("dates the check rather than presenting a stale one as current", () => {
    show({ siteObservedAt: "2026-08-17T09:00:00.000Z" });
    expect(screen.getByText(/last checked on 2026-08-17/)).toBeInTheDocument();
  });
});

describe("the crawl evidence", () => {
  it("says what is wrong and what to do about it", async () => {
    show({ siteFindings: [crawl()] });
    await userEvent.click(screen.getByRole("tab", { name: /Crawl checks/ }));
    expect(screen.getByText("No sitemap found")).toBeInTheDocument();
    expect(screen.getByText("Publish a sitemap.")).toBeInTheDocument();
  });

  it("marks a finding nothing can fix automatically", async () => {
    show({ siteFindings: [crawl({ fixableByChangeKind: null })] });
    await userEvent.click(screen.getByRole("tab", { name: /Crawl checks/ }));
    expect(screen.getByText(/Fix this yourself/i)).toBeInTheDocument();
  });

  it("tells the two empty states apart", async () => {
    // "Nothing has been checked" and "no crawl problems" look identical if the
    // page renders one empty state for both.
    show({ siteObservedAt: null });
    await userEvent.click(screen.getByRole("tab", { name: /Crawl checks/ }));
    expect(screen.getByText(/Run the audit so robots.txt/i)).toBeInTheDocument();

    show({});
    await userEvent.click(screen.getAllByRole("tab", { name: /Crawl checks/ })[1]!);
    expect(screen.getByText(/Google can read robots.txt/i)).toBeInTheDocument();
  });
});

describe("what the page is allowed to do", () => {
  it("offers no verb that writes, on any tab", async () => {
    const source = {
      id: "a",
      kind: "audit" as const,
      categoryId: "health" as const,
      title: "A site check",
      targetUrl: null,
      storedState: "proposed",
      fingerprint: null,
      severity: "critical" as const,
      linkedChangeId: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    show({
      siteFindings: [crawl()],
      outcomes: [outcome()],
      queueSources: [source, { ...source, id: "done", storedState: "applied" }],
    });

    let checked = 0;
    for (const name of [/Suggestions/, /Did the fixes work/, /Crawl checks/, /History/]) {
      await userEvent.click(screen.getByRole("tab", { name }));
      const controls = [...screen.getAllByRole("tab"), ...screen.getAllByRole("link")];
      for (const control of controls) {
        expect(control.textContent ?? "").not.toMatch(/approve|apply|publish|ignore/i);
      }
      checked += controls.length;
    }
    // Proof the loop reached real rows rather than only the header.
    expect(checked).toBeGreaterThan(20);
  });

  it("keeps the metered speed run on the workspace", () => {
    show({});
    expect(screen.getByRole("link", { name: /Speed readings and runs/ })).toHaveAttribute(
      "href",
      "/measurement/tools",
    );
  });
});

describe("landing on a tab from a link", () => {
  it("opens the tab the route asked for", () => {
    // "Wait for the measurement window, then read the outcome" used to arrive
    // on Suggestions, which usually says nothing is waiting.
    useSiteHealth.mockReturnValue({
      view: buildSiteHealth(facts({ outcomes: [outcome()] })),
      isPending: false,
      error: null,
    });
    render(<SiteHealthPage initialTab="outcomes" />);
    expect(screen.getByText("It worked")).toBeInTheDocument();
  });

  it("still defaults to suggestions when the route asked for nothing", () => {
    show({ outcomes: [outcome()] });
    expect(screen.queryByText("It worked")).not.toBeInTheDocument();
  });
});

describe("when the read fails", () => {
  it("says so instead of rendering an empty page that looks measured", () => {
    useSiteHealth.mockReturnValue({
      view: null,
      isPending: false,
      error: new Error("the observations table could not be read"),
    });
    render(<SiteHealthPage />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });
});
