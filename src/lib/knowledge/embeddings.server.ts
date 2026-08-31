import { GEMINI_API_ORIGIN } from "../gemini.server";
import { litellmConfigured, modelForRole, readModelRouting } from "../ai/routing";

export const KNOWLEDGE_EMBEDDING_MODEL = "gemini-embedding-001";
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 768;

const PROXY_REQUEST_TIMEOUT_MS = 20_000;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type EmbeddingOptions = {
  apiKey: string;
  model?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
};

type DocumentEmbeddingInput = EmbeddingOptions & {
  documents: { title: string; text: string }[];
};

type QueryEmbeddingInput = EmbeddingOptions & { query: string };

function validateVector(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS ||
    value.some((item) => typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new Error(
      `The embedding response was invalid; exactly ${KNOWLEDGE_EMBEDDING_DIMENSIONS} finite values are required.`,
    );
  }
  return value as number[];
}

/**
 * Embed a batch of texts through the LiteLLM/OpenRouter proxy, over the
 * OpenAI-compatible `/embeddings` shape every proxy speaks regardless of
 * upstream provider.
 *
 * The model id is deliberately not one of the OpenRouter chat slugs the other
 * roles use -- see the comment on `DEFAULT_MODELS.embedding` in `ai/routing.ts`.
 * It must resolve to the exact same Gemini embedding model the direct path
 * below calls, or new vectors stop being comparable to every one already
 * stored. `task_type` is sent as a best-effort hint some proxy configurations
 * forward to Gemini's own API; a proxy that ignores it still returns a valid,
 * usable embedding, just without that distinction.
 */
async function embedViaProxy(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  fetcher: Fetcher,
  timeoutMs: number,
): Promise<number[][]> {
  const routing = readModelRouting(process.env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
        model: modelForRole(process.env, "embedding"),
        input: texts,
        task_type: taskType,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new Error(
      timedOut
        ? `The model proxy timed out after ${timeoutMs / 1000} seconds.`
        : "The model proxy could not be reached.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`The model proxy returned HTTP ${response.status}; no embedding was created.`);
  }

  const payload = (await response.json()) as {
    data?: { embedding?: unknown; index?: number }[];
  };
  if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
    throw new Error("The model proxy returned the wrong number of embeddings.");
  }
  return [...payload.data]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((entry) => validateVector(entry.embedding));
}

async function postJson(
  url: string,
  body: unknown,
  fetcher: Fetcher,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as { error?: { message?: unknown } };
        if (typeof payload.error?.message === "string") {
          detail = payload.error.message.replace(/\s+/g, " ").trim().slice(0, 500);
        }
      } catch {
        // Preserve the HTTP status when Google returns a non-JSON error body.
      }
      throw new Error(
        `Gemini embedding request failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
      );
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Route through the proxy, or straight to Google until one is configured.
 *
 * Same fallback shape as `generateWording` in `gemini.server.ts`: the direct
 * path is kept, not deleted, so a workspace that has not set the proxy up yet
 * keeps working exactly as it did. Embedding calls were the one model path
 * that never went through the proxy at all -- this closes that gap.
 */
export async function embedDocuments(input: DocumentEmbeddingInput): Promise<number[][]> {
  if (input.documents.length === 0) return [];
  const fetcher = input.fetcher ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;

  if (litellmConfigured(process.env)) {
    const results: number[][] = [];
    for (let offset = 0; offset < input.documents.length; offset += 50) {
      const batch = input.documents.slice(offset, offset + 50);
      results.push(
        ...(await embedViaProxy(
          batch.map((document) => document.text),
          "RETRIEVAL_DOCUMENT",
          fetcher,
          timeoutMs,
        )),
      );
    }
    return results;
  }

  if (!input.apiKey.trim()) throw new Error("GEMINI_API_KEY is not configured.");
  const model = input.model?.trim() || KNOWLEDGE_EMBEDDING_MODEL;
  const results: number[][] = [];

  for (let offset = 0; offset < input.documents.length; offset += 50) {
    const batch = input.documents.slice(offset, offset + 50);
    const payload = (await postJson(
      `${GEMINI_API_ORIGIN}/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(input.apiKey)}`,
      {
        requests: batch.map((document) => ({
          model: `models/${model}`,
          content: { parts: [{ text: document.text }] },
          // The live Gemini REST batch endpoint currently ignores the newer
          // nested config object. Its supported compatibility fields enforce
          // the 768-dimensional pgvector contract correctly.
          taskType: "RETRIEVAL_DOCUMENT",
          title: document.title,
          outputDimensionality: KNOWLEDGE_EMBEDDING_DIMENSIONS,
        })),
      },
      fetcher,
      timeoutMs,
    )) as { embeddings?: { values?: unknown }[] };
    if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== batch.length) {
      throw new Error("Gemini returned the wrong number of document embeddings.");
    }
    results.push(...payload.embeddings.map((embedding) => validateVector(embedding.values)));
  }
  return results;
}

export async function embedQuery(input: QueryEmbeddingInput): Promise<number[]> {
  const query = input.query.trim();
  if (!query) throw new Error("A non-empty knowledge query is required.");
  const fetcher = input.fetcher ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;

  if (litellmConfigured(process.env)) {
    const [vector] = await embedViaProxy([query], "RETRIEVAL_QUERY", fetcher, timeoutMs);
    return vector!;
  }

  if (!input.apiKey.trim()) throw new Error("GEMINI_API_KEY is not configured.");
  const model = input.model?.trim() || KNOWLEDGE_EMBEDDING_MODEL;
  const payload = (await postJson(
    `${GEMINI_API_ORIGIN}/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      model: `models/${model}`,
      content: { parts: [{ text: query }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    },
    fetcher,
    timeoutMs,
  )) as { embedding?: { values?: unknown } };
  return validateVector(payload.embedding?.values);
}
