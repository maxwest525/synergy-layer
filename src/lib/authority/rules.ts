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

function bounded(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

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

  if (input.relevanceScore !== undefined && bounded(input.relevanceScore) < 0.55) {
    findings.push(
      finding(input, {
        ruleKey: "authority.relevance_floor",
        severity: "high",
        confidence: "high",
        observed: { relevanceScore: bounded(input.relevanceScore), relevanceFloor: 0.55 },
        missingEvidence: [],
        permittedActions: [
          action(
            "improve_query_fit",
            "Improve target and query fit",
            "Authority work is not permitted until the target is relevant enough to compete.",
            true,
          ),
          action(
            "do_not_compete",
            "Do not compete for this query",
            "Choose a different target when truthful relevance cannot be established.",
          ),
        ],
      }),
    );
  }

  const rented = input.publishingSurface !== undefined && input.publishingSurface !== "owned";
  if (rented) {
    findings.push(
      finding(input, {
        ruleKey: "authority.rented_vs_owned",
        severity: "medium",
        confidence: "high",
        observed: { publishingSurface: input.publishingSurface, ownership: "rented" },
        missingEvidence: [],
        permittedActions: [
          action(
            "capture_owned_demand",
            "Convert discovery into owned demand",
            "Preserve canonical evidence and measure referral, branded demand, links, and audience capture.",
            true,
          ),
        ],
      }),
    );
  }
  if (
    rented &&
    input.sourcePlatformEffect !== undefined &&
    (input.ownedOutcomeAfter === undefined || input.counterfactualOwnedOutcome === undefined)
  ) {
    findings.push(
      finding(input, {
        ruleKey: "authority.transfer_readiness",
        severity: "medium",
        confidence: "high",
        observed: { sourcePlatformEffect: input.sourcePlatformEffect },
        missingEvidence: ["controlled owned-site outcome after platform publication"],
        permittedActions: [
          action(
            "measure_authority_transfer",
            "Measure authority transfer",
            "Platform success transfers only when an owned outcome improves against a counterfactual.",
          ),
        ],
      }),
    );
  }

  if (
    input.novelClaimShare !== undefined &&
    input.evidenceIntegrity !== undefined &&
    input.userRelevance !== undefined
  ) {
    const informationGain =
      bounded(input.novelClaimShare) *
      bounded(input.evidenceIntegrity) *
      bounded(input.userRelevance);
    if (informationGain < 0.25) {
      const reject = informationGain < 0.1;
      findings.push(
        finding(input, {
          ruleKey: "authority.information_gain",
          severity: reject ? "high" : "medium",
          confidence: "medium",
          observed: {
            informationGain,
            novelClaimShare: bounded(input.novelClaimShare),
            evidenceIntegrity: bounded(input.evidenceIntegrity),
            userRelevance: bounded(input.userRelevance),
          },
          missingEvidence: [],
          permittedActions: [
            reject
              ? action(
                  "reject_or_consolidate",
                  "Reject or consolidate commodity content",
                  "Information gain below 0.10 is not a defensible publication candidate.",
                  true,
                )
              : action(
                  "increase_information_gain",
                  "Add supported information gain",
                  "Add a supported fact, mechanism, dataset, tool, example, or interpretation before publication.",
                  true,
                ),
          ],
        }),
      );
    }
  }

  if (input.contentAgeDays !== undefined && input.factHalfLifeDays !== undefined) {
    const staleByTime = input.contentAgeDays > input.factHalfLifeDays;
    const economicInputs =
      input.expectedStalenessLoss !== undefined &&
      input.refreshCost !== undefined &&
      input.changeRisk !== undefined;
    const refreshValue = economicInputs
      ? input.expectedStalenessLoss! - input.refreshCost! - input.changeRisk!
      : null;
    if (staleByTime && (refreshValue === null || refreshValue > 0)) {
      findings.push(
        finding(input, {
          ruleKey: "authority.freshness_decay",
          severity: "medium",
          confidence: economicInputs ? "high" : "medium",
          observed: {
            contentAgeDays: input.contentAgeDays,
            factHalfLifeDays: input.factHalfLifeDays,
            refreshValue,
          },
          missingEvidence: economicInputs
            ? []
            : ["refresh cost, change risk, and expected staleness loss"],
          permittedActions: [
            action(
              "reverify_and_refresh",
              "Reverify and refresh the affected claims",
              "A refresh must recheck the evidence and record what changed; changing only the date is prohibited.",
              true,
            ),
          ],
        }),
      );
    }
  }

  if (
    input.entityCorroborationScore !== undefined &&
    input.entityCorroborationScore < (input.entityCorroborationThreshold ?? 0.7)
  ) {
    findings.push(
      finding(input, {
        ruleKey: "authority.entity_corroboration",
        severity: "high",
        confidence: "medium",
        observed: {
          entityCorroborationScore: input.entityCorroborationScore,
          threshold: input.entityCorroborationThreshold ?? 0.7,
        },
        missingEvidence: ["independent corroboration for material entity claims"],
        permittedActions: [
          action(
            "corroborate_entity_claims",
            "Corroborate entity claims",
            "Verify identity, credentials, relationships, and claims with independent sources.",
            true,
          ),
        ],
      }),
    );
  }

  if (
    input.internalLinkCount !== undefined &&
    input.internalLinkPriority !== undefined &&
    (input.internalLinkCount === 0 || input.internalLinkPriority >= 0.5)
  ) {
    findings.push(
      finding(input, {
        ruleKey: "authority.internal_link_priority",
        severity: input.internalLinkCount === 0 ? "high" : "medium",
        confidence: "high",
        observed: {
          internalLinkCount: input.internalLinkCount,
          internalLinkPriority: input.internalLinkPriority,
        },
        missingEvidence: [],
        permittedActions: [
          action(
            "add_relevant_internal_links",
            "Add relevant internal links",
            "Link only from relevant strong pages where the destination advances the user's task.",
            true,
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

  const psiDrift = input.rankingPsi !== undefined && input.rankingPsi >= 0.2;
  const citationDrift =
    input.citationJaccard !== undefined &&
    input.citationJaccard < 0.5 &&
    (input.citationChurnWindows ?? 0) >= 2;
  if (psiDrift || citationDrift) {
    findings.push(
      finding(input, {
        ruleKey: "authority.drift",
        severity: "high",
        confidence: "high",
        observed: {
          rankingPsi: input.rankingPsi ?? null,
          citationJaccard: input.citationJaccard ?? null,
          citationChurnWindows: input.citationChurnWindows ?? null,
        },
        missingEvidence: [],
        permittedActions: [
          action(
            "investigate_authority_drift",
            "Investigate authority drift",
            "Check tracking, indexation, query mix, seasonality, competitors, result features, and policy changes before assigning cause.",
          ),
        ],
      }),
    );
  }

  return findings;
}
