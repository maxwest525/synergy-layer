import { z } from "zod";

import type { TitleH1Draft, TitleH1EvidenceBundle } from "./types";

const draftSchema = z
  .object({
    proposedTitle: z.string().trim().min(1),
    proposedH1: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
    expectedMetric: z.enum(["clicks", "impressions", "ctr", "position"]),
    confidenceRationale: z.string().trim().min(1),
    verification: z.string().trim().min(1),
    reversal: z.string().trim().min(1),
    claims: z.array(z.string().trim().min(1)),
  })
  .strict();

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposedTitle: { type: "string", description: "One proposed HTML document title." },
    proposedH1: { type: "string", description: "One proposed primary H1." },
    rationale: { type: "string", description: "Concise rationale tied only to supplied evidence." },
    expectedMetric: {
      type: "string",
      enum: ["clicks", "impressions", "ctr", "position"],
    },
    confidenceRationale: { type: "string" },
    verification: { type: "string" },
    reversal: { type: "string" },
    claims: { type: "array", items: { type: "string" } },
  },
  required: [
    "proposedTitle",
    "proposedH1",
    "rationale",
    "expectedMetric",
    "confidenceRationale",
    "verification",
    "reversal",
    "claims",
  ],
} as const;

export type GeminiRequest = {
  url: string;
  headers: Record<string, string>;
  body: {
    contents: { role: "user"; parts: { text: string }[] }[];
    generationConfig: {
      responseMimeType: "application/json";
      responseJsonSchema: typeof responseJsonSchema;
      temperature: number;
    };
  };
};

export type GeminiTransport = (
  request: GeminiRequest,
) => Promise<{ status: number; body: unknown }>;

export type GeneratedTitleH1Draft = {
  draft: TitleH1Draft;
  provider: "gemini" | "operator";
  model: string;
  requestedAt: string;
  status: number;
  usage: Record<string, number> | null;
};

export interface TitleH1Generator {
  generate(input: TitleH1EvidenceBundle): Promise<GeneratedTitleH1Draft>;
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for title/H1 proposal generation.`);
  return value;
}

function responseText(body: unknown): string {
  if (typeof body !== "object" || body === null)
    throw new Error("Gemini returned no response body.");
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) throw new Error("Gemini returned no draft candidate.");
  const first = candidates[0] as { content?: { parts?: { text?: unknown }[] } } | undefined;
  const text = first?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) throw new Error("Gemini returned no draft text.");
  return text;
}

function usageOf(body: unknown): Record<string, number> | null {
  if (typeof body !== "object" || body === null) return null;
  const usage = (body as { usageMetadata?: unknown }).usageMetadata;
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) return null;
  const numeric = Object.entries(usage).filter((entry): entry is [string, number] =>
    Number.isFinite(entry[1]),
  );
  return numeric.length > 0 ? Object.fromEntries(numeric) : null;
}

const fetchTransport: GeminiTransport = async (request) => {
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
  });
  return { status: response.status, body: await response.json() };
};

export function createConfiguredTitleH1Generator(
  env: Record<string, string | undefined>,
  transport: GeminiTransport = fetchTransport,
): TitleH1Generator {
  const provider = required(env, "PROPOSAL_GENERATOR_PROVIDER");
  if (provider !== "gemini") {
    throw new Error(`Unsupported proposal generator provider: ${provider}.`);
  }
  const apiKey = required(env, "GEMINI_API_KEY");
  const model = required(env, "GEMINI_PROPOSAL_MODEL");

  return {
    async generate(input) {
      const requestedAt = new Date().toISOString();
      const request: GeminiRequest = {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Draft exactly one SEO title and H1 candidate from the supplied evidence.",
                    "Use no facts, services, locations, prices, guarantees, or superlatives not supported by that evidence.",
                    "Do not decide eligibility, approval, execution, confidence score, or success.",
                    JSON.stringify(input),
                  ].join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema,
            temperature: 0.2,
          },
        },
      };
      const response = await transport(request);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Gemini generation failed with HTTP ${response.status}.`);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText(response.body));
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error("Gemini returned invalid JSON.");
        throw error;
      }

      return {
        draft: draftSchema.parse(parsed),
        provider: "gemini" as const,
        model,
        requestedAt,
        status: response.status,
        usage: usageOf(response.body),
      };
    },
  };
}
