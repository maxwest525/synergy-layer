import { describe, expect, it } from "vitest";

import { chunkKnowledgeSource } from "./chunking";

const markdown = `# SEO Manual

Opening context.

## Authority Science

Authority is capacity. Ranking is an observed outcome.

### Relevance Floor

Authority cannot rescue irrelevance.

## Measurement

Use dated evidence.`;

describe("knowledge source chunking", () => {
  it("preserves heading paths, order, provenance fields, and deterministic checksums", () => {
    const first = chunkKnowledgeSource({ sourceTitle: "SEO Manual", content: markdown });
    const second = chunkKnowledgeSource({ sourceTitle: "SEO Manual", content: markdown });

    expect(first).toEqual(second);
    expect(first.map((chunk) => chunk.ordinal)).toEqual(first.map((_chunk, index) => index));
    expect(first.find((chunk) => chunk.title === "Relevance Floor")?.headingPath).toEqual([
      "SEO Manual",
      "Authority Science",
      "Relevance Floor",
    ]);
    expect(first.every((chunk) => /^[a-f0-9]{64}$/.test(chunk.contentSha256))).toBe(true);
    expect(first.every((chunk) => chunk.body.trim().length > 0 && chunk.tokenEstimate > 0)).toBe(
      true,
    );
  });

  it("packs long sections into bounded non-empty chunks", () => {
    const content = `# Long Book\n\n## Dense Section\n\n${"Evidence sentence. ".repeat(120)}`;
    const chunks = chunkKnowledgeSource({ sourceTitle: "Long Book", content, maxChars: 320 });

    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((chunk) => chunk.body.length <= 320)).toBe(true);
    expect(chunks.every((chunk) => chunk.headingPath.at(-1) === "Dense Section")).toBe(true);
  });

  it("normalizes line endings and ignores empty heading-only sections", () => {
    const windows = "# Book\r\n\r\n## Empty\r\n\r\n## Real\r\n\r\nActual body.";
    const chunks = chunkKnowledgeSource({ sourceTitle: "Book", content: windows });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ title: "Real", body: "Actual body." });
  });
});
