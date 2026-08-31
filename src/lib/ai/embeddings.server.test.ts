import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { embedViaProxy, proxyEmbeddingModel } from "./embeddings.server";

const ORIGINAL = { ...process.env };

function vector(length: number, seed = 0): number[] {
  return Array.from({ length }, (_, index) => (index + seed) / 1000);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env["LITELLM_BASE_URL"] = "https://litellm.marky.systems";
  process.env["LITELLM_API_KEY"] = "virtual-key";
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("proxyEmbeddingModel", () => {
  it("is empty until the operator names a model, so the proxy path stays opt-in", () => {
    expect(proxyEmbeddingModel({})).toBe("");
    expect(proxyEmbeddingModel({ LITELLM_MODEL_EMBEDDING: "   " })).toBe("");
  });

  it("returns the named model", () => {
    expect(proxyEmbeddingModel({ LITELLM_MODEL_EMBEDDING: "google/gemini-embedding-001" })).toBe(
      "google/gemini-embedding-001",
    );
  });
});

describe("embedViaProxy", () => {
  it("sends the model, inputs and an explicit dimensions to the proxy", async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> =>
        jsonResponse({ data: [{ index: 0, embedding: vector(768) }] }),
    );

    await embedViaProxy({
      texts: ["authority transfer"],
      dimensions: 768,
      model: "google/gemini-embedding-001",
      fetcher,
    });

    const call = fetcher.mock.calls[0]!;
    expect(call[0]).toBe("https://litellm.marky.systems/v1/embeddings");
    const init = call[1]!;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "google/gemini-embedding-001",
      input: ["authority transfer"],
      // Without this the same model answers with 3072 values and the store rejects them.
      dimensions: 768,
    });
    expect(init.headers).toMatchObject({
      Authorization: "Bearer virtual-key",
    });
  });

  it("orders vectors by the row index rather than trusting array position", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        data: [
          { index: 1, embedding: vector(4, 100) },
          { index: 0, embedding: vector(4, 0) },
        ],
      }),
    );

    const result = await embedViaProxy({
      texts: ["first", "second"],
      dimensions: 4,
      model: "google/gemini-embedding-001",
      fetcher,
    });

    expect(result[0]).toEqual(vector(4, 0));
    expect(result[1]).toEqual(vector(4, 100));
  });

  it("makes no call for an empty batch", async () => {
    const fetcher = vi.fn();
    await expect(
      embedViaProxy({ texts: [], dimensions: 768, model: "m", fetcher }),
    ).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("names the status, because 401 and 400 mean different things here", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    await expect(
      embedViaProxy({ texts: ["a"], dimensions: 768, model: "m", fetcher }),
    ).rejects.toThrow("HTTP 401");
  });

  it("rejects a response that returns the wrong number of rows", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: [{ index: 0, embedding: vector(4) }] }));
    await expect(
      embedViaProxy({ texts: ["a", "b"], dimensions: 4, model: "m", fetcher }),
    ).rejects.toThrow("wrong number of embeddings");
  });
});
