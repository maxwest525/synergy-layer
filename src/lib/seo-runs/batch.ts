import { requireProposalTarget } from "../title-h1-proposals";

export const maxSeoRunBatchSize = 100;

type CreatedSeoRun = {
  id: string;
  target_url: string;
};

export function getSeoRunProviderBudget(pages: number) {
  if (!Number.isInteger(pages) || pages < 1 || pages > maxSeoRunBatchSize) {
    throw new Error(`A batch must contain between 1 and ${maxSeoRunBatchSize} pages.`);
  }
  return {
    pages,
    geminiEmbeddingRequests: pages * 2,
    geminiGenerationRequests: pages,
    firecrawlRenders: pages,
    githubReads: pages * 2,
    dataForSeoRequests: 0,
  };
}

export async function runCreatedSeoBatch(
  runs: CreatedSeoRun[],
  evaluate: (id: string) => Promise<unknown>,
) {
  let advanced = 0;
  const stopped: string[] = [];

  for (const run of runs) {
    try {
      await evaluate(run.id);
      advanced += 1;
    } catch {
      stopped.push(run.target_url);
    }
  }

  return { advanced, stopped };
}

export function canonicalSeoRunTarget(value: string) {
  const url = new URL(value);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${pathname}${url.search}`;
}

export function parseSeoRunTargets(value: string): string[] {
  const lines = value.split(/\r?\n/);
  const targets: string[] = [];
  const seen = new Set<string>();

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    let target: string;
    try {
      target = requireProposalTarget(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enter a valid page URL.";
      throw new Error(`Line ${index + 1}: ${message}`);
    }

    const key = canonicalSeoRunTarget(target);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }

  if (targets.length === 0) throw new Error("Enter at least one TruMove page URL.");
  if (targets.length > maxSeoRunBatchSize) {
    throw new Error(`A batch can contain at most ${maxSeoRunBatchSize} unique pages.`);
  }
  return targets;
}
