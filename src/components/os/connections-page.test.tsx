// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionFacts } from "@/lib/connections";

// The page reads through one server function and one router link; neither is
// the subject here.
const load = vi.hoisted(() => vi.fn());
const useQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => load }));
// Mocked so the server function module, and the middleware it builds at import
// time, never enter the browser test.
vi.mock("@/lib/connections.functions", () => ({ getConnectionFacts: load }));
vi.mock("@tanstack/react-query", () => ({ useQuery }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-operator-session", () => ({ useOperatorSession: () => ({ signedIn: true }) }));

const { ConnectionsPage } = await import("./connections-page");

function show(data: readonly ConnectionFacts[]) {
  useQuery.mockReturnValue({ data, isPending: false, error: null });
  render(<ConnectionsPage />);
}

function facts(key: string, overrides: Partial<ConnectionFacts> = {}): ConnectionFacts {
  return { key, configured: true, storedRows: 0, findings: 0, ...overrides };
}

beforeEach(() => {
  useQuery.mockReset();
  load.mockReset();
});

describe("the question this page exists to answer", () => {
  it("names the connections that collect and reach nobody", () => {
    show([
      facts("dataforseo", { storedRows: 412 }),
      facts("umami", { storedRows: 30 }),
      facts("google_search_console", { storedRows: 900, findings: 14 }),
    ]);
    expect(screen.getByText(/Collected, and reaching nobody/i)).toBeInTheDocument();
    expect(screen.getByText(/DataForSEO, Umami/)).toBeInTheDocument();
  });

  it("says it is a wiring gap rather than a broken tool", () => {
    show([facts("dataforseo", { storedRows: 412 })]);
    expect(screen.getByText(/wiring gap, not a fault in the tool/i)).toBeInTheDocument();
  });

  it("shows no banner at all when everything reaches the operator", () => {
    show([facts("google_search_console", { storedRows: 900, findings: 14 })]);
    expect(screen.queryByText(/Collected, and reaching nobody/i)).not.toBeInTheDocument();
  });

  it("puts the costly silence at the top of the list", () => {
    show([
      facts("umami", { configured: false }),
      facts("dataforseo", { storedRows: 412 }),
      facts("google_search_console", { storedRows: 900, findings: 14 }),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("DataForSEO");
    expect(items.at(-1)?.textContent).toContain("Google Search Console");
  });
});

describe("the honesty invariant", () => {
  it("says the read failed rather than rendering an empty estate", () => {
    useQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new Error("the counts could not be read"),
    });
    render(<ConnectionsPage />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });

  it("says it is still counting rather than showing zeroes", () => {
    useQuery.mockReturnValue({ data: undefined, isPending: true, error: null });
    render(<ConnectionsPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/counting/i);
  });

  it("tells a credential with no code behind it apart from an unrun one", () => {
    show([facts("google_ads"), facts("pagespeed_insights")]);
    const ads = screen.getByText("Google Ads").closest("li");
    expect(ads?.textContent).toMatch(/nothing in this system calls it/i);
    const speed = screen.getByText("PageSpeed Insights").closest("li");
    expect(speed?.textContent).toMatch(/nothing has been stored/i);
  });
});

describe("what the page is allowed to do", () => {
  it("offers no verb that writes", () => {
    show([facts("dataforseo", { storedRows: 412 })]);
    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent ?? "").not.toMatch(/approve|apply|publish|connect|disconnect|run/i);
    }
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("links to the registry rather than duplicating it", () => {
    show([facts("dataforseo", { storedRows: 412 })]);
    expect(screen.getByRole("link", { name: /Full registry/i })).toHaveAttribute(
      "href",
      "/capabilities/registry",
    );
  });
});
