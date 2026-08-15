type SeoRunPreparationCandidate = {
  state: string;
  change_request_id: string | null;
};

export function isSeoRunEligibleForPreparation({
  state,
  change_request_id,
}: SeoRunPreparationCandidate): boolean {
  return (
    change_request_id === null &&
    (state === "draft" || state === "preflight_blocked" || state === "failed")
  );
}

export function isSeoRunEligibleForProposalEventRepair({
  state,
  change_request_id,
}: SeoRunPreparationCandidate): boolean {
  return state === "failed" && change_request_id !== null;
}
