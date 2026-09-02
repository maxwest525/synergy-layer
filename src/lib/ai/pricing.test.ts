import { describe, expect, it } from "vitest";

import { estimateCostUsd, estimateTokensFromChars, pricingForRole } from "./pricing";

describe("model pricing is operator-configured, never guessed", () => {
  it("is null when neither price env var is set", () => {
    expect(pricingForRole({}, "wording")).toBeNull();
  });

  it("is null when only one side of the pair is set", () => {
    expect(pricingForRole({ AI_PRICE_WORDING_INPUT_PER_1M: "0.10" }, "wording")).toBeNull();
  });

  it("accepts an explicit zero rate rather than treating it as unset", () => {
    // Embeddings genuinely have no output-token cost on most providers, but
    // that must be stated, not defaulted -- an omitted var still means null.
    expect(
      pricingForRole(
        {
          AI_PRICE_EMBEDDING_INPUT_PER_1M: "0.02",
          AI_PRICE_EMBEDDING_OUTPUT_PER_1M: "0",
        },
        "embedding",
      ),
    ).toEqual({ inputPerMillionUsd: 0.02, outputPerMillionUsd: 0 });
  });

  it("rejects a negative or non-numeric rate rather than silently pricing at it", () => {
    expect(
      pricingForRole(
        { AI_PRICE_FAST_INPUT_PER_1M: "-1", AI_PRICE_FAST_OUTPUT_PER_1M: "0.30" },
        "fast",
      ),
    ).toBeNull();
    expect(
      pricingForRole(
        { AI_PRICE_FAST_INPUT_PER_1M: "not-a-number", AI_PRICE_FAST_OUTPUT_PER_1M: "0.30" },
        "fast",
      ),
    ).toBeNull();
  });

  it("reads each role from its own pair of env vars, not a shared one", () => {
    const env = {
      AI_PRICE_REASONING_INPUT_PER_1M: "3.00",
      AI_PRICE_REASONING_OUTPUT_PER_1M: "15.00",
      AI_PRICE_FAST_INPUT_PER_1M: "0.10",
      AI_PRICE_FAST_OUTPUT_PER_1M: "0.40",
    };
    expect(pricingForRole(env, "reasoning")).toEqual({
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 15,
    });
    expect(pricingForRole(env, "fast")).toEqual({
      inputPerMillionUsd: 0.1,
      outputPerMillionUsd: 0.4,
    });
  });
});

describe("estimateCostUsd", () => {
  it("charges input and output tokens at their own per-million rate", () => {
    const cost = estimateCostUsd(
      { inputPerMillionUsd: 1, outputPerMillionUsd: 2 },
      500_000,
      250_000,
    );
    expect(cost).toBeCloseTo(0.5 + 0.5, 6);
  });

  it("is zero for a zero-token call", () => {
    expect(estimateCostUsd({ inputPerMillionUsd: 5, outputPerMillionUsd: 5 }, 0, 0)).toBe(0);
  });
});

describe("estimateTokensFromChars", () => {
  it("rounds up rather than under-estimating the pre-call guess", () => {
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(4)).toBe(1);
    expect(estimateTokensFromChars(5)).toBe(2);
  });
});
