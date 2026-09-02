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

  it("separates ranking from satisfaction evidence", () => {
    const finding = evaluateAuthorityRules(base({ observedRanks: [4, 5, 3] })).find(
      (item) => item.ruleKey === "authority.satisfaction_gap",
    )!;

    expect(finding.missingEvidence).toContain("task success or comprehension measurement");
  });

  it("declares only the rules the supplied evidence can reach", () => {
    // The evaluator supplies observed ranks and nothing else (CONTENT-4).
    const keys = new Set(
      evaluateAuthorityRules(base({ observedRanks: [1, 2, 3, 4, 5, 6] })).map(
        (item) => item.ruleKey,
      ),
    );
    for (const key of keys) {
      expect(["authority.rank_is_not_capacity", "authority.satisfaction_gap"]).toContain(key);
    }
  });
});
