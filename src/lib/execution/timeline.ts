export type StoredExecutionFacts = {
  sourceCommitSha: string | null;
  sourceCommitUrl: string | null;
  sourceCommittedAt: string | null;
  publishedProofAt: string | null;
  publishedProofNotes: string | null;
};

export type LoadedExecutionFacts = {
  commitSha: string | null;
  commitUrl: string | null;
  committedAt: string | null;
  publishedProofAt: string | null;
  publishedProofNotes: string | null;
};

/**
 * The change-request row owns lifecycle truth. The secondary execution query
 * adds readiness and attempts, but its loading state must never temporarily
 * erase a commit or rendered proof already present on the parent record.
 */
export function reconcileExecutionFacts(
  stored: StoredExecutionFacts,
  loaded?: LoadedExecutionFacts,
): LoadedExecutionFacts {
  return {
    commitSha: loaded?.commitSha ?? stored.sourceCommitSha,
    commitUrl: loaded?.commitUrl ?? stored.sourceCommitUrl,
    committedAt: loaded?.committedAt ?? stored.sourceCommittedAt,
    publishedProofAt: loaded?.publishedProofAt ?? stored.publishedProofAt,
    publishedProofNotes: loaded?.publishedProofNotes ?? stored.publishedProofNotes,
  };
}
