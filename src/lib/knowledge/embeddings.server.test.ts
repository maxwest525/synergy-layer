import { describe, expect, it, vi } from "vitest";

import { embedDocuments, embedQuery } from "./embeddings.server";

const vector = Array.from({ length: 768 }, (_value, index) => index / 768);

describe("Gemini knowledge embeddings", () => {
  it("embeds documents with the fixed model, dimensions, task type, and titles", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as { requests: unknown[] };
      return new Response(
        JSON.stringify({ embeddings: payload.requests.map(() => ({ values: vector })) }),
        { status: 200 },
      );
    });
    const result = await embedDocuments({
      apiKey: "secret",
      documents: [
        { title: "Authority Science", text: "Authority is capacity." },
        { title: "Ranking", text: "Ranking is an observed outcome." },
      ],
      fetcher,
    });

    expect(result).toHaveLength(2);
    expect(result.every((embedding) => embedding.length === 768)).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("models/gemini-embedding-001:batchEmbedContents");
    const body = JSON.parse(String(init?.body));
    expect(body.requests[0]).toMatchObject({
      model: "models/gemini-embedding-001",
      embedContentConfig: {
        taskType: "RETRIEVAL_DOCUMENT",
        title: "Authority Science",
        outputDimensionality: 768,
      },
    });
  });

  it("embeds queries with retrieval-query semantics", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ embedding: { values: vector } }), { status: 200 }),
    );
    const result = await embedQuery({ apiKey: "secret", query: "authority transfer", fetcher });

    expect(result).toHaveLength(768);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body.embedContentConfig).toEqual({
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    });
  });

  it("rejects malformed or wrong-sized vectors", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ embedding: { values: [1, 2, 3] } }), { status: 200 }),
    );

    await expect(embedQuery({ apiKey: "secret", query: "authority", fetcher })).rejects.toThrow(
      "768",
    );
  });

  it("preserves Google's safe quota detail when an embedding request fails", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            error: {
              code: 429,
              message: "Quota exceeded for embed_content_paid_tier_requests, limit: 0",
              status: "RESOURCE_EXHAUSTED",
            },
          }),
          { status: 429 },
        ),
    );

    await expect(embedQuery({ apiKey: "secret", query: "authority", fetcher })).rejects.toThrow(
      "Gemini embedding request failed with HTTP 429: Quota exceeded for embed_content_paid_tier_requests, limit: 0",
    );
  });
});
