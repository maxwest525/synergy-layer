export type AuthorityQueryClass =
  "community" | "local_service" | "professional_b2b" | "ymyl" | "general";

export type AuthorityAction = {
  actionKey: string;
  label: string;
  requiresExactChange: boolean;
  rationale: string;
};

export type AuthorityFinding = {
  ruleKey: string;
  targetUrl: string;
  queryClass: AuthorityQueryClass;
  severity: "info" | "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  observed: Record<string, unknown>;
  missingEvidence: string[];
  permittedActions: AuthorityAction[];
  knowledgeChunkIds: string[];
};

export type AuthorityEvidenceInput = {
  targetUrl: string;
  queryClass: AuthorityQueryClass;
  observedRanks: number[];
  knowledgeChunkIds: string[];
  relevanceScore?: number;
  publishingSurface?: "owned" | "reddit" | "linkedin" | "youtube" | "earned_media" | "directory";
  sourcePlatformEffect?: number;
  ownedOutcomeAfter?: number;
  counterfactualOwnedOutcome?: number;
  novelClaimShare?: number;
  evidenceIntegrity?: number;
  userRelevance?: number;
  contentAgeDays?: number;
  factHalfLifeDays?: number;
  expectedStalenessLoss?: number;
  refreshCost?: number;
  changeRisk?: number;
  entityCorroborationScore?: number;
  entityCorroborationThreshold?: number;
  internalLinkCount?: number;
  internalLinkPriority?: number;
  taskSuccess?: number;
  comprehension?: number;
  rankingPsi?: number;
  citationJaccard?: number;
  citationChurnWindows?: number;
};
