import type { TitleH1Draft, TitleH1EvidenceBundle } from "./types";

export const TITLE_H1_LIMITS = {
  title: { min: 20, max: 65 },
  h1: { min: 10, max: 80 },
} as const;

export type TitleH1ValidationCode =
  | "missing_title"
  | "missing_h1"
  | "unchanged_title"
  | "unchanged_h1"
  | "invalid_title_length"
  | "invalid_h1_length"
  | "invalid_characters"
  | "invalid_expected_metric"
  | "unsupported_claim"
  | "prohibited_wording"
  | "competitor_name"
  | "query_mismatch"
  | "duplicate_owned_pair"
  | "missing_execution_plan"
  | "live_before_mismatch";

export type TitleH1ValidationError = { code: TitleH1ValidationCode; message: string };

export type ValidationContext = {
  currentLive: { title: string | null; h1: string | null };
  ownedPairs: { title: string; h1: string }[];
};

function normalized(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesEvidence(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalized(needle);
  return normalizedNeedle.length > 0 && normalized(haystack).includes(normalizedNeedle);
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(
    normalized(value)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function hasControlCharacters(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- these characters cannot be published in metadata.
  return /[\u0000-\u001F\u007F]/.test(value);
}

function freshnessScore(bundle: TitleH1EvidenceBundle): number {
  const timestamps = [
    bundle.finding.observedAt,
    bundle.live.observedAt,
    bundle.gsc.observedAt,
    ...bundle.competitors.map((row) => row.observedAt),
  ]
    .map(Date.parse)
    .filter(Number.isFinite);
  if (timestamps.length === 0) return 0;
  const newest = Math.max(...timestamps);
  const oldest = Math.min(...timestamps);
  const ageDays = (newest - oldest) / 86_400_000;
  return ageDays <= 7 ? 1 : ageDays <= 30 ? 0.75 : 0.4;
}

export function validateTitleH1Draft(
  bundle: TitleH1EvidenceBundle,
  draft: TitleH1Draft,
  context: ValidationContext = {
    currentLive: { title: bundle.live.title, h1: bundle.live.h1s[0] ?? null },
    ownedPairs: [],
  },
) {
  const errors: TitleH1ValidationError[] = [];
  const title = draft.proposedTitle.trim();
  const h1 = draft.proposedH1.trim();
  const capturedTitle = bundle.live.title ?? "";
  const capturedH1 = bundle.live.h1s[0] ?? "";

  if (!title) errors.push({ code: "missing_title", message: "A proposed title is required." });
  if (!h1) errors.push({ code: "missing_h1", message: "A proposed H1 is required." });
  if (title && normalized(title) === normalized(capturedTitle)) {
    errors.push({ code: "unchanged_title", message: "The proposed title is unchanged." });
  }
  if (h1 && normalized(h1) === normalized(capturedH1)) {
    errors.push({ code: "unchanged_h1", message: "The proposed H1 is unchanged." });
  }
  if (
    title &&
    (title.length < TITLE_H1_LIMITS.title.min || title.length > TITLE_H1_LIMITS.title.max)
  ) {
    errors.push({
      code: "invalid_title_length",
      message: "The proposed title is outside configured limits.",
    });
  }
  if (h1 && (h1.length < TITLE_H1_LIMITS.h1.min || h1.length > TITLE_H1_LIMITS.h1.max)) {
    errors.push({
      code: "invalid_h1_length",
      message: "The proposed H1 is outside configured limits.",
    });
  }
  if (hasControlCharacters(title) || hasControlCharacters(h1)) {
    errors.push({
      code: "invalid_characters",
      message: "The proposed wording contains control characters.",
    });
  }

  if (!(["clicks", "impressions", "ctr", "position"] as string[]).includes(draft.expectedMetric)) {
    errors.push({
      code: "invalid_expected_metric",
      message: "Expected metric must be a supported Search Console metric.",
    });
  }

  const wording = `${title} ${h1}`;
  const prohibited =
    /\b(best|#\s*1|number\s+one|top[- ]rated|guaranteed?|cheap|affordable|licensed|accredited|insured)\b/i;
  if (
    prohibited.test(wording) &&
    !includesEvidence(bundle.live.mainText, wording.match(prohibited)?.[0] ?? "")
  ) {
    errors.push({
      code: "prohibited_wording",
      message:
        "The proposed wording contains an unsupported superlative, guarantee, price, or credential claim.",
    });
  }

  const unsupportedClaims = draft.claims.filter(
    (claim) => !includesEvidence(bundle.live.mainText, claim),
  );
  if (unsupportedClaims.length > 0) {
    errors.push({
      code: "unsupported_claim",
      message: `Unsupported claims: ${unsupportedClaims.join(", ")}.`,
    });
  }

  const competitorNames = bundle.competitors.flatMap((row) => {
    const host = row.domain.split(".")[0] ?? "";
    return host.length >= 4 ? [host] : [];
  });
  if (competitorNames.some((name) => meaningfulTokens(wording).has(normalized(name)))) {
    errors.push({
      code: "competitor_name",
      message: "The proposed wording contains a competitor name.",
    });
  }

  const wordingTokens = meaningfulTokens(wording);
  const queryAgreement = bundle.gsc.rows.some((row) => {
    const queryTokens = meaningfulTokens(row.query);
    return [...queryTokens].filter((token) => wordingTokens.has(token)).length >= 2;
  });
  if (!queryAgreement) {
    errors.push({
      code: "query_mismatch",
      message: "The proposal does not meaningfully align with the observed page queries.",
    });
  }

  if (
    context.ownedPairs.some(
      (pair) =>
        normalized(pair.title) === normalized(title) && normalized(pair.h1) === normalized(h1),
    )
  ) {
    errors.push({
      code: "duplicate_owned_pair",
      message: "Another owned page already uses this title and H1 combination.",
    });
  }

  if (!draft.verification.trim() || !draft.reversal.trim()) {
    errors.push({
      code: "missing_execution_plan",
      message: "Verification and reversal instructions are required.",
    });
  }

  if (
    normalized(context.currentLive.title) !== normalized(capturedTitle) ||
    normalized(context.currentLive.h1) !== normalized(capturedH1)
  ) {
    errors.push({
      code: "live_before_mismatch",
      message: "The live title or H1 changed after evidence capture.",
    });
  }

  const claimCoverage =
    draft.claims.length === 0
      ? 1
      : (draft.claims.length - unsupportedClaims.length) / draft.claims.length;
  const confidenceInputs = {
    sourceCoverage:
      bundle.live.title && bundle.gsc.rows.length > 0 && bundle.competitors.length > 0 ? 1 : 0,
    claimCoverage,
    freshness: freshnessScore(bundle),
    queryAgreement: queryAgreement ? 1 : 0,
  };
  const confidence = Number(
    (
      confidenceInputs.sourceCoverage * 0.35 +
      confidenceInputs.claimCoverage * 0.3 +
      confidenceInputs.freshness * 0.15 +
      confidenceInputs.queryAgreement * 0.2
    ).toFixed(2),
  );

  return errors.length === 0
    ? { valid: true as const, confidence, confidenceInputs }
    : { valid: false as const, errors, confidence, confidenceInputs };
}
