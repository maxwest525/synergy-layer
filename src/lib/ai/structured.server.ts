import { modelForRole, readModelRouting, withPromptCaching } from "./routing";

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

export type StructuredRequest = {
  /** Fixed per surface, and the only part worth caching. */
  readonly system: string;
  readonly prompt: string;
  readonly schemaName: string;
  readonly schema: Record<string, unknown>;
  readonly fetcher?: typeof fetch;
};

/** True when a proxy is configured, so the caller knows this path is available. */
export { litellmConfigured } from "./routing";

export async function generateStructuredJson(input: StructuredRequest): Promise<unknown> {
  const routing = readModelRouting(process.env);
  const fetcher = input.fetcher ?? fetch;

  const base: Record<string, unknown> = {
    model: modelForRole(process.env, "wording"),
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

  const text = (envelope as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]
    ?.message?.content;
  if (typeof text !== "string") {
    throw new Error("The model returned no structured JSON; no proposal was created.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The model returned malformed structured JSON; no proposal was created.");
  }
}
