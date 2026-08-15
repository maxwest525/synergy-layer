/**
 * Backlink analysis strategy defaults.
 *
 * Methodology source (strategy, NOT provider documentation):
 *   repo:   https://github.com/AgriciDaniel/claude-seo
 *   path:   skills/seo-backlinks/SKILL.md
 *   version: 2.2.4
 *   commit: 6b63c8bb7b2e8e4480060604555e3af629b54c2c (2026-07-20)
 *   license: MIT
 *
 * These are DEFAULTS, not truth. The playbook's numbers are heuristics written
 * for a generic audit, so nothing here is hardcoded into a rule: every value is
 * overridable per tenant and is expected to move as real TruMove evidence and
 * outcomes accumulate. Provider facts (counts, spam scores, anchors, ranks)
 * come from DataForSEO. This file only decides how to reason about them.
 */

export type SourceConfidence = {
  /** Where the figure came from. */
  source: "dataforseo" | "search_console" | "derived";
  /** 0-1. Used for weighting, never presented as accuracy. */
  confidence: number;
  /** Human-readable provenance for evidence payloads. */
  label: string;
};

export const STRATEGY_SOURCE = {
  kind: "strategy_playbook",
  repo: "https://github.com/AgriciDaniel/claude-seo",
  path: "skills/seo-backlinks/SKILL.md",
  version: "2.2.4",
  commit: "6b63c8bb7b2e8e4480060604555e3af629b54c2c",
  authoritative: false,
} as const;

/** Profile-level bands. Defaults from the playbook, tunable per tenant. */
export const PROFILE_DEFAULTS = {
  referringDomains: { good: 100, warning: 20 },
  followRatio: { good: 0.6, warning: 0.4 },
  /** Share of backlinks allowed from a single referring domain. */
  singleDomainShare: { warning: 0.1, critical: 0.25 },
  /** Quarter-over-quarter decline that counts as a rapid drop. */
  rapidDeclineQuarterly: 0.2,
};

/** Anchor distribution bands, expressed as shares of total anchors. */
export const ANCHOR_DEFAULTS = {
  branded: { targetMin: 0.3, targetMax: 0.5, underOptimized: 0.15 },
  naked: { targetMin: 0.15, targetMax: 0.25 },
  generic: { targetMin: 0.1, targetMax: 0.2 },
  exactMatch: { targetMin: 0.03, targetMax: 0.1, overOptimized: 0.15 },
  partialMatch: { targetMin: 0.05, targetMax: 0.15, overOptimized: 0.25 },
};

/** Toxicity review triggers. A trigger opens a review, it never disavows. */
export const TOXIC_DEFAULTS = {
  /** DataForSEO spam score above which a referring domain is flagged. */
  spamScoreFlag: 40,
  /** Spam score treated as high risk. */
  spamScoreHighRisk: 60,
  /** Backlinks from one domain above which concentration is suspicious. */
  backlinksFromSingleDomain: 50,
  /** Share of a domain's anchors that are exact match before it looks unnatural. */
  exactMatchShareFromDomain: 1,
};

/** Competitor link-gap defaults. Gap analysis stays off until enabled explicitly. */
export const LINK_GAP_DEFAULTS = {
  maxOpportunities: 20,
  minCompetitorsLinking: 2,
  minReferringDomainRank: 10,
};

/** New/lost link velocity windows, in days. */
export const VELOCITY_DEFAULTS = {
  windows: [30, 60, 90],
  spikeMultiplier: 3,
  lossShareAlert: 0.2,
};

/**
 * Health-score factors and weights. Weights are redistributed across the
 * factors that actually have evidence.
 */
export const HEALTH_FACTORS = [
  { key: "referring_domain_count", weight: 0.2 },
  { key: "domain_quality_distribution", weight: 0.2 },
  { key: "anchor_naturalness", weight: 0.15 },
  { key: "toxic_link_ratio", weight: 0.2 },
  { key: "link_velocity", weight: 0.1 },
  { key: "follow_ratio", weight: 0.05 },
  { key: "geographic_relevance", weight: 0.1 },
] as const;

/**
 * Data-sufficiency gate. A number invented from two data points reads as "this
 * profile is unhealthy" when the truth is "we do not know yet", so below the
 * floor AOOS reports the gap instead of a score.
 */
export const SUFFICIENCY = {
  minScoredFactors: 4,
  totalFactors: HEALTH_FACTORS.length,
};

export type HealthFactorScore = {
  key: string;
  /** 0-100, or null when there is no evidence for this factor. */
  score: number | null;
  provenance: SourceConfidence | null;
};

export type HealthScore =
  | {
      sufficient: true;
      score: number;
      scoredFactors: number;
      totalFactors: number;
      factors: HealthFactorScore[];
    }
  | {
      sufficient: false;
      reason: string;
      scoredFactors: number;
      totalFactors: number;
      factors: HealthFactorScore[];
    };

/**
 * Weighted health score with the sufficiency gate applied. Missing factors have
 * their weight redistributed across the scored ones rather than counting as zero.
 */
export function scoreBacklinkHealth(factors: HealthFactorScore[]): HealthScore {
  const weights = new Map<string, number>(
    HEALTH_FACTORS.map((factor) => [factor.key, factor.weight]),
  );
  const scored = factors.filter((factor) => factor.score !== null && weights.has(factor.key));
  const totalFactors = SUFFICIENCY.totalFactors;

  if (scored.length < SUFFICIENCY.minScoredFactors) {
    return {
      sufficient: false,
      reason: `Insufficient backlink evidence: ${scored.length} of ${totalFactors} factors have data, ${SUFFICIENCY.minScoredFactors} required. A score here would read as poor health when the real state is unknown.`,
      scoredFactors: scored.length,
      totalFactors,
      factors,
    };
  }

  const weightSum = scored.reduce((sum, factor) => sum + (weights.get(factor.key) ?? 0), 0);
  const weighted = scored.reduce(
    (sum, factor) => sum + (factor.score ?? 0) * ((weights.get(factor.key) ?? 0) / weightSum),
    0,
  );

  return {
    sufficient: true,
    score: Math.round(weighted),
    scoredFactors: scored.length,
    totalFactors,
    factors,
  };
}
