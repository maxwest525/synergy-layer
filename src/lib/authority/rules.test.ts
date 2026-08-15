import { describe, expect, it } from "vitest";

import { evaluateAuthorityRules } from "./rules";
import type { AuthorityEvidenceInput } from "./types";

function base(overrides: Partial<AuthorityEvidenceInput> = {}): AuthorityEvidenceInput {
  return {
    targetUrl: "https://trumoveinc.com/services/long-distance-moving",
    queryClass: "local_service",
    observedRanks: [],
    knowledgeChunkIds: ["chunk-1"],
    ...overrides,
  };
}

describe("Authority Science rules", () => {
  it("separates one observed rank from ranking capacity", () => {
    const findings = evaluateAuthorityRules(base({ observedRanks: [1] }));
    const finding = findings.find((item) => item.ruleKey === "authority.rank_is_not_capacity")!;

    expect(finding.severity).toBe("info");
    expect(finding.confidence).toBe("high");
    expect(finding.observed).toMatchObject({ observationCount: 1, bestRank: 1 });
    expect(JSON.stringify(finding)).not.toContain("high authority");
  });

  it("gates irrelevant targets instead of recommending authority work", () => {
    const finding = evaluateAuthorityRules(base({ relevanceScore: 0.31 })).find(
      (item) => item.ruleKey === "authority.relevance_floor",
    )!;

    expect(finding.severity).toBe("high");
    expect(finding.permittedActions.map((action) => action.actionKey)).toEqual([
      "improve_query_fit",
      "do_not_compete",
    ]);
  });

  it("prices rented authority and requires measured transfer", () => {
    const findings = evaluateAuthorityRules(
      base({ publishingSurface: "reddit", sourcePlatformEffect: 0.4 }),
    );

    expect(findings.map((item) => item.ruleKey)).toContain("authority.rented_vs_owned");
    expect(findings.map((item) => item.ruleKey)).toContain("authority.transfer_readiness");
    expect(
      findings.find((item) => item.ruleKey === "authority.transfer_readiness")?.missingEvidence,
    ).toContain("controlled owned-site outcome after platform publication");
  });

  it("enforces information-gain rejection and improvement bands", () => {
    const rejected = evaluateAuthorityRules(
      base({ novelClaimShare: 0.1, evidenceIntegrity: 0.8, userRelevance: 0.9 }),
    ).find((item) => item.ruleKey === "authority.information_gain")!;
    const improve = evaluateAuthorityRules(
      base({ novelClaimShare: 0.3, evidenceIntegrity: 0.8, userRelevance: 0.8 }),
    ).find((item) => item.ruleKey === "authority.information_gain")!;

    expect(rejected.observed["informationGain"]).toBeCloseTo(0.072);
    expect(rejected.permittedActions[0]?.actionKey).toBe("reject_or_consolidate");
    expect(improve.permittedActions[0]?.actionKey).toBe("increase_information_gain");
  });

  it("triggers freshness review after a fact-class half-life", () => {
    const finding = evaluateAuthorityRules(
      base({
        contentAgeDays: 45,
        factHalfLifeDays: 30,
        expectedStalenessLoss: 500,
        refreshCost: 100,
        changeRisk: 50,
      }),
    ).find((item) => item.ruleKey === "authority.freshness_decay")!;

    expect(finding.permittedActions[0]?.actionKey).toBe("reverify_and_refresh");
  });

  it("detects insufficient entity corroboration", () => {
    const finding = evaluateAuthorityRules(
      base({ entityCorroborationScore: 0.35, entityCorroborationThreshold: 0.7 }),
    ).find((item) => item.ruleKey === "authority.entity_corroboration")!;

    expect(finding.severity).toBe("high");
    expect(finding.permittedActions[0]?.actionKey).toBe("corroborate_entity_claims");
  });

  it("prioritizes orphaned internal-link targets", () => {
    const finding = evaluateAuthorityRules(
      base({ internalLinkCount: 0, internalLinkPriority: 0.82 }),
    ).find((item) => item.ruleKey === "authority.internal_link_priority")!;

    expect(finding.permittedActions[0]).toMatchObject({
      actionKey: "add_relevant_internal_links",
      requiresExactChange: true,
    });
  });

  it("separates ranking from satisfaction evidence", () => {
    const finding = evaluateAuthorityRules(base({ observedRanks: [4, 5, 3] })).find(
      (item) => item.ruleKey === "authority.satisfaction_gap",
    )!;

    expect(finding.missingEvidence).toContain("task success or comprehension measurement");
  });

  it("raises drift alerts from PSI or sustained citation churn", () => {
    const psi = evaluateAuthorityRules(base({ rankingPsi: 0.24 })).find(
      (item) => item.ruleKey === "authority.drift",
    );
    const churn = evaluateAuthorityRules(
      base({ citationJaccard: 0.42, citationChurnWindows: 2 }),
    ).find((item) => item.ruleKey === "authority.drift");

    expect(psi?.severity).toBe("high");
    expect(churn?.severity).toBe("high");
  });
});
