/**
 * Reads the words a `ga4.rules` workflow step left about itself. The step
 * output is `runGa4DailyRules`'s result: one entry per tenant with the rules
 * it evaluated and the sentences naming what kept the others from running
 * (CODE-47). Pure, so the shape is pinned by a test rather than by the screen.
 */

export type Ga4RuleRunWords = {
  ranAt: string | null;
  reportingDate: string | null;
  rulesEvaluated: string[];
  unmet: string[];
};

type StepEntry = {
  tenantId?: unknown;
  reportingDate?: unknown;
  rulesEvaluated?: unknown;
  unmet?: unknown;
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function latestGa4RuleRun(input: {
  startedAt: string | null;
  output: unknown;
  tenantId: string;
}): Ga4RuleRunWords | null {
  const output = input.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const results = (output as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  const mine = (results as StepEntry[]).find((entry) => entry.tenantId === input.tenantId);
  if (!mine) return null;
  return {
    ranAt: input.startedAt,
    reportingDate: typeof mine.reportingDate === "string" ? mine.reportingDate : null,
    rulesEvaluated: strings(mine.rulesEvaluated),
    unmet: strings(mine.unmet),
  };
}
