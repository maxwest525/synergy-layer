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
