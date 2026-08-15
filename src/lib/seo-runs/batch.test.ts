import { describe, expect, it, vi } from "vitest";

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

  it("advances pages concurrently without exceeding the configured worker limit", async () => {
    let active = 0;
    let peak = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runs = Array.from({ length: 5 }, (_, index) => ({
      id: `run-${index + 1}`,
      target_url: `https://trumoveinc.com/page-${index + 1}`,
    }));

    const batch = runCreatedSeoBatch(
      runs,
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate;
        active -= 1;
      },
      { concurrency: 2 },
    );

    await vi.waitFor(() => expect(peak).toBe(2));
    release?.();
    await batch;

    expect(peak).toBe(2);
  });

  it("reports completed, advanced, and stopped counts after every page", async () => {
    const progress: Array<{
      completed: number;
      total: number;
      advanced: number;
      stopped: number;
    }> = [];

    await runCreatedSeoBatch(
      [
        { id: "run-1", target_url: "https://trumoveinc.com/one" },
        { id: "run-2", target_url: "https://trumoveinc.com/two" },
        { id: "run-3", target_url: "https://trumoveinc.com/three" },
      ],
      async (id) => {
        if (id === "run-2") throw new Error("blocked");
      },
      { concurrency: 1, onProgress: (value) => progress.push(value) },
    );

    expect(progress).toEqual([
      { completed: 1, total: 3, advanced: 1, stopped: 0 },
      { completed: 2, total: 3, advanced: 1, stopped: 1 },
      { completed: 3, total: 3, advanced: 2, stopped: 1 },
    ]);
  });

  it("counts a returned blocked state as stopped instead of advanced", async () => {
    const result = await runCreatedSeoBatch(
      [
        { id: "run-1", target_url: "https://trumoveinc.com/one" },
        { id: "run-2", target_url: "https://trumoveinc.com/two" },
        { id: "run-3", target_url: "https://trumoveinc.com/three" },
      ],
      async (id) => ({ state: id === "run-2" ? "preflight_blocked" : "awaiting_approval" }),
      { concurrency: 1 },
    );

    expect(result).toEqual({
      advanced: 2,
      stopped: ["https://trumoveinc.com/two"],
    });
  });
});
