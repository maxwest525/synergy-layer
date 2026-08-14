import { describe, expect, it } from "vitest";

import { rankKnowledgeEntries } from "./knowledge-retrieval.server";

const entries = [
  {
    id: "research-1",
    collectionKey: "kb.research",
    title: "Competitor title pattern",
    body: "Ranking competitors use location-specific service language.",
    sourceRef: "competitor-page:2026-08-14:https://example.com",
    tags: ["competitor-evidence", "title"],
  },
  {
    id: "playbook-1",
    collectionKey: "kb.playbooks",
    title: "Title and H1 voice",
    body: "Use plain language and preserve the TruMove brand name.",
    sourceRef: "brand-playbook.md#titles",
    tags: ["brand", "title", "h1"],
  },
  {
    id: "noise-1",
    collectionKey: "kb.best_practices",
    title: "Email deliverability",
    body: "Authenticate outbound mail.",
    sourceRef: "email-book.md",
    tags: ["email"],
  },
];

describe("deterministic knowledge retrieval", () => {
  it("ranks relevant guidance deterministically and preserves provenance", () => {
    const ranked = rankKnowledgeEntries(entries, "brand title h1 moving service", 2);
    expect(ranked.map((entry) => entry.id)).toEqual(["playbook-1", "research-1"]);
    expect(ranked[0]).toMatchObject({
      collectionKey: "kb.playbooks",
      sourceRef: "brand-playbook.md#titles",
    });
    expect(ranked[0]?.excerpt.length).toBeLessThanOrEqual(1200);
  });

  it("returns no unrelated entries and applies a hard result limit", () => {
    expect(rankKnowledgeEntries(entries, "canonical redirects", 8)).toEqual([]);
    expect(rankKnowledgeEntries(entries, "title", 1)).toHaveLength(1);
  });
});
