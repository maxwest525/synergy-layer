import { describe, expect, it, vi } from "vitest";

import { createConfiguredTitleH1Generator, type GeminiTransport } from "./generator.server";
import type { TitleH1EvidenceBundle } from "./types";

const bundle = {
  finding: {
    id: "finding-1",
    rule: "high_impression_low_ctr",
    targetKind: "page",
    targetUrl: "https://trumoveinc.com/page",
    thresholdSatisfied: true,
    observedAt: "2026-08-10T12:00:00.000Z",
    sourceChecksum: "finding-checksum",
  },
  live: {
    requestedUrl: "https://trumoveinc.com/page",
    finalUrl: "https://trumoveinc.com/page",
    allowlisted: true,
    title: "Current Title",
    h1s: ["Current H1"],
    mainText: "Long-distance moving services.",
    observedAt: "2026-08-10T12:00:00.000Z",
    contentChecksum: "live-checksum",
  },
  gsc: {
    pageUrl: "https://trumoveinc.com/page",
    currentPeriod: { start: "2026-08-03", end: "2026-08-09" },
    comparisonPeriod: null,
    rows: [{ query: "long distance movers", clicks: 2, impressions: 250, ctr: 0.008, position: 6 }],
    observedAt: "2026-08-10T12:00:00.000Z",
    sourceChecksum: "gsc-checksum",
  },
  competitors: [
    {
      query: "long distance movers",
      domain: "competitor.example",
      title: "Long Distance Movers",
      h1: "Long Distance Moving",
      observedAt: "2026-08-10T12:00:00.000Z",
      sourceChecksum: "competitor-checksum",
      provider: "dataforseo" as const,
    },
  ],
  ga4: null,
  previousChanges: [],
} satisfies TitleH1EvidenceBundle;

describe("configured title/H1 generator", () => {
  it.each([
    [{}, "PROPOSAL_GENERATOR_PROVIDER"],
    [{ PROPOSAL_GENERATOR_PROVIDER: "gemini" }, "GEMINI_API_KEY"],
    [{ PROPOSAL_GENERATOR_PROVIDER: "gemini", GEMINI_API_KEY: "secret" }, "GEMINI_PROPOSAL_MODEL"],
    [
      {
        PROPOSAL_GENERATOR_PROVIDER: "unsupported",
        GEMINI_API_KEY: "secret",
        GEMINI_PROPOSAL_MODEL: "configured-model",
      },
      "Unsupported proposal generator provider",
    ],
  ])("refuses incomplete or unsupported configuration", (env, expected) => {
    expect(() => createConfiguredTitleH1Generator(env, vi.fn())).toThrow(expected);
  });

  it("calls Gemini directly with a strict structured-output schema", async () => {
    const transport = vi.fn<GeminiTransport>(async () => ({
      status: 200,
      body: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    proposedTitle: "Long Distance Movers | TruMove",
                    proposedH1: "Long-Distance Movers",
                    rationale: "Aligns wording with the observed query.",
                    expectedMetric: "ctr",
                    confidenceRationale: "Supported by live and query evidence.",
                    verification: "Compare finalized page-level GSC windows.",
                    reversal: "Restore the captured title and H1.",
                    claims: ["long-distance moving services"],
                  }),
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, totalTokenCount: 140 },
      },
    }));
    const generator = createConfiguredTitleH1Generator(
      {
        PROPOSAL_GENERATOR_PROVIDER: "gemini",
        GEMINI_API_KEY: "server-secret",
        GEMINI_PROPOSAL_MODEL: "configured-model",
      },
      transport,
    );

    const result = await generator.generate(bundle);
    const request = transport.mock.calls[0]![0];

    expect(request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/configured-model:generateContent",
    );
    expect(request.headers).toMatchObject({ "x-goog-api-key": "server-secret" });
    expect(request.body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
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
      },
    });
    expect(Object.keys(request.body.generationConfig.responseJsonSchema.properties).sort()).toEqual(
      [
        "claims",
        "confidenceRationale",
        "expectedMetric",
        "proposedH1",
        "proposedTitle",
        "rationale",
        "reversal",
        "verification",
      ],
    );
    expect(result).toMatchObject({
      draft: { proposedTitle: "Long Distance Movers | TruMove", expectedMetric: "ctr" },
      provider: "gemini",
      model: "configured-model",
      usage: { totalTokenCount: 140 },
    });
  });

  it("revalidates returned JSON and never includes the key in provider errors", async () => {
    const transport = vi.fn<GeminiTransport>(async () => ({
      status: 400,
      body: { error: { message: "bad request" } },
    }));
    const generator = createConfiguredTitleH1Generator(
      {
        PROPOSAL_GENERATOR_PROVIDER: "gemini",
        GEMINI_API_KEY: "must-not-leak",
        GEMINI_PROPOSAL_MODEL: "configured-model",
      },
      transport,
    );

    await expect(generator.generate(bundle)).rejects.toThrow(
      "Gemini generation failed with HTTP 400",
    );
    await expect(generator.generate(bundle)).rejects.not.toThrow("must-not-leak");
  });
});
