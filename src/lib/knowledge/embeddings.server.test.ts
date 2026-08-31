import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      taskType: "RETRIEVAL_DOCUMENT",
      title: "Authority Science",
      outputDimensionality: 768,
    });
    expect(body.requests[0]).not.toHaveProperty("embedContentConfig");
  });

  it("embeds queries with retrieval-query semantics", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ embedding: { values: vector } }), { status: 200 }),
    );
    const result = await embedQuery({ apiKey: "secret", query: "authority transfer", fetcher });

    expect(result).toHaveLength(768);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body).toMatchObject({
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    });
    expect(body).not.toHaveProperty("embedContentConfig");
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

describe("embeddings routed through the LiteLLM/OpenRouter proxy", () => {
  beforeEach(() => {
    vi.stubEnv("LITELLM_BASE_URL", "https://proxy.test");
    vi.stubEnv("LITELLM_API_KEY", "proxy-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the proxy over the direct Gemini path once it is configured", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      return new Response(
        JSON.stringify({
          data: body.input.map((_text, index) => ({ embedding: vector, index })),
        }),
        { status: 200 },
      );
    });

    const result = await embedDocuments({
      apiKey: "unused-once-the-proxy-is-configured",
      documents: [{ title: "Authority Science", text: "Authority is capacity." }],
      fetcher,
    });

    expect(result).toEqual([vector]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://proxy.test/v1/embeddings");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer proxy-key" });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "gemini-embedding-001",
      input: ["Authority is capacity."],
      task_type: "RETRIEVAL_DOCUMENT",
    });
  });

  it("does not require a Gemini API key at all once the proxy is configured", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: [{ embedding: vector, index: 0 }] }), {
          status: 200,
        }),
    );

    await expect(embedQuery({ apiKey: "", query: "authority transfer", fetcher })).resolves.toEqual(
      vector,
    );
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body).toMatchObject({ input: ["authority transfer"], task_type: "RETRIEVAL_QUERY" });
  });

  it("sorts embeddings back into request order rather than trusting response order", async () => {
    const second = vector.map((value) => value + 1);
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { embedding: second, index: 1 },
              { embedding: vector, index: 0 },
            ],
          }),
          { status: 200 },
        ),
    );

    const result = await embedDocuments({
      apiKey: "unused",
      documents: [
        { title: "First", text: "first" },
        { title: "Second", text: "second" },
      ],
      fetcher,
    });

    expect(result).toEqual([vector, second]);
  });

  it("fails rather than silently falling back when the proxy itself errors", async () => {
    const fetcher = vi.fn(async () => new Response("bad gateway", { status: 502 }));

    await expect(embedQuery({ apiKey: "secret", query: "authority", fetcher })).rejects.toThrow(
      "The model proxy returned HTTP 502",
    );
  });
});
