# Close the remaining AOOS gaps

Checked against production rows just now. Two items in your list have moved since
it was written:

| Source | Stored readings | State |
| --- | --- | --- |
| Search Console | 112 | Proven |
| GA4 (536830122) | 1 | Proven, one 28 day reading stored |
| Umami | 4 | Proven, one 28 day window stored |
| PageSpeed | 0 | Still refused, quota only |

Everything else in your list holds: 2 change requests, 11 recommendations, 2 of 9
schedules enabled, 54 concerns with no owner, 13 failed measurement runs with no
notification.

## 1. PageSpeed, the last unproven source

- One "Prove connection now" action that runs a single mobile read of the primary
  page and stores the snapshot, showing the exact provider message inline if it
  refuses again.
- Space the attempts and surface the quota text plainly rather than a zero.
- Every source status card gains last run time, duration, rows returned, and last
  error, read from `measurement_runs`.

## 2. Turn the observation cadences on

- Enable the daily read-only cadences for Search Console, GA4 and Umami now that
  each has a stored reading; PageSpeed switches on the moment its first row lands.
- Every mutating cadence stays disabled and capability gated.

## 3. Propose from evidence, daily

- A scheduled read-only job reads stored Search Console pages and queries, and files
  new proposals with evidence references into the approvals queue.
- Writes `recommendations` plus `change_requests` in `proposed` state only. Approval
  still goes through `transition_change_request`. Nothing external is touched.
- Bounded per run, single-flight locked, idempotent per page so a re-run files nothing
  twice.

## 4. Finish one change cycle end to end

- Authorize GitHub so `wf.publish` stops being a dead end. This needs your approval
  and a token; I will ask for it at that step.
- Then drive one real page all the way: propose, approve, execute, verify the live
  page, open the measurement window, and show the before and after on the Activity
  thread.

## 5. Coverage ownership and failure notices

- Owner and target date per concern, with an overdue instruction on Today.
- A failed overnight run appears on Today as an instruction with a retry button
  instead of silently leaving stale evidence.

## 6. Smaller items, after the above

- Competitor shortlist: 6 domains still waiting on your review.
- Ads Transparency: revalidate the free account gate before any creative work.

## Technical notes

- New reads keep the existing shape: server function behind `requireSupabaseAuth`,
  tenant scoped, immutable snapshot row, provenance retained, no fabricated values.
- The proposal job is a server route under `src/routes/api/public/hooks/` called by
  pg_cron with the anon key, with a lease row, a per-run item cap, and a paused state
  it checks before doing any work.
- Schedules stay declared in `src/registry/modules/*.ts` and synced; the runtime
  allowlist decides what may actually run.
