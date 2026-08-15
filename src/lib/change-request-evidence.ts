/**
 * Pure parsing of stored Search Console page_query snapshots into post-change
 * rows for one exact page. The stored payload shape is an object with a `rows`
 * array, the same shape `search.functions.ts::readRows` reads. Anything else is
 * treated as no evidence rather than guessed at.
 */

export type PostChangeRow = {
  date: string;
  query: string;
  position: number;
  impressions: number;
  clicks: number;
};

export type SnapshotLike = {
  period_start_pt: string;
  payload: unknown;
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

export function parsePostChangeRows(
  snapshots: readonly SnapshotLike[],
  targetUrl: string,
): PostChangeRow[] {
  const out: PostChangeRow[] = [];
  for (const snapshot of snapshots) {
    const container = (snapshot?.payload ?? {}) as { rows?: unknown };
    if (!Array.isArray(container.rows)) continue;
    for (const entry of container.rows) {
      const row = (entry ?? {}) as Record<string, unknown>;
      const keys = Array.isArray(row["keys"]) ? row["keys"] : [];
      if (keys[0] !== targetUrl) continue;
      out.push({
        date: snapshot.period_start_pt,
        query: typeof keys[1] === "string" ? keys[1] : "(unknown query)",
        position: num(row["position"]),
        impressions: num(row["impressions"]),
        clicks: num(row["clicks"]),
      });
    }
  }
  return out;
}

/** A GSC-backed change may only be verified once at least one row exists. */
export function canVerifyWithEvidence(input: {
  appliedAt: string | null;
  postChangeRows: readonly unknown[];
}): boolean {
  return input.appliedAt !== null && input.postChangeRows.length > 0;
}

export type OutcomeEvidenceSummary =
  | { ready: false; rowCount: 0 }
  | {
      ready: true;
      rowCount: number;
      firstDate: string;
      latestDate: string;
      summary: string;
    };

/** Availability is actionable, but it is deliberately not a success verdict. */
export function summarizeOutcomeEvidence(rows: readonly PostChangeRow[]): OutcomeEvidenceSummary {
  if (rows.length === 0) return { ready: false, rowCount: 0 };
  const dates = rows.map((row) => row.date).sort();
  const firstDate = dates[0]!;
  const latestDate = dates.at(-1)!;
  return {
    ready: true,
    rowCount: rows.length,
    firstDate,
    latestDate,
    summary: `${rows.length} finalized post-change page/query ${rows.length === 1 ? "row is" : "rows are"} available from ${firstDate} through ${latestDate}. Review the evidence; availability alone does not prove the change succeeded.`,
  };
}
