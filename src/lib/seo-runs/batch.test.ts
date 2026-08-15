import { describe, expect, it } from "vitest";

import { getSeoRunProviderBudget, parseSeoRunTargets, runCreatedSeoBatch } from "./batch";

describe("SEO run batch targets", () => {
  it("normalizes, deduplicates, and numbers real TruMove page URLs", () => {
    expect(
      parseSeoRunTargets(`
        https://trumoveinc.com/services/
        https://trumoveinc.com/services/#quote
        https://trumoveinc.com/about
      `),
    ).toEqual(["https://trumoveinc.com/services/", "https://trumoveinc.com/about"]);
  });

  it("rejects an invalid or outside-domain target with its line number", () => {
    expect(() =>
      parseSeoRunTargets("https://trumoveinc.com/services\nhttps://example.com/fake"),
    ).toThrow("Line 2");
  });

  it("requires at least one target and caps a batch at 100", () => {
    expect(() => parseSeoRunTargets("\n  \n")).toThrow("Enter at least one");
    const tooMany = Array.from(
      { length: 101 },
      (_, index) => `https://trumoveinc.com/page-${index}`,
    ).join("\n");
    expect(() => parseSeoRunTargets(tooMany)).toThrow("100");
  });
});

describe("SEO run batch execution", () => {
  it("calculates the exact maximum external work for the confirmed batch", () => {
    expect(getSeoRunProviderBudget(3)).toEqual({
      pages: 3,
      geminiEmbeddingRequests: 6,
      geminiGenerationRequests: 3,
      firecrawlRenders: 3,
      githubReads: 6,
      dataForSeoRequests: 0,
    });
  });

  it("advances every created run and reports stopped pages without abandoning the batch", async () => {
    const evaluated: string[] = [];
    const result = await runCreatedSeoBatch(
      [
        { id: "run-1", target_url: "https://trumoveinc.com/one" },
        { id: "run-2", target_url: "https://trumoveinc.com/two" },
        { id: "run-3", target_url: "https://trumoveinc.com/three" },
      ],
      async (id) => {
        evaluated.push(id);
        if (id === "run-2") throw new Error("blocked");
      },
    );

    expect(evaluated).toEqual(["run-1", "run-2", "run-3"]);
    expect(result).toEqual({
      advanced: 2,
      stopped: ["https://trumoveinc.com/two"],
    });
  });
});
