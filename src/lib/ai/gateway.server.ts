import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Every model call in the OS goes through the Lovable AI Gateway. The key is
 * server-only and is read inside the request, never at module scope.
 */
export function createGateway() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured for this environment.");
  }
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

/** The reasoning model the operator-facing agents use. */
export const REASONING_MODEL = "google/gemini-3.1-pro-preview";
