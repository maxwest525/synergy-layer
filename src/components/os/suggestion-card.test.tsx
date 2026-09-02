// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildQueue, type QueueSource } from "@/lib/suggestion-queue";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
// Only `useServerFn` is stubbed: `createMiddleware`, which the imported
// `.functions` modules call at module scope through the generated
// auth-middleware, must stay real or importing them throws before any test
// runs. Every hook hands back the same recording fn, resolving the shape the
// draft path reads, so a test can assert what a click actually sent.
const serverFn = vi.hoisted(() => vi.fn(async () => ({ changeRequest: { id: "cr1" } })));
const useServerFn = vi.hoisted(() => vi.fn(() => serverFn));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useServerFn,
}));

const { SuggestionCard } = await import("./suggestion-card");

const NOW = "2026-08-21T12:00:00.000Z";

function source(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): QueueSource {
  return {
    kind: "recommendation",
    categoryId: "search",
    title: "Title does not say Tulsa",
    targetUrl: "https://trumoveinc.com/corporate-relocation",
    storedState: "proposed",
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function show(overrides: Partial<QueueSource> & Pick<QueueSource, "id">) {
  const queue = buildQueue([source(overrides)], NOW);
  const item = [...queue.open, ...queue.ignored, ...queue.done][0];
  if (!item) throw new Error("the fixture produced no queue item");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SuggestionCard item={item} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useServerFn.mockClear();
  serverFn.mockClear();
  toastSuccess.mockClear();
});

describe("a card an operator can act on", () => {
  it("offers to set an open suggestion aside", () => {
    show({ id: "r1" });
    expect(screen.getByRole("button", { name: /Not now/ })).toBeEnabled();
  });

  it("offers to put an ignored suggestion back", () => {
    show({ id: "r1", storedState: "rejected" });
    expect(screen.getByRole("button", { name: /Put it back/ })).toBeEnabled();
  });

  it("keeps the review link that already existed", () => {
    show({ id: "r1" });
    expect(screen.getByRole("link", { name: /Review it/ })).toBeInTheDocument();
  });
});

describe("a verb that is not legal is absent, never disabled", () => {
  it("offers to set a page check aside, now that the decision is stored", () => {
    show({ id: "audit:missing_title", kind: "audit", severity: "critical" });
    expect(screen.getByRole("button", { name: /Not now/ })).toBeEnabled();
  });

  it("renders no redraft control where no redraft path exists", () => {
    // The crawl-directives lane has no redraft function; the two wording
    // lanes do since CODE-4.
    show({
      id: "c1",
      kind: "change",
      proposalType: "site.crawl_directives",
      storedState: "proposed",
    });
    expect(screen.queryByRole("button", { name: /Write it again/ })).not.toBeInTheDocument();
  });

  it("never renders a disabled control at rest", () => {
    show({ id: "r1" });
    for (const button of screen.queryAllByRole("button")) {
      expect(button).toBeEnabled();
    }
  });
});

describe("a change card's ignore is honestly labeled, because rejecting is terminal", () => {
  it("labels it Reject, not Not now, and warns it cannot be undone", () => {
    show({ id: "c1", kind: "change", proposalType: "page_metadata", storedState: "proposed" });
    expect(screen.queryByRole("button", { name: /Not now/ })).not.toBeInTheDocument();
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(reject).toHaveAccessibleDescription(/cannot be undone/i);
    expect(reject).not.toHaveAccessibleDescription(/put it back/i);
  });

  it("never renders the reversible set-aside sentence on a change card", () => {
    show({ id: "c1", kind: "change", proposalType: "page_metadata", storedState: "proposed" });
    expect(screen.queryByText(/you can put it back at any time/i)).not.toBeInTheDocument();
  });

  it("keeps the reversible label and copy on a recommendation card", () => {
    show({ id: "r1" });
    const notNow = screen.getByRole("button", { name: "Not now" });
    expect(notNow).toHaveAccessibleDescription(/put it back/i);
  });

  it("keeps the reversible label and copy on an audit card", () => {
    show({ id: "audit:missing_title", kind: "audit", severity: "critical" });
    const notNow = screen.getByRole("button", { name: "Not now" });
    expect(notNow).toHaveAccessibleDescription(/put it back/i);
  });

  it("tells the operator the reject closed the proposal for good, not that it can be put back", async () => {
    show({ id: "c1", kind: "change", proposalType: "page_metadata", storedState: "proposed" });
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/closed for good/i));
  });

  it("keeps the reversible toast on a recommendation's set-aside", async () => {
    show({ id: "r1" });
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/put it back from the ignored list/i),
    );
  });
});

describe("what a verb costs is on the verb", () => {
  it("says the redraft spends an AI call before it is clicked", () => {
    show({ id: "c1", kind: "change", proposalType: "page_wording", storedState: "proposed" });
    expect(screen.getByRole("button", { name: /Write it again/ })).toHaveAccessibleDescription(
      /one AI call/i,
    );
  });
});

describe("drafting the fix from the card", () => {
  it("offers the draft on a rule finding with a governed fix, with its cost stated", () => {
    show({ id: "r1", rule: "weak_ctr_page" });
    expect(screen.getByRole("button", { name: /Draft the fix/ })).toHaveAccessibleDescription(
      /one page read and one AI call/i,
    );
  });

  it("offers no draft where the rule has no governed fix", () => {
    show({ id: "r1", rule: "some_rule_nobody_wired" });
    expect(screen.queryByRole("button", { name: /Draft the fix/ })).not.toBeInTheDocument();
  });
});

describe("drafting a site crawl fix from the card", () => {
  const finding = {
    id: "site:robots_blocks_site",
    kind: "audit",
    categoryId: "health",
    targetUrl: null,
    severity: "critical",
    rule: "robots_blocks_site",
  } as const;

  it("offers the draft on a site finding a governed lane fixes, priced as free", () => {
    show(finding);
    expect(screen.getByRole("button", { name: /Draft the fix/ })).toHaveAccessibleDescription(
      /costs nothing/i,
    );
  });

  it("sends the draft to the site scope, never to a page the finding does not name", async () => {
    show(finding);
    await userEvent.click(screen.getByRole("button", { name: /Draft the fix/ }));
    await waitFor(() => expect(serverFn).toHaveBeenCalled());
    expect(serverFn).toHaveBeenCalledWith({
      data: expect.objectContaining({ scope: "site", check: "robots_blocks_site" }),
    });
  });

  it("offers no draft on a site finding whose fix is still manual", () => {
    show({ ...finding, id: "site:sitemap_missing", rule: "sitemap_missing" });
    expect(screen.queryByRole("button", { name: /Draft the fix/ })).not.toBeInTheDocument();
  });
});
