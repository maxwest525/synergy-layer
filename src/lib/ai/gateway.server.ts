import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import {
  modelForRole,
  readCacheUsage,
  readModelRouting,
  withPromptCaching,
  type ModelRole,
  type ModelRouting,
} from "./routing";

/**
 * Every model call in the OS goes through here.
 *
 * It routes to the self-hosted LiteLLM proxy when one is configured, and falls
 * back to the Lovable AI Gateway only until then. Both speak the OpenAI chat
 * shape, so the SDK surface is identical either way and nothing calling this
 * has to know which one served.
 *
 * The key is server-only and is read inside the request, never at module scope.
 */
export function createGateway() {
  const routing = readModelRouting(process.env);
  return createOpenAICompatible({
    name: routing.provider === "litellm" ? "litellm-proxy" : "lovable-ai-gateway",
    baseURL: routing.baseURL,
    apiKey: routing.apiKey,
    headers: routing.headers,
    // The stable system prefix is marked here rather than at each call site, so
    // a new surface gets caching by being written, not by remembering to ask.
    ...(routing.supportsPromptCaching ? { transformRequestBody: withPromptCaching } : {}),
    metadataExtractor: cacheMetadata,
  });
}

/**
 * What the provider reported about the cache, carried back on the response.
 *
 * The operator is paying for these tokens, so what the cache saved is worth
 * surfacing rather than discarding. A provider that reports nothing yields
 * nulls, which is not a measured zero and must not be shown as one.
 */
const cacheMetadata = {
  extractMetadata: async ({ parsedBody }: { parsedBody: unknown }) => {
    const usage = readCacheUsage(parsedBody);
    if (usage.cachedTokens === null && usage.cacheWriteTokens === null) return undefined;
    return { promptCache: { ...usage } };
  },
  createStreamExtractor: () => {
    let seen: ReturnType<typeof readCacheUsage> | null = null;
    return {
      processChunk: (chunk: unknown) => {
        const usage = readCacheUsage(chunk);
        if (usage.cachedTokens !== null || usage.cacheWriteTokens !== null) seen = usage;
      },
      buildMetadata: () => (seen === null ? undefined : { promptCache: { ...seen } }),
    };
  },
};

/** Which service is serving model calls right now, for the connectors panel. */
export function currentModelRouting(): ModelRouting {
  return readModelRouting(process.env);
}

/** The model for one role, resolved against whatever the proxy names its models. */
export function modelFor(role: ModelRole): string {
  return modelForRole(process.env, role);
}

/**
 * The reasoning model the operator-facing agents use.
 *
 * A getter rather than a constant: the proxy's alias is read per call, so
 * changing it does not need a redeploy, and a module-scope read would capture
 * the value before the environment is populated.
 */
export function reasoningModel(): string {
  return modelFor("reasoning");
}

/**
 * The fast model for constrained, low-complexity calls: reordering an
 * existing list, rewording a sentence, anything that cannot invent a new
 * fact and has a safe deterministic fallback if it fails. Reasoning-tier
 * pricing on a task this bounded is spend with nothing behind it.
 */
export function fastModel(): string {
  return modelFor("fast");
}
