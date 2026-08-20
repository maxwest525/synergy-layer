// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildYourPages, type PageEvidence, type YourPagesFacts } from "@/lib/your-pages";
import type { CheckFinding } from "@/lib/page-checks";
import type { PeriodComparison } from "@/lib/search-console";

// The page only ever reads through this hook, and the router is not the subject
// here, so both are replaced with the smallest thing that renders.
const useYourPages = vi.hoisted(() => vi.fn());
vi.mock("./your-pages-facts", () => ({ useYourPages }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { YourPagesPage } = await import("./your-pages-page");

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

function facts(overrides: Partial<YourPagesFacts> = {}): YourPagesFacts {
  return {
    now: NOW,
    property: "trumoveinc.com",
    pages: [],
    findings: [],
    queueSources: [],
    observedPages: 0,
    failedPages: 0,
    lastObservedAt: null,
    fixesLive: 0,
    comparison: READY,
    coverage: null,
    sessions: null,
    ...overrides,
  };
}

function show(overrides: Partial<YourPagesFacts> = {}) {
  useYourPages.mockReturnValue({
    view: buildYourPages(facts(overrides)),
    isPending: false,
    error: null,
  });
  render(<YourPagesPage />);
}

/** The tile card carrying one label, so an assertion cannot drift onto a tab count. */
function tile(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const card = heading.parentElement;
  if (!card) throw new Error(`no card around ${label}`);
  return card;
}

beforeEach(() => {
  useYourPages.mockReset();
});

describe("the honesty invariant, on screen", () => {
  it("says the audit has not run rather than showing a zero", () => {
    show({ pages: [page("/a", { impressions: 5 })] });
    expect(within(tile("Pages read")).queryByText("0")).not.toBeInTheDocument();
    expect(screen.getAllByText(/has not run yet/i).length).toBeGreaterThan(0);
  });

  it("shows a measured zero once the audit has run", () => {
    show({ lastObservedAt: NOW, observedPages: 12, failedPages: 0 });
    expect(within(tile("Pages that would not open")).getByText("0")).toBeInTheDocument();
  });

  it("dates the read rather than presenting a stale one as current", () => {
    show({ lastObservedAt: "2026-08-17T09:00:00.000Z" });
    expect(screen.getByText(/last read on 2026-08-17/)).toBeInTheDocument();
  });
});

describe("the page list, which is the point of this page", () => {
  const pages = [page("/seen-and-broken", { impressions: 400, clicks: 0 }), page("/never-seen")];
  const findings = [
    finding({
      pages: [
        { url: "/seen-and-broken", detail: "no title tag" },
        { url: "/never-seen", detail: "no title tag" },
      ],
    }),
  ];

  it("lists a page with its own defects, not a defect with its pages", async () => {
    show({ pages, findings, lastObservedAt: NOW });
    await userEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    expect(screen.getByText("/seen-and-broken")).toBeInTheDocument();
    expect(screen.getAllByText("Missing title").length).toBe(2);
    expect(screen.getAllByText(/no title tag/).length).toBe(2);
  });

  it("says why the order is what it is, when a diagnosis backs it", async () => {
    show({
      pages,
      findings,
      lastObservedAt: NOW,
      coverage: { pagesKnown: 39, pagesWithImpressions: 1 },
    });
    await userEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    expect(screen.getByText(/Ordered by what Google has never shown/i)).toBeInTheDocument();
  });

  it("says nothing about ordering when nothing justifies a claim", async () => {
    show({ pages, findings, lastObservedAt: NOW });
    await userEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    expect(screen.queryByText(/^Ordered by/i)).not.toBeInTheDocument();
  });

  it("gives every page a reason for its position", async () => {
    show({
      pages,
      findings,
      lastObservedAt: NOW,
      coverage: { pagesKnown: 39, pagesWithImpressions: 1 },
    });
    await userEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    expect(screen.getByText(/never shown this page/i)).toBeInTheDocument();
  });

  it("says why the list is empty rather than showing nothing", async () => {
    show({ lastObservedAt: NOW });
    await userEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    expect(screen.getByText(/Run the Search Console observation/)).toBeInTheDocument();
  });
});

describe("what the page is allowed to do", () => {
  it("offers no verb that writes", () => {
    show({
      lastObservedAt: NOW,
      pages: [page("/a", { changeId: "chg-1", changeState: "proposed" })],
    });
    for (const control of [...screen.getAllByRole("tab"), ...screen.getAllByRole("link")]) {
      expect(control.textContent ?? "").not.toMatch(/approve|apply|publish|ignore/i);
    }
  });

  it("routes an existing fix to the review screen that records the decision", async () => {
    show({
      lastObservedAt: NOW,
      pages: [page("/a", { changeId: "chg-1", changeState: "proposed" })],
    });
    await userEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    expect(screen.getByRole("link", { name: /Review the fix/ })).toHaveAttribute(
      "href",
      "/changes/$id",
    );
  });

  it("keeps the metered audit on the workspace, never starting it from here", () => {
    show({ lastObservedAt: NOW });
    // The audit reads up to 100 pages through Firecrawl. This page links to the
    // button; it does not become one.
    const link = screen.getByRole("link", { name: /Run the audit/ });
    expect(link).toHaveAttribute("href", "/pages/tools");
    expect(screen.queryByRole("button", { name: /Run the audit/ })).not.toBeInTheDocument();
  });
});

describe("when the read fails", () => {
  it("says so instead of rendering an empty page that looks measured", () => {
    useYourPages.mockReturnValue({
      view: null,
      isPending: false,
      error: new Error("the observations table could not be read"),
    });
    render(<YourPagesPage />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });
});
