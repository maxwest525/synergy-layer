import { validatePageMetadataWording, type PageMetadataWording } from "./page-metadata-proposals";
import { validateTitleH1Wording, type TitleH1Wording } from "./title-h1-proposals";

export const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";
export const DEFAULT_GEMINI_GENERATION_MODEL = "gemini-3.6-flash";
const REQUEST_TIMEOUT_MS = 20_000;

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    seoTitle: {
      type: "string",
      description: "The proposed SEO document title wording.",
    },
    h1: {
      type: "string",
      description: "The proposed visible page H1 wording.",
    },
    rationale: {
      type: "string",
      description: "A concise evidence-grounded rationale for the wording.",
    },
  },
  required: ["seoTitle", "h1", "rationale"],
} as const;

const METADATA_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    metaDescription: {
      type: "string",
      description: "The proposed meta description wording.",
    },
    rationale: {
      type: "string",
      description: "A concise evidence-grounded rationale for the wording.",
    },
  },
  required: ["metaDescription", "rationale"],
} as const;

type WordingRequest = {
  apiKey: string;
  model: string;
  prompt: string;
  fetcher?: Fetcher;
};

export async function generateTitleH1Wording(input: WordingRequest): Promise<TitleH1Wording> {
  return validateTitleH1Wording(await generateStructuredWording(input, RESPONSE_JSON_SCHEMA));
}

export async function generatePageMetadataWording(
  input: WordingRequest,
): Promise<PageMetadataWording> {
  return validatePageMetadataWording(
    await generateStructuredWording(input, METADATA_RESPONSE_JSON_SCHEMA),
  );
}

async function generateStructuredWording(
  input: WordingRequest,
  responseJsonSchema: Record<string, unknown>,
): Promise<unknown> {
  if (!input.apiKey.trim()) throw new Error("GEMINI_API_KEY is not configured.");
  const model = input.model.trim() || DEFAULT_GEMINI_GENERATION_MODEL;

  const fetcher = input.fetcher ?? fetch;
  const url = `${GEMINI_API_ORIGIN}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new Error(
      timedOut
        ? `Gemini timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        : "The direct Gemini request failed.",
    );
  }

  if (!response.ok) {
    throw new Error(`Gemini returned HTTP ${response.status}; no proposal was created.`);
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(await response.text());
  } catch {
    throw new Error("Gemini returned an unreadable response; no proposal was created.");
  }

  const candidate = envelope as {
    candidates?: { content?: { parts?: { text?: unknown }[] } }[];
  };
  const text = candidate.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.text === "string",
  )?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini returned no structured JSON candidate; no proposal was created.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned malformed structured JSON; no proposal was created.");
  }
  return parsed;
}
