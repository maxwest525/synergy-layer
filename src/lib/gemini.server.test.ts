import { describe, expect, it, vi } from "vitest";

import { GEMINI_API_ORIGIN, generateTitleH1Wording } from "./gemini.server";

describe("direct Gemini structured output", () => {
  it("calls Google directly with a strict wording-only JSON schema", async () => {
    const fetcher = vi.fn(async () =>
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
    expect(String(url)).toBe(
      `${GEMINI_API_ORIGIN}/v1beta/models/gemini-test:generateContent`,
    );
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
    const fetcher = vi.fn(async () =>
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
});
