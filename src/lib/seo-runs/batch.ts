import { requireProposalTarget } from "../title-h1-proposals";

export const maxSeoRunBatchSize = 100;

type CreatedSeoRun = {
  id: string;
  target_url: string;
};

export type SeoBatchProgress = {
  completed: number;
  total: number;
  advanced: number;
  stopped: number;
};

function returnedStoppedState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as Record<string, unknown>)["state"];
  return state === "preflight_blocked" || state === "failed";
}

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
  options: {
    concurrency?: number;
    onProgress?: (progress: SeoBatchProgress) => void;
  } = {},
) {
  let advanced = 0;
  let nextIndex = 0;
  const stopped = new Set<number>();
  const workerCount = Math.min(runs.length, options.concurrency ?? 4);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < runs.length) {
        const index = nextIndex;
        nextIndex += 1;
        const run = runs[index];
        if (!run) break;
        try {
          const result = await evaluate(run.id);
          if (returnedStoppedState(result)) stopped.add(index);
          else advanced += 1;
        } catch {
          stopped.add(index);
        }
        options.onProgress?.({
          completed: advanced + stopped.size,
          total: runs.length,
          advanced,
          stopped: stopped.size,
        });
      }
    }),
  );

  return {
    advanced,
    stopped: runs.flatMap((run, index) => (stopped.has(index) ? [run.target_url] : [])),
  };
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
