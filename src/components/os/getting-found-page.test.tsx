// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildGettingFound, type GettingFoundFacts } from "@/lib/getting-found";
import type { PeriodComparison } from "@/lib/search-console";

// The page only ever reads through this hook, and the router is not the subject
// here, so both are replaced with the smallest thing that renders.
const useGettingFound = vi.hoisted(() => vi.fn());
vi.mock("./getting-found-facts", () => ({ useGettingFound }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

const { GettingFoundPage } = await import("./getting-found-page");

// The suggestion cards on this page now run mutations through react-query, so
// every render needs a client, same as the card's own test.
function render(ui: React.ReactElement) {
  return rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

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

function facts(overrides: Partial<GettingFoundFacts> = {}): GettingFoundFacts {
  return {
    now: NOW,
    property: "trumoveinc.com",
    comparison: READY,
    latestDate: "2026-08-17",
    queries: [],
    pages: [],
    queueSources: [],
    coverage: null,
    sessions: null,
    approvedKeywords: 0,
    ...overrides,
  };
}

function show(overrides: Partial<GettingFoundFacts> = {}) {
  useGettingFound.mockReturnValue({
    view: buildGettingFound(facts(overrides)),
    isPending: false,
    error: null,
  });
  render(<GettingFoundPage />);
}

/** The tile card carrying one label, so an assertion cannot drift onto a tab count. */
function tile(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const card = heading.parentElement;
  if (!card) throw new Error(`no card around ${label}`);
  return card;
}

function source(id: string, rule?: string) {
  return {
    id,
    kind: "recommendation" as const,
    categoryId: "search" as const,
    title: `Finding ${id}`,
    targetUrl: null,
    storedState: "proposed",
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...(rule === undefined ? {} : { rule }),
  };
}

beforeEach(() => {
  useGettingFound.mockReset();
});

describe("the honesty invariant, on screen", () => {
  it("renders the reason a tile is empty, never a zero", () => {
    show({
      property: null,
      comparison: { status: "insufficient", availableDays: 0, requiredDays: 56, latestDate: null },
    });
    // Every one of the four tiles says why it is empty.
    expect(screen.getAllByText(/No Search Console property is selected/)).toHaveLength(4);
    expect(within(tile("People who clicked")).queryByText("0")).not.toBeInTheDocument();
  });

  it("renders a measured zero as a zero", () => {
    // A stored zero is a fact and has to look like one.
    show({
      comparison: {
        ...READY,
        current: { ...READY.current, clicks: 0 },
        change: { ...READY.change, clicksPercent: -100 },
      },
    });
    expect(within(tile("People who clicked")).getByText("0")).toBeInTheDocument();
  });

  it("does not multiply the click-through rate twice", () => {
    // `ctr` is a fraction and `ctrPoints` is already in points. Rendering both
    // the same way is the obvious bug.
    show();
    expect(screen.getByText("3.8%")).toBeInTheDocument();
    expect(screen.getByText(/1\.1 points/)).toBeInTheDocument();
  });

  it("reads a falling position as an improvement", () => {
    show();
    expect(screen.getByText(/0\.3 better/)).toBeInTheDocument();
  });
});

describe("leading with the diagnosis", () => {
  const unseen = { pagesKnown: 39, pagesWithImpressions: 0 };

  it("states what is holding the site back before ranking anything", () => {
    show({
      coverage: unseen,
      queueSources: [source("a", "weak_ctr_page"), source("b", "zero_impression_page")],
    });
    expect(screen.getByText(/What is actually holding you back/i)).toBeInTheDocument();
    expect(screen.getByText(/39/)).toBeInTheDocument();
  });

  it("parks the rest below a divider instead of hiding them", () => {
    show({
      coverage: unseen,
      queueSources: [source("a", "weak_ctr_page"), source("b", "zero_impression_page")],
    });
    // Once in the banner's count, once as the divider above the parked group.
    expect(screen.getAllByText(/not today.s problem/i)).toHaveLength(2);
    expect(screen.getByText("Finding a")).toBeInTheDocument();
    expect(screen.getByText("Finding b")).toBeInTheDocument();
  });

  it("draws no divider when nothing justifies one", () => {
    show({ queueSources: [source("a"), source("b")] });
    expect(screen.queryByText(/not today.s problem/i)).not.toBeInTheDocument();
  });
});

describe("what the page is allowed to do", () => {
  it("offers no verb that writes: every action opens a review screen", () => {
    show({ queueSources: [source("a")] });
    // The tabs are the only controls on the page, and they only switch views.
    for (const control of [...screen.getAllByRole("tab"), ...screen.getAllByRole("link")]) {
      expect(control.textContent ?? "").not.toMatch(/approve|apply|publish|ignore/i);
    }
    expect(screen.getByRole("link", { name: "Review it" })).toHaveAttribute(
      "href",
      "/recommendations/$id",
    );
  });
});

describe("the tabs", () => {
  it("shows the searches behind the totals when asked", async () => {
    useGettingFound.mockReturnValue({
      view: buildGettingFound(facts({ queries: [{ label: "movers near me", clicks: 41 }] })),
      isPending: false,
      error: null,
    });
    render(<GettingFoundPage />);

    expect(screen.queryByText("movers near me")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Searches/ }));
    expect(screen.getByText("movers near me")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
  });

  it("says why a list is empty rather than showing nothing", async () => {
    show();
    await userEvent.click(screen.getByRole("tab", { name: /Pages/ }));
    expect(screen.getByText(/Run the Search Console observation/)).toBeInTheDocument();
  });
});

describe("what your traffic can answer", () => {
  it("shows the section collapsed, revealing the line and each beyond entry on expand", async () => {
    show({ coverage: { pagesKnown: 48, pagesWithImpressions: 9 } });

    const trigger = screen.getByRole("button", { name: /What your traffic can answer/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Your site earned/)).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Your site earned/)).toBeInTheDocument();
    expect(screen.getByText(/internal links first/)).toBeInTheDocument();
    // A beyond_current_volume rule's plain-words name, not its id.
    expect(screen.getByText(/Position-slip warnings/)).toBeInTheDocument();
    expect(screen.queryByText(/declining_position/)).not.toBeInTheDocument();
  });

  it("renders nothing when the totals it needs are not stored", () => {
    show({ coverage: null });
    expect(screen.queryByText(/What your traffic can answer/i)).not.toBeInTheDocument();
  });
});

describe("when the read fails", () => {
  it("says so instead of rendering an empty page that looks measured", () => {
    useGettingFound.mockReturnValue({
      view: null,
      isPending: false,
      error: new Error("the snapshots table could not be read"),
    });
    render(<GettingFoundPage />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });
});
