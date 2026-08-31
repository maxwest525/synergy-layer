import { describe, expect, it } from "vitest";

import { mergeGuidance, rankKnowledgeEntries } from "./knowledge-retrieval.server";
import type { RetrievedKnowledgeEntry } from "./knowledge-retrieval.server";

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

/**
 * The early return that deleted half the function.
 *
 * `retrieveKnowledgeGuidance` returned governed handbook chunks and stopped,
 * whenever any governed version was active. On this tenant 18 were active, so
 * `knowledge_entries` was never read: every research entry the operator had
 * captured was visible on /knowledge and unreachable by the agents that write
 * proposals. These pin the merge so neither source can silently disappear.
 */
describe("mergeGuidance keeps both knowledge sources reachable", () => {
  const g = (id: string, score: number): RetrievedKnowledgeEntry => ({
    id,
    collectionKey: "kb.playbooks",
    title: `handbook ${id}`,
    body: "doctrine",
    sourceRef: null,
    tags: [],
    excerpt: "doctrine",
    score,
  });
  const e = (id: string, score: number): RetrievedKnowledgeEntry => ({
    id,
    collectionKey: "kb.research",
    title: `research ${id}`,
    body: "captured",
    sourceRef: "https://example.com",
    tags: [],
    excerpt: "captured",
    score,
  });

  it("never lets a large handbook crowd out every research entry", () => {
    const merged = mergeGuidance(
      [g("a", 99), g("b", 98), g("c", 97), g("d", 96), g("e", 95), g("f", 94)],
      [e("x", 10)],
      6,
    );
    expect(merged.some((entry) => entry.collectionKey === "kb.research")).toBe(true);
  });

  it("returns entries alone when no governed version is active", () => {
    const merged = mergeGuidance([], [e("x", 10), e("y", 9)], 8);
    expect(merged.map((entry) => entry.id)).toEqual(["x", "y"]);
  });

  it("returns the handbook alone when there are no entries", () => {
    const merged = mergeGuidance([g("a", 5)], [], 8);
    expect(merged.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("orders by score across both sources", () => {
    const merged = mergeGuidance([g("a", 5)], [e("x", 50)], 4);
    expect(merged[0]?.id).toBe("x");
  });

  it("respects the limit", () => {
    const merged = mergeGuidance([g("a", 9), g("b", 8)], [e("x", 7), e("y", 6)], 3);
    expect(merged).toHaveLength(3);
  });

  it("returns nothing for a zero limit rather than everything", () => {
    expect(mergeGuidance([g("a", 9)], [e("x", 7)], 0)).toEqual([]);
  });
});
