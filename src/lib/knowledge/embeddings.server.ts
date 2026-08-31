import { GEMINI_API_ORIGIN } from "../gemini.server";
import { embedViaProxy, proxyEmbeddingModel } from "../ai/embeddings.server";

export const KNOWLEDGE_EMBEDDING_MODEL = "gemini-embedding-001";
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 768;

/**
 * Whether this call should go through the proxy instead of straight to Google.
 *
 * Gated on the operator naming a model rather than on the proxy merely being
 * configured, because the two paths do not produce interchangeable vectors: the
 * direct path sends Gemini's `taskType` (`RETRIEVAL_DOCUMENT` for stored text,
 * `RETRIEVAL_QUERY` for a search), and the OpenAI embeddings shape the proxy
 * speaks has no field for it. Embedding queries one way against documents
 * stored the other degrades retrieval quietly and without an error.
 *
 * So moving this store onto the proxy means re-embedding what is already in it.
 * Setting `LITELLM_MODEL_EMBEDDING` is how the operator says they intend that.
 */
function proxyModelOrEmpty(): string {
  return proxyEmbeddingModel(process.env);
}

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
      `Gemini returned an invalid embedding; exactly ${KNOWLEDGE_EMBEDDING_DIMENSIONS} finite values are required.`,
    );
  }
  return value as number[];
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

export async function embedDocuments(input: DocumentEmbeddingInput): Promise<number[][]> {
  if (input.documents.length === 0) return [];

  const proxyModel = proxyModelOrEmpty();
  if (proxyModel) {
    const vectors = await embedViaProxy({
      texts: input.documents.map((document) => document.text),
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      model: proxyModel,
      ...(input.fetcher ? { fetcher: input.fetcher } : {}),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    });
    return vectors.map((vector) => validateVector(vector));
  }

  if (!input.apiKey.trim()) throw new Error("GEMINI_API_KEY is not configured.");
  const model = input.model?.trim() || KNOWLEDGE_EMBEDDING_MODEL;
  const fetcher = input.fetcher ?? fetch;
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
      input.timeoutMs ?? 30_000,
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

  const proxyModel = proxyModelOrEmpty();
  if (proxyModel) {
    const [vector] = await embedViaProxy({
      texts: [query],
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      model: proxyModel,
      ...(input.fetcher ? { fetcher: input.fetcher } : {}),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    });
    return validateVector(vector);
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
    input.fetcher ?? fetch,
    input.timeoutMs ?? 30_000,
  )) as { embedding?: { values?: unknown } };
  return validateVector(payload.embedding?.values);
}
