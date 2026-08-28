import { generateStructuredJson } from "./ai/structured.server";
import { litellmConfigured } from "./ai/routing";
import { validatePageMetadataWording, type PageMetadataWording } from "./page-metadata-proposals";
import { validatePageWordingWording, type PageWordingWording } from "./page-wording-proposals";

/**
 * The system half of the wording request.
 *
 * Split out from the prompt so it is byte-identical on every call, which is the
 * only condition under which any provider will cache it. The prompt that
 * follows carries the page's own evidence and changes every time.
 */
const WORDING_SYSTEM = `You write search wording for a marketing operating system.

You are given evidence read from a live page and from Google Search Console. Propose wording that is true of that page. Never invent a service, a location, a claim, a number or a guarantee that the evidence does not contain. Never write a superlative you cannot source. If the evidence is thin, write something plainer rather than something larger.

Answer only with the JSON object the schema describes.`;

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

export async function generatePageWordingWording(
  input: WordingRequest,
): Promise<PageWordingWording> {
  return validatePageWordingWording(
    await generateWording(input, "page_wording_fields", RESPONSE_JSON_SCHEMA),
  );
}

export async function generatePageMetadataWording(
  input: WordingRequest,
): Promise<PageMetadataWording> {
  return validatePageMetadataWording(
    await generateWording(input, "page_metadata_wording", METADATA_RESPONSE_JSON_SCHEMA),
  );
}

/**
 * Route the wording request through the proxy, or straight to Google until one
 * is configured.
 *
 * The direct path is kept, not deleted, so a workspace that has not set the
 * proxy up yet keeps working exactly as it did. It is the fallback, though: the
 * proxy path is the one that can cache the system prefix and the one that keeps
 * spend on a single account.
 */
async function generateWording(
  input: WordingRequest,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<unknown> {
  if (litellmConfigured(process.env)) {
    return generateStructuredJson({
      system: WORDING_SYSTEM,
      prompt: input.prompt,
      schemaName,
      schema,
      ...(input.fetcher ? { fetcher: input.fetcher as typeof fetch } : {}),
    });
  }
  return generateStructuredWording(input, schema);
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
