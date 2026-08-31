import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { assertAiBudget, recordAiSpend } from "./budget.server";
import { estimateCostUsd, estimateTokensFromChars, pricingForRole } from "./pricing";
import { modelForRole, readModelRouting, withPromptCaching } from "./routing";

type Client = SupabaseClient<Database>;

/**
 * Structured JSON from a model, over the OpenAI chat shape.
 *
 * The wording proposals used to be a raw fetch to Google's own Gemini endpoint,
 * which is the one model path that never went through a gateway at all. That
 * made it the last thing tying the runtime to a second provider account, and it
 * could not use prompt caching, batching, spend limits, or any of the other
 * things the proxy exists to give.
 *
 * This sends the same request through whatever `readModelRouting` selects,
 * using `response_format: json_schema`, which LiteLLM translates to each
 * upstream provider's own structured-output mechanism.
 *
 * The caller still validates what comes back. A model that returns a
 * schema-shaped object of nonsense is not caught here and is not meant to be:
 * the wording validators are the gate, and they run either way.
 */

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * A worst-case output-token guess for the pre-call budget gate, used only to
 * decide whether to refuse the call before it happens. A JSON-schema
 * constrained wording response is a handful of short strings, not free text,
 * so this is deliberately generous rather than tuned per schema.
 */
const ASSUMED_MAX_OUTPUT_TOKENS = 800;

export type StructuredRequest = {
  /** Fixed per surface, and the only part worth caching. */
  readonly system: string;
  readonly prompt: string;
  readonly schemaName: string;
  readonly schema: Record<string, unknown>;
  readonly fetcher?: typeof fetch;
  /** Whose spend this call counts against, and where to enforce the ceiling. */
  readonly client: Client;
  readonly tenantId: string;
  /** Which caller this was, recorded on the spend row for `ai_gateway_requests`. */
  readonly surface: string;
};

/** True when a proxy is configured, so the caller knows this path is available. */
export { litellmConfigured } from "./routing";

export async function generateStructuredJson(input: StructuredRequest): Promise<unknown> {
  const routing = readModelRouting(process.env);
  const fetcher = input.fetcher ?? fetch;
  const model = modelForRole(process.env, "wording");
  const pricing = pricingForRole(process.env, "wording");

  if (pricing) {
    const estimatedInputTokens = estimateTokensFromChars(input.system.length + input.prompt.length);
    await assertAiBudget(
      input.client,
      input.tenantId,
      estimateCostUsd(pricing, estimatedInputTokens, ASSUMED_MAX_OUTPUT_TOKENS),
    );
  }

  const base: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: input.schemaName, strict: true, schema: input.schema },
    },
  };
  const body = routing.supportsPromptCaching ? withPromptCaching(base) : base;

  let response: Response;
  try {
    response = await fetcher(`${routing.baseURL}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${routing.apiKey}`,
        ...routing.headers,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new Error(
      timedOut
        ? `The model proxy timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        : "The model proxy could not be reached.",
    );
  }

  if (!response.ok) {
    // The status is named because the two common failures read very
    // differently: 401 is a wrong virtual key, 400 is a model the proxy does
    // not have configured under that name.
    throw new Error(`The model proxy returned HTTP ${response.status}; no proposal was created.`);
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(await response.text());
  } catch {
    throw new Error("The model proxy returned an unreadable response; no proposal was created.");
  }

  const parsed = envelope as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const text = parsed.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("The model returned no structured JSON; no proposal was created.");
  }

  if (pricing) {
    const inputTokens =
      typeof parsed.usage?.prompt_tokens === "number" ? parsed.usage.prompt_tokens : 0;
    const outputTokens =
      typeof parsed.usage?.completion_tokens === "number" ? parsed.usage.completion_tokens : 0;
    await recordAiSpend(
      input.client,
      input.tenantId,
      estimateCostUsd(pricing, inputTokens, outputTokens),
      {
        surface: input.surface,
        model,
        inputTokens,
        outputTokens,
        priced: true,
      },
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The model returned malformed structured JSON; no proposal was created.");
  }
}
