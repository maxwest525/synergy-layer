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
  taskSuccess?: number;
  comprehension?: number;
};
