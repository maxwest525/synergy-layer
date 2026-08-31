import type { ModelRole } from "./routing";

/**
 * What a model call costs, in dollars per million tokens.
 *
 * There is no hardcoded price table here on purpose. The models this proxy
 * calls (see `DEFAULT_MODELS` in `routing.ts`) do not have a price this file
 * can state as fact -- rates vary by proxy, by negotiated OpenRouter terms,
 * and by model version, and a guessed number would make the budget ceiling
 * enforce a number nobody actually agreed to. The operator sets the real rate
 * from their own proxy's rate card; a role with no rate set is priced as
 * `null`, which callers must treat as "cost unknown", never as free.
 */
export type TokenPricing = {
  readonly inputPerMillionUsd: number;
  readonly outputPerMillionUsd: number;
};

const PRICE_ENV: Record<ModelRole, { input: string; output: string }> = {
  reasoning: {
    input: "AI_PRICE_REASONING_INPUT_PER_1M",
    output: "AI_PRICE_REASONING_OUTPUT_PER_1M",
  },
  fast: { input: "AI_PRICE_FAST_INPUT_PER_1M", output: "AI_PRICE_FAST_OUTPUT_PER_1M" },
  wording: { input: "AI_PRICE_WORDING_INPUT_PER_1M", output: "AI_PRICE_WORDING_OUTPUT_PER_1M" },
  embedding: {
    input: "AI_PRICE_EMBEDDING_INPUT_PER_1M",
    output: "AI_PRICE_EMBEDDING_OUTPUT_PER_1M",
  },
};

function nonNegativeNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The configured rate for one role, or `null` when the operator has not set
 * both env vars for it. Both must be present -- a role priced on input alone
 * would silently treat every output token as free, which is not what an
 * unset variable should mean.
 */
export function pricingForRole(
  env: Record<string, string | undefined>,
  role: ModelRole,
): TokenPricing | null {
  const names = PRICE_ENV[role];
  const inputPerMillionUsd = nonNegativeNumber(env[names.input]);
  const outputPerMillionUsd = nonNegativeNumber(env[names.output]);
  if (inputPerMillionUsd === null || outputPerMillionUsd === null) return null;
  return { inputPerMillionUsd, outputPerMillionUsd };
}

/** Dollar cost of one call, given its real (or estimated) token counts. */
export function estimateCostUsd(
  pricing: TokenPricing,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  );
}

/**
 * Four characters per token is the same rough, admittedly-rough conversion
 * `ai/routing.ts` already uses to decide whether a prompt is worth caching --
 * reused here only to guess a call's cost *before* it returns real usage, for
 * the pre-call budget check. `recordAiSpend` is always given the provider's
 * actual reported usage afterward, never this estimate.
 */
export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4);
}
