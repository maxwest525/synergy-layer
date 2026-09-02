/**
 * Several approved changes waiting on the same publish, rolled into one item.
 *
 * A change is committed to the website repository the moment it is executed,
 * and it becomes "applied" only when a live read of the public page proves the
 * approved wording. Between those two moments it waits on one thing, the
 * website being published, and on 2026-09-01 four changes sat there together
 * while the operator learned "waiting on publish" was the state of all four by
 * asking (BACKLOG.md CODE-31). The blocker is shared; the queue showed it four
 * times or not at all.
 *
 * This module only selects and words. It reads stored change rows, invents no
 * threshold, and names the one action that moves the group: publish the site,
 * then check each page. Two is the smallest group worth one item; a single
 * waiting change is already visible on its own page.
 */

export type WaitingChangeRow = {
  id: string;
  title: string;
  state: string;
  target_url: string;
  source_commit_sha: string | null;
  source_committed_at: string | null;
  published_proof_at: string | null;
};

export type PublishWaitRollup = {
  readonly count: number;
  readonly changeIds: readonly string[];
  /** ISO instant of the earliest commit in the group, or null when none is recorded. */
  readonly waitingSince: string | null;
  readonly title: string;
  readonly summary: string;
};

/** Committed, approved, and not yet proven live: the one shared blocker. */
export function isWaitingOnPublish(row: WaitingChangeRow): boolean {
  return (
    row.state === "approved" && row.source_commit_sha !== null && row.published_proof_at === null
  );
}

export const PUBLISH_WAIT_MINIMUM = 2;

export function publishWaitRollup(rows: readonly WaitingChangeRow[]): PublishWaitRollup | null {
  const waiting = rows.filter(isWaitingOnPublish);
  if (waiting.length < PUBLISH_WAIT_MINIMUM) return null;
  const sorted = [...waiting].sort((a, b) =>
    (a.source_committed_at ?? "").localeCompare(b.source_committed_at ?? ""),
  );
  const oldest = sorted.find((row) => row.source_committed_at)?.source_committed_at ?? null;
  const count = waiting.length;
  const since = oldest ? ` The oldest has waited since ${oldest.slice(0, 10)}.` : "";
  return {
    count,
    changeIds: sorted.map((row) => row.id),
    waitingSince: oldest,
    title: `${count} approved changes are committed and waiting for the site to be published`,
    summary:
      `Each of these is written to the website repository and not yet proven on the live page. ` +
      `They share one blocker: the website has to be published, and then each page checked. ` +
      `Nothing here runs on its own.${since}`,
  };
}
