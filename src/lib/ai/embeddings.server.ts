import { readModelRouting } from "./routing";

/**
 * Embeddings over the OpenAI shape, through whatever `readModelRouting` selects.
 *
 * The knowledge store embedded straight against Google's own endpoint, which
 * was the last model call in the runtime that never passed through the proxy —
 * so it never appeared on the operator's single bill and could not be routed,
 * limited, or swapped without editing code.
 *
 * Two things this deliberately does not do:
 *
 * - It never invents a model id. The proxy path is only taken when
 *   `LITELLM_MODEL_EMBEDDING` names a model, because a wrong embedding model is
 *   not a degraded answer: it is a vector of the wrong size or the wrong shape
 *   written into a store that already holds good ones.
 * - It does not pretend to carry Gemini's `taskType`. The OpenAI embeddings
 *   shape has no field for it, so a document and a query embed identically
 *   here, where the direct path distinguishes them. That is why switching is a
 *   deliberate choice and not the default — see the note in
 *   `knowledge/embeddings.server.ts`.
 */

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Verified against the operator's proxy on 2026-08-31: served through the
 * `"*" -> openrouter/*` wildcard, and it honours `dimensions`. Without that
 * parameter the same model returns 3072 values, which would not fit the store.
 */
export const PROXY_EMBEDDING_MODEL_ENV = "LITELLM_MODEL_EMBEDDING";

export type ProxyEmbeddingRequest = {
  readonly texts: string[];
  /** Sent explicitly. The provider default is not the store's width. */
  readonly dimensions: number;
  readonly model: string;
  readonly fetcher?: Fetcher;
  readonly timeoutMs?: number;
};

/** The model the proxy should embed with, or "" when the operator has not named one. */
export function proxyEmbeddingModel(env: Record<string, string | undefined>): string {
  return env[PROXY_EMBEDDING_MODEL_ENV]?.trim() ?? "";
}

/**
 * One embeddings call. Returns vectors in the order the texts were given,
 * which the OpenAI shape does not promise: it carries an `index` per row and
 * providers are free to reorder, so this sorts rather than trusting position.
 */
export async function embedViaProxy(input: ProxyEmbeddingRequest): Promise<number[][]> {
  if (input.texts.length === 0) return [];
  const routing = readModelRouting(process.env);
  const fetcher = input.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000);

  let response: Response;
  try {
    response = await fetcher(`${routing.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${routing.apiKey}`,
        ...routing.headers,
      },
      body: JSON.stringify({
        model: input.model,
        input: input.texts,
        dimensions: input.dimensions,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new Error(
      aborted
        ? "The model proxy timed out before returning embeddings."
        : "The model proxy could not be reached for embeddings.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // 401 is a wrong virtual key; 400 is usually a model the proxy does not
    // serve under that name. Both read identically without the status.
    throw new Error(`The model proxy returned HTTP ${response.status} for embeddings.`);
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new Error("The model proxy returned an unreadable embeddings response.");
  }

  const rows = (envelope as { data?: { embedding?: unknown; index?: unknown }[] }).data;
  if (!Array.isArray(rows) || rows.length !== input.texts.length) {
    throw new Error("The model proxy returned the wrong number of embeddings.");
  }

  return [...rows]
    .sort((left, right) => {
      const a = typeof left.index === "number" ? left.index : 0;
      const b = typeof right.index === "number" ? right.index : 0;
      return a - b;
    })
    .map((row) => row.embedding as number[]);
}
