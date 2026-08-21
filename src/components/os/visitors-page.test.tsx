// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Ga4Row } from "@/lib/ga4-rule-checks";
import type { VisitorFacts } from "@/lib/visitors";

const load = vi.hoisted(() => vi.fn());
const useQuery = vi.hoisted(() => vi.fn());
const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => load }));
// Mocked so the server function module, and the middleware it builds at import
// time, never enter the browser test.
vi.mock("@/lib/visitors.functions", () => ({ getVisitorFacts: load }));
// The options object is passed through so `enabled` can be asserted rather
// than swallowed by the mock.
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => useQuery(options) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-operator-session", () => ({
  useOperatorSession: () => ({ signedIn: signedIn.value }),
}));

const { VisitorsPage } = await import("./visitors-page");

function row(pagePath: string, eventName: string, eventCount: number, sessions: number): Ga4Row {
  return {
    hostName: "trumoveinc.com",
    pagePath,
    eventName,
    eventCount,
    activeUsers: sessions,
    sessions,
  };
}

/** This property's real stored reading. */
function facts(overrides: Partial<VisitorFacts> = {}): VisitorFacts {
  return {
    property: "properties/536830122",
    windowStart: "2026-07-23",
    windowEnd: "2026-08-19",
    collectedAt: "2026-08-20T16:35:03.892Z",
    totalSessions: 124,
    rows: [
      row("/", "page_view", 256, 105),
      row("/", "lead_form_view", 21, 18),
      row("/", "generate_lead", 7, 7),
      row("/contact", "page_view", 34, 11),
    ],
    truncated: false,
    historyDays: 2,
    findings: 0,
    ...overrides,
  };
}

function show(data: VisitorFacts | null) {
  useQuery.mockReturnValue({ data, isPending: false, error: null });
  render(<VisitorsPage />);
}

beforeEach(() => {
  useQuery.mockReset();
  load.mockReset();
  signedIn.value = true;
});

describe("what the page reports", () => {
  it("leads with how many people came, not with a trend", () => {
    show(facts());
    expect(screen.getByText("124")).toBeInTheDocument();
    expect(screen.getByText(/about 4.4 a day/)).toBeInTheDocument();
  });

  it("separates what someone did from the browser loading a page", () => {
    show(facts());
    const actions = screen.getByRole("list", { name: /What visitors did/i });
    expect(actions.textContent).toContain("lead_form_view");
    expect(actions.textContent).toContain("generate_lead");
    expect(actions.textContent).not.toContain("page_view");
    expect(screen.getByText(/events Analytics records by itself/i)).toBeInTheDocument();
  });

  it("says which questions this much traffic cannot answer, and why", () => {
    show(facts());
    const answers = screen.getByRole("list", { name: /whether they can be answered/i });
    expect(answers.textContent).toContain("Did visits to a particular page go up or down?");
    expect(answers.textContent).toMatch(/oldest stored reading is 2 days old/i);
  });

  it("explains its own silence rather than implying an all-clear", () => {
    show(facts());
    expect(screen.getByText(/not the same as nothing being wrong/i)).toBeInTheDocument();
  });
});

describe("the honesty invariants", () => {
  it("says no reading is stored rather than reporting zero visitors", () => {
    show(null);
    expect(screen.getByText(/No analytics reading has been stored yet/i)).toBeInTheDocument();
    expect(screen.getByText(/absence of a reading/i)).toBeInTheDocument();
    // The distinction the whole rule exists for.
    expect(screen.queryByText(/visits over/)).not.toBeInTheDocument();
  });

  it("never clears in green while a question is out of reach", () => {
    show(facts());
    expect(screen.getByText(/of 4 questions answerable/i)).toBeInTheDocument();
    expect(screen.queryByText(/Every question here is answerable/i)).not.toBeInTheDocument();
  });

  it("marks a cut-short reading as partial rather than as a total", () => {
    show(facts({ truncated: true }));
    expect(screen.getByText(/cut this reading short/i)).toBeInTheDocument();
  });

  it("says the read failed rather than rendering an empty month", () => {
    useQuery.mockReturnValue({ data: undefined, isPending: false, error: new Error("no tenant") });
    render(<VisitorsPage />);
    expect(screen.getByText(/Analytics could not load/i)).toBeInTheDocument();
    // The way out survives the failure.
    expect(screen.getByRole("link", { name: /Analytics tools/i })).toBeInTheDocument();
  });

  it("tells a signed-out operator why rather than counting forever", () => {
    signedIn.value = false;
    useQuery.mockReturnValue({ data: undefined, isPending: true, error: null });
    render(<VisitorsPage />);
    expect(useQuery.mock.calls[0]?.[0]).toMatchObject({ enabled: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in to read/i)).toBeInTheDocument();
  });

  it("distinguishes still reading from nothing stored", () => {
    // `data` is legitimately null when no snapshot exists, so the loading
    // branch must key off isPending alone or the two states collapse.
    useQuery.mockReturnValue({ data: undefined, isPending: true, error: null });
    render(<VisitorsPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/Reading your stored analytics/i);
  });
});

describe("what the page is allowed to do", () => {
  it("offers no verb that spends money", () => {
    show(facts());
    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent ?? "").not.toMatch(/refresh|run|fetch|approve|apply/i);
    }
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("sends the metered work to the tools page", () => {
    show(facts());
    expect(screen.getByRole("link", { name: /Analytics tools/i })).toHaveAttribute(
      "href",
      "/ga4/tools",
    );
  });

  it("names its regions for a screen reader", () => {
    show(facts());
    expect(screen.getByRole("list", { name: /Pages by visits/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Who visits your site/i })).toBeInTheDocument();
  });
});
