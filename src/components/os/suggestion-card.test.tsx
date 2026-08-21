// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildQueue, type QueueSource } from "@/lib/suggestion-queue";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
// Only `useServerFn` is stubbed: `createMiddleware`, which the imported
// `.functions` modules call at module scope through the generated
// auth-middleware, must stay real or importing them throws before any test
// runs.
const useServerFn = vi.hoisted(() => vi.fn(() => vi.fn()));
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
    show({ id: "c1", kind: "change", proposalType: "page_metadata", storedState: "proposed" });
    expect(screen.queryByRole("button", { name: /Write it again/ })).not.toBeInTheDocument();
  });

  it("never renders a disabled control at rest", () => {
    show({ id: "r1" });
    for (const button of screen.queryAllByRole("button")) {
      expect(button).toBeEnabled();
    }
  });
});

describe("what a verb costs is on the verb", () => {
  it("says the redraft spends an AI call before it is clicked", () => {
    show({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" });
    expect(screen.getByRole("button", { name: /Write it again/ })).toHaveAccessibleDescription(
      /one AI call/i,
    );
  });
});
