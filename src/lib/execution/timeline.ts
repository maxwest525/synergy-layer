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

export type ReadinessFactView = {
  label: string;
  state: "stored" | "configured" | "proven" | "blocked";
  detail: string;
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

/** Keep the readiness list consistent with the authoritative lifecycle row. */
export function reconcileReadinessFacts(
  readiness: readonly ReadinessFactView[],
  facts: LoadedExecutionFacts,
): ReadinessFactView[] {
  const publishedProofAt = facts.publishedProofAt;
  if (!publishedProofAt) return [...readiness];

  return readiness.map((fact) =>
    fact.label === "Rendered-page verification"
      ? {
          ...fact,
          state: "proven",
          detail:
            facts.publishedProofNotes ??
            `Rendered-page proof was stored on ${publishedProofAt.slice(0, 10)}.`,
        }
      : fact,
  );
}
