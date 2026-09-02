import type { AuthorityAction, AuthorityEvidenceInput, AuthorityFinding } from "./types";

const action = (
  actionKey: string,
  label: string,
  rationale: string,
  requiresExactChange = false,
): AuthorityAction => ({ actionKey, label, rationale, requiresExactChange });

function finding(
  input: AuthorityEvidenceInput,
  value: Omit<AuthorityFinding, "targetUrl" | "queryClass" | "knowledgeChunkIds">,
): AuthorityFinding {
  return {
    ...value,
    targetUrl: input.targetUrl,
    queryClass: input.queryClass,
    knowledgeChunkIds: [...input.knowledgeChunkIds],
  };
}

/**
 * The evidence the evaluator supplies is observed ranks for the target from
 * stored Search Console page-query rows, and nothing else. Eight rules used to
 * wait here on inputs nothing in AOOS produces (a relevance score, a rented
 * publishing surface, information-gain shares, fact half-lives, entity
 * corroboration, internal-link priority, PSI and citation drift), so they
 * could never fire, and the operator page implied a reading that was never
 * made (CONTENT-4). Two rules read what exists. A rule for evidence that is
 * not collected is written the day the collection is.
 */
export function evaluateAuthorityRules(input: AuthorityEvidenceInput): AuthorityFinding[] {
  const findings: AuthorityFinding[] = [];
  const ranks = input.observedRanks.filter((rank) => Number.isFinite(rank) && rank > 0);
  if (ranks.length > 0 && ranks.length < 5) {
    findings.push(
      finding(input, {
        ruleKey: "authority.rank_is_not_capacity",
        severity: "info",
        confidence: "high",
        observed: {
          observationCount: ranks.length,
          bestRank: Math.min(...ranks),
          averageRank: ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length,
        },
        missingEvidence: ["repeated matched-query observations across a defined horizon"],
        permittedActions: [
          action(
            "collect_comparable_rank_observations",
            "Collect comparable ranking observations",
            "Ranking capacity requires repeated matched observations; a single rank is only an outcome.",
          ),
        ],
      }),
    );
  }

  if (
    ranks.length > 0 &&
    ranks.some((rank) => rank <= 10) &&
    input.taskSuccess === undefined &&
    input.comprehension === undefined
  ) {
    findings.push(
      finding(input, {
        ruleKey: "authority.satisfaction_gap",
        severity: "medium",
        confidence: "high",
        observed: { topTenObserved: true, observedRanks: ranks },
        missingEvidence: ["task success or comprehension measurement"],
        permittedActions: [
          action(
            "instrument_search_satisfaction",
            "Instrument search satisfaction",
            "Ranking is not proof that the result solved the user's problem.",
          ),
        ],
      }),
    );
  }

  return findings;
}
