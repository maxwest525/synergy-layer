import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateStructuredJson } from "./structured.server";
import { MIN_CACHEABLE_CHARS } from "./routing";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { seoTitle: { type: "string" } },
  required: ["seoTitle"],
} as const;

const original = { ...process.env };

function useProxy() {
  process.env["LITELLM_BASE_URL"] = "https://litellm.internal";
  process.env["LITELLM_API_KEY"] = "sk-proxy";
}

/** A proxy that answers with one structured choice, and records what it was sent. */
function proxy(payload: unknown = { seoTitle: "Movers in Austin" }) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
      { status: 200 },
    );
  });
  return { sent, fetcher: fetcher as unknown as typeof fetch };
}

function bodyOf(sent: { init: RequestInit }[]): Record<string, unknown> {
  return JSON.parse(String(sent[0]?.init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  for (const key of Object.keys(process.env))
    if (key.startsWith("LITELLM_")) delete process.env[key];
  delete process.env["LOVABLE_API_KEY"];
});

afterEach(() => {
  process.env = { ...original };
});

describe("routing the wording call off Google's own endpoint", () => {
  it("sends it to the proxy's chat completions", async () => {
    useProxy();
    const { sent, fetcher } = proxy();
    await generateStructuredJson({
      system: "s",
      prompt: "p",
      schemaName: "title_h1_wording",
      schema: SCHEMA,
      fetcher,
    });
    expect(sent[0]?.url).toBe("https://litellm.internal/v1/chat/completions");
    expect((sent[0]?.init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk-proxy",
    );
  });

  it("asks for the schema rather than hoping the model returns one", async () => {
    useProxy();
    const { sent, fetcher } = proxy();
    await generateStructuredJson({
      system: "s",
      prompt: "p",
      schemaName: "title_h1_wording",
      schema: SCHEMA,
      fetcher,
    });
    expect(bodyOf(sent)["response_format"]).toEqual({
      type: "json_schema",
      json_schema: { name: "title_h1_wording", strict: true, schema: SCHEMA },
    });
  });

  it("keeps the system prompt separate from the page's own evidence", async () => {
    // They are one string on the direct Gemini path, which is why that path can
    // never cache: nothing about it repeats.
    useProxy();
    const { sent, fetcher } = proxy();
    await generateStructuredJson({
      system: "the fixed instructions",
      prompt: "this page's evidence",
      schemaName: "x",
      schema: SCHEMA,
      fetcher,
    });
    expect(bodyOf(sent)["messages"]).toEqual([
      { role: "system", content: "the fixed instructions" },
      { role: "user", content: "this page's evidence" },
    ]);
  });

  it("marks a long enough system prefix for caching", async () => {
    useProxy();
    const { sent, fetcher } = proxy();
    const long = "x".repeat(MIN_CACHEABLE_CHARS);
    await generateStructuredJson({
      system: long,
      prompt: "p",
      schemaName: "x",
      schema: SCHEMA,
      fetcher,
    });
    const messages = bodyOf(sent)["messages"] as { content: unknown }[];
    expect(messages[0]?.content).toEqual([
      { type: "text", text: long, cache_control: { type: "ephemeral" } },
    ]);
  });
});

describe("failing in a way the operator can act on", () => {
  it("names the status, because 401 and 400 mean very different things", async () => {
    useProxy();
    const fetcher = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(
      generateStructuredJson({
        system: "s",
        prompt: "p",
        schemaName: "x",
        schema: SCHEMA,
        fetcher,
      }),
    ).rejects.toThrow(/HTTP 401/);
  });

  it("refuses malformed JSON rather than passing it on", async () => {
    useProxy();
    const fetcher = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "{not json" } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    await expect(
      generateStructuredJson({
        system: "s",
        prompt: "p",
        schemaName: "x",
        schema: SCHEMA,
        fetcher,
      }),
    ).rejects.toThrow(/malformed/);
  });

  it("says no proposal was created when the model returned no content", async () => {
    useProxy();
    const fetcher = (async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(
      generateStructuredJson({
        system: "s",
        prompt: "p",
        schemaName: "x",
        schema: SCHEMA,
        fetcher,
      }),
    ).rejects.toThrow(/no proposal was created/);
  });

  it("refuses when no route is configured at all", async () => {
    const { fetcher } = proxy();
    await expect(
      generateStructuredJson({
        system: "s",
        prompt: "p",
        schemaName: "x",
        schema: SCHEMA,
        fetcher,
      }),
    ).rejects.toThrow(/LITELLM_BASE_URL/);
  });
});
