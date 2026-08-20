import { describe, expect, it } from "vitest";

import {
  describeModelRouting,
  litellmConfigured,
  MIN_CACHEABLE_CHARS,
  modelForRole,
  readCacheUsage,
  readModelRouting,
  withPromptCaching,
} from "./routing";

const LITELLM = {
  LITELLM_BASE_URL: "https://litellm.internal",
  LITELLM_API_KEY: "sk-proxy",
};

describe("cutting the Lovable gateway out of the runtime", () => {
  it("routes to the self-hosted proxy as soon as it is configured", () => {
    const routing = readModelRouting({ ...LITELLM, LOVABLE_API_KEY: "still-set" });
    expect(routing.provider).toBe("litellm");
    expect(routing.baseURL).toBe("https://litellm.internal/v1");
  });

  it("keeps the old gateway working until then, and says that is what happened", () => {
    const routing = readModelRouting({ LOVABLE_API_KEY: "key" });
    expect(routing.provider).toBe("lovable");
    expect(routing.statement).toContain("LITELLM_BASE_URL");
  });

  it("refuses rather than sending an unauthenticated request to the proxy", () => {
    // A proxy reachable without a key is one anyone can spend the operator's
    // OpenRouter credit through.
    expect(litellmConfigured({ LITELLM_BASE_URL: "https://litellm.internal" })).toBe(false);
    expect(readModelRouting({ LITELLM_BASE_URL: "https://x", LOVABLE_API_KEY: "k" }).provider).toBe(
      "lovable",
    );
  });

  it("throws instead of returning a broken route when nothing is configured", () => {
    expect(() => readModelRouting({})).toThrow(/LITELLM_BASE_URL/);
    expect(describeModelRouting({}).provider).toBeNull();
  });

  it("accepts either name for the base url and the key", () => {
    const routing = readModelRouting({
      LITELLM_PROXY_API_BASE: "https://litellm.internal",
      LITELLM_PROXY_API_KEY: "sk-proxy",
    });
    expect(routing.provider).toBe("litellm");
  });
});

describe("the base url people actually type", () => {
  it("adds the version segment when it is missing", () => {
    expect(readModelRouting(LITELLM).baseURL).toBe("https://litellm.internal/v1");
  });

  it("does not add a second one", () => {
    expect(
      readModelRouting({ ...LITELLM, LITELLM_BASE_URL: "https://litellm.internal/v1" }).baseURL,
    ).toBe("https://litellm.internal/v1");
  });

  it("survives a trailing slash", () => {
    expect(
      readModelRouting({ ...LITELLM, LITELLM_BASE_URL: "https://litellm.internal/v1/" }).baseURL,
    ).toBe("https://litellm.internal/v1");
  });
});

describe("model ids the proxy may name its own way", () => {
  it("uses the OpenRouter slug by default", () => {
    expect(modelForRole({}, "reasoning")).toContain("/");
  });

  it("lets the proxy's own alias win", () => {
    expect(modelForRole({ LITELLM_MODEL_REASONING: "house-reasoner" }, "reasoning")).toBe(
      "house-reasoner",
    );
  });

  it("keeps the roles separate so fast work is not billed as reasoning", () => {
    expect(modelForRole({}, "fast")).not.toBe(modelForRole({}, "reasoning"));
  });
});

describe("prompt caching", () => {
  const long = "x".repeat(MIN_CACHEABLE_CHARS);

  it("marks the system prefix, which is the only part that repeats", () => {
    const body = withPromptCaching({
      messages: [
        { role: "system", content: long },
        { role: "user", content: "hello" },
      ],
    });
    const messages = body["messages"] as { content: unknown }[];
    expect(messages[0]?.content).toEqual([
      { type: "text", text: long, cache_control: { type: "ephemeral" } },
    ]);
    // Everything after it changes every turn, so a breakpoint there caches
    // nothing and is billed as a write.
    expect(messages[1]?.content).toBe("hello");
  });

  it("does not mark a prefix too short for any provider to cache", () => {
    const body = withPromptCaching({
      messages: [{ role: "system", content: "short" }],
    });
    expect((body["messages"] as { content: unknown }[])[0]?.content).toBe("short");
  });

  it("does not mark a message that is not the leading system one", () => {
    const body = withPromptCaching({
      messages: [
        { role: "user", content: long },
        { role: "system", content: long },
      ],
    });
    const messages = body["messages"] as { content: unknown }[];
    expect(messages[0]?.content).toBe(long);
    expect(messages[1]?.content).toBe(long);
  });

  it("leaves a body it does not recognise exactly as it was", () => {
    const body = { model: "x" };
    expect(withPromptCaching(body)).toEqual(body);
    expect(withPromptCaching({ messages: [] })).toEqual({ messages: [] });
  });

  it("is not offered on a route that cannot honour it", () => {
    // Marking a prefix the gateway ignores would read on screen as a saving.
    expect(readModelRouting({ LOVABLE_API_KEY: "k" }).supportsPromptCaching).toBe(false);
    expect(readModelRouting(LITELLM).supportsPromptCaching).toBe(true);
  });
});

describe("reading back what the cache actually saved", () => {
  it("reads the OpenAI shape", () => {
    expect(readCacheUsage({ usage: { prompt_tokens_details: { cached_tokens: 1536 } } })).toEqual({
      cachedTokens: 1536,
      cacheWriteTokens: null,
    });
  });

  it("reads the Anthropic shape", () => {
    expect(
      readCacheUsage({
        usage: { cache_read_input_tokens: 2048, cache_creation_input_tokens: 300 },
      }),
    ).toEqual({ cachedTokens: 2048, cacheWriteTokens: 300 });
  });

  it("reports null, not zero, when the provider said nothing", () => {
    // A provider that does not report caching is not a provider that cached
    // nothing, and the two must not look the same.
    expect(readCacheUsage({ usage: { prompt_tokens: 10 } })).toEqual({
      cachedTokens: null,
      cacheWriteTokens: null,
    });
    expect(readCacheUsage(null)).toEqual({ cachedTokens: null, cacheWriteTokens: null });
    expect(readCacheUsage({ usage: { cache_read_input_tokens: "many" } }).cachedTokens).toBeNull();
  });

  it("keeps a reported zero, which is a real miss", () => {
    expect(readCacheUsage({ usage: { cache_read_input_tokens: 0 } }).cachedTokens).toBe(0);
  });
});
