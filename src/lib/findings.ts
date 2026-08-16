import { isObservationOnly } from "./recommendation-action";

type RecommendationApprovalShape = {
  id?: string;
  state: string;
  requires_approval: boolean;
  metadata: unknown;
};

type InboxApprovalShape = {
  lane: string;
  subject_kind: string | null;
  subject_id: string | null;
};

export function findingPersistence(metadata: unknown) {
  if (!isObservationOnly(metadata)) {
    throw new Error("Only observation-only findings use this persistence path.");
  }

  return { state: "observed" as const, requiresApproval: false as const };
}

export function isApprovalEligibleRecommendation(row: RecommendationApprovalShape): boolean {
  return !isObservationOnly(row.metadata) && row.requires_approval && row.state === "proposed";
}

export function withoutIneligibleRecommendationApprovals<T extends InboxApprovalShape>(
  inbox: T[],
  recommendations: (RecommendationApprovalShape & { id: string })[],
): T[] {
  const recommendationsById = new Map(recommendations.map((row) => [row.id, row]));

  return inbox.filter((item) => {
    if (item.lane !== "pending_approval" || item.subject_kind !== "recommendation") return true;
    if (!item.subject_id) return false;
    const recommendation = recommendationsById.get(item.subject_id);
    return recommendation ? isApprovalEligibleRecommendation(recommendation) : false;
  });
}
