import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GEMINI_GENERATION_MODEL,
  GEMINI_API_ORIGIN,
  generatePageMetadataWording,
  generateTitleH1Wording,
} from "./gemini.server";

describe("direct Gemini structured output", () => {
  it("calls Google directly with a strict wording-only JSON schema", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        seoTitle: "Employee Relocation Movers | TruMove",
                        h1: "Employee Relocation Moving Services",
                        rationale: "Uses the query language already observed for this page.",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const result = await generateTitleH1Wording({
      apiKey: "test-key",
      model: "gemini-test",
      prompt: "draft wording only",
      fetcher,
    });

    expect(result.h1).toContain("Employee Relocation");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(`${GEMINI_API_ORIGIN}/v1beta/models/gemini-test:generateContent`);
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");

    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.required).toEqual([
      "seoTitle",
      "h1",
      "rationale",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/lovable/i);
  });

  it("writes nothing by returning an error when Gemini output is malformed", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "{not-json" }] } }],
          }),
          { status: 200 },
        ),
    );

    await expect(
      generateTitleH1Wording({
        apiKey: "test-key",
        model: "gemini-test",
        prompt: "draft",
        fetcher,
      }),
    ).rejects.toThrow(/structured JSON/i);
  });

  it("requests meta description wording with its own strict JSON schema", async () => {
    const metaDescription =
      "Employee relocation movers with dedicated coordinators, transparent corporate pricing, and guaranteed move dates from TruMove.";
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        metaDescription,
                        rationale: "Uses the query language already observed for this page.",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const result = await generatePageMetadataWording({
      apiKey: "test-key",
      model: "gemini-test",
      prompt: "draft wording only",
      fetcher,
    });

    expect(result.metaDescription).toBe(metaDescription);
    const [, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.required).toEqual([
      "metaDescription",
      "rationale",
    ]);
  });

  it("refuses a meta description outside the published bounds", async () => {
    const fetcher = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        metaDescription: "Too short to serve as a meta description.",
                        rationale: "Short.",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );

    await expect(
      generatePageMetadataWording({
        apiKey: "test-key",
        model: "gemini-test",
        prompt: "draft",
        fetcher,
      }),
    ).rejects.toThrow(/shorter than 70/);
  });

  it("uses the current stable production model when no model override is configured", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    seoTitle: "Long Distance Movers | TruMove",
                    h1: "Long Distance Moving Services",
                    rationale: "Matches the service intent.",
                  }),
                },
              ],
            },
          },
        ],
      }),
    );

    await generateTitleH1Wording({
      apiKey: "test-key",
      model: "",
      prompt: "draft",
      fetcher,
    });

    expect((fetcher.mock.calls as unknown as unknown[][])[0]?.[0]).toBe(
      `${GEMINI_API_ORIGIN}/v1beta/models/${DEFAULT_GEMINI_GENERATION_MODEL}:generateContent`,
    );
  });
});
