/**
 * Which service serves a model call, and what it is allowed to say about it.
 *
 * Every model call in the OS went through the Lovable AI Gateway, which is the
 * one runtime dependency the operator asked to cut. This routes them through a
 * self-hosted LiteLLM proxy instead, with OpenRouter behind it, and keeps the
 * old gateway only as a stated fallback so nothing breaks before the proxy is
 * configured.
 *
 * Everything here is pure and reads an env bag passed in, so the decision can
 * be tested and so the connectors panel can describe the routing without
 * making a call.
 *
 * Two things this deliberately does not do:
 *
 * - It never invents a base URL or a model id. An unconfigured proxy routes to
 *   the fallback and says so; it does not guess a hostname.
 * - It never reports "connected". Configured is not connected. All this knows
 *   is which credentials are present.
 */

export type ModelProvider = "litellm" | "lovable";

/** What each provider is asked for, by role rather than by model name. */
export type ModelRole = "reasoning" | "fast" | "wording";

export type ModelRouting = {
  readonly provider: ModelProvider;
  readonly baseURL: string;
  readonly apiKey: string;
  /** Headers this provider needs beyond the bearer token. */
  readonly headers: Record<string, string>;
  /**
   * Whether the route can carry prompt-cache breakpoints. Lovable's gateway
   * exposes no way to set one, so marking a prefix there would be a no-op the
   * operator could mistake for a saving.
   */
  readonly supportsPromptCaching: boolean;
  /** What the connectors panel says. Never claims the route has been proven. */
  readonly statement: string;
};

/**
 * The model each role resolves to when nothing overrides it.
 *
 * These are OpenRouter slugs, which LiteLLM passes through unchanged when the
 * proxy is configured with an `openrouter/` prefix or a matching alias. Any
 * proxy naming its models differently sets the env override rather than
 * editing this file.
 */
const DEFAULT_MODELS: Record<ModelRole, string> = {
  reasoning: "google/gemini-3.1-pro-preview",
  fast: "google/gemini-3.6-flash",
  wording: "google/gemini-3.6-flash",
};

const MODEL_ENV: Record<ModelRole, string> = {
  reasoning: "LITELLM_MODEL_REASONING",
  fast: "LITELLM_MODEL_FAST",
  wording: "LITELLM_MODEL_WORDING",
};

type Env = Record<string, string | undefined>;

function first(env: Env, ...names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/** Trailing slashes and a missing `/v1` are the two ways this is typed wrong. */
function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/**
 * Whether a self-hosted LiteLLM proxy is configured well enough to route to.
 *
 * Both a base URL and a key are required. A proxy reachable without a key is a
 * proxy anyone can spend the operator's OpenRouter credit through, so a missing
 * key routes to the fallback rather than sending an unauthenticated request.
 */
export function litellmConfigured(env: Env): boolean {
  return (
    first(env, "LITELLM_BASE_URL", "LITELLM_PROXY_API_BASE") !== "" &&
    first(env, "LITELLM_API_KEY", "LITELLM_PROXY_API_KEY") !== ""
  );
}

/** The model id for one role, honouring a proxy that names its models its own way. */
export function modelForRole(env: Env, role: ModelRole): string {
  return first(env, MODEL_ENV[role]) || DEFAULT_MODELS[role];
}

/**
 * Where a model call goes.
 *
 * Throws rather than returning a broken route when neither service is
 * configured: a model call with no credentials is not a degraded answer, it is
 * no answer, and the caller's fallback path is the honest response.
 */
export function readModelRouting(env: Env): ModelRouting {
  if (litellmConfigured(env)) {
    const base = normalizeBaseUrl(first(env, "LITELLM_BASE_URL", "LITELLM_PROXY_API_BASE"));
    return {
      provider: "litellm",
      baseURL: base,
      apiKey: first(env, "LITELLM_API_KEY", "LITELLM_PROXY_API_KEY"),
      // OpenRouter attributes traffic by these two and shows them on the
      // dashboard. They are cosmetic to the response and useful to the operator
      // reading their own bill.
      headers: {
        "HTTP-Referer":
          first(env, "LITELLM_REFERER") || "https://github.com/maxwest525/synergy-layer",
        "X-Title": first(env, "LITELLM_APP_TITLE") || "Marky",
      },
      supportsPromptCaching: true,
      statement: `Model calls route to the LiteLLM proxy at ${base}. Configured, not yet proven: nothing here has made a call.`,
    };
  }

  const lovableKey = first(env, "LOVABLE_API_KEY");
  if (lovableKey) {
    return {
      provider: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: lovableKey,
      headers: {
        "Lovable-API-Key": lovableKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      // The gateway exposes no cache-breakpoint field, so marking a prefix
      // would be a no-op that reads on screen as a saving.
      supportsPromptCaching: false,
      statement:
        "Model calls still route to the Lovable AI Gateway. Set LITELLM_BASE_URL and LITELLM_API_KEY to move them to the self-hosted proxy, which is the only route that can use prompt caching.",
    };
  }

  throw new Error(
    "No model route is configured. Set LITELLM_BASE_URL and LITELLM_API_KEY for the self-hosted proxy, or LOVABLE_API_KEY for the old gateway.",
  );
}

/** What `readModelRouting` would say, without throwing when nothing is set. */
export function describeModelRouting(env: Env): {
  provider: ModelProvider | null;
  statement: string;
} {
  try {
    const routing = readModelRouting(env);
    return { provider: routing.provider, statement: routing.statement };
  } catch (error) {
    return { provider: null, statement: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * How long a prefix has to be before a cache breakpoint pays for itself.
 *
 * Anthropic and OpenAI both refuse to cache below roughly a thousand tokens,
 * and a breakpoint under that is billed as a write with no read to follow.
 * Four characters per token is the usual rough conversion and is only used to
 * decide whether to bother, never to report a number.
 */
export const MIN_CACHEABLE_CHARS = 1024 * 4;

type ChatMessage = { role?: unknown; content?: unknown };

/**
 * Mark the stable prefix of a request so the provider can cache it.
 *
 * Caching only ever works on a prefix that is byte-identical between calls, so
 * this marks the system message and nothing else: the system prompt is fixed
 * per surface, while everything after it carries the operator's conversation.
 * Marking a later message would move the breakpoint on every turn and cache
 * nothing.
 *
 * The annotation is the `cache_control` field Anthropic defined and OpenRouter
 * and LiteLLM both forward. A provider that does not understand it ignores an
 * unknown field, so this is safe to send to all of them.
 */
export function withPromptCaching(body: Record<string, unknown>): Record<string, unknown> {
  const messages = body["messages"];
  if (!Array.isArray(messages) || messages.length === 0) return body;

  const marked = messages.map((raw: ChatMessage, index) => {
    if (index !== 0 || raw.role !== "system" || typeof raw.content !== "string") return raw;
    if (raw.content.length < MIN_CACHEABLE_CHARS) return raw;
    return {
      ...raw,
      // The string form becomes a one-part array so the breakpoint has
      // something to attach to. Providers accept either shape.
      content: [
        {
          type: "text",
          text: raw.content,
          cache_control: { type: "ephemeral" },
        },
      ],
    };
  });

  return { ...body, messages: marked };
}

export type CacheUsage = {
  /** Tokens served from cache rather than re-read. Null when nothing reported it. */
  readonly cachedTokens: number | null;
  /** Tokens written into the cache by this call. Null when nothing reported it. */
  readonly cacheWriteTokens: number | null;
};

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * What the provider said about the cache, from whichever field it used.
 *
 * OpenAI reports `prompt_tokens_details.cached_tokens`; Anthropic through
 * OpenRouter reports `cache_read_input_tokens` and `cache_creation_input_tokens`.
 * A provider that reports neither yields nulls, which is not the same as a
 * measured zero and must not be shown as one.
 */
export function readCacheUsage(parsedBody: unknown): CacheUsage {
  const usage = (parsedBody as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage) return { cachedTokens: null, cacheWriteTokens: null };
  const details = usage["prompt_tokens_details"] as Record<string, unknown> | undefined;
  return {
    cachedTokens: count(usage["cache_read_input_tokens"]) ?? count(details?.["cached_tokens"]),
    cacheWriteTokens: count(usage["cache_creation_input_tokens"]),
  };
}
