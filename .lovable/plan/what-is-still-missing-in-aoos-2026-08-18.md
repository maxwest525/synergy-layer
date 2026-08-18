# What is still missing in AOOS

Checked against stored production rows, not the build notes. Counts below are real.

## 1. Three analytics sources are wired but have never stored a single reading

| Source | Stored rows | Reality |
| --- | --- | --- |
| Search Console | 112 | Working. This is the only proven evidence source. |
| GA4 (property 536830122) | 0 | Credential verified by hand, but no snapshot has ever been written. |
| PageSpeed | 0 | Two attempts, both quota refused. |
| Umami (analytics.marky.systems) | 0 | Token verified by hand, never stored a reading. |

So today the whole system reasons from one provider. Every "not measured" state on
Coverage and Essentials traces back to these three zeros.

Work:
- Add a single "Prove connection now" action per source that performs one real read
  and writes the first snapshot, surfacing the exact provider error inline on failure.
- Turn on the daily jobs only after the first stored row exists for that source.
- Show last run time, duration, row count, and last error on each status card.

## 2. The execution loop has never completed end to end

- 2 change requests exist, 1 applied, 0 waiting for a decision.
- 1 measurement cycle, 0 measurement observations tied to a completed before/after.
- The publish path is still blocked because GitHub is not authorized.

Work:
- Authorize GitHub (operator approval required) so `wf.publish` stops being a dead end.
- Close one full cycle on a real page: propose, approve, execute, verify, measure,
  and show the before/after on the Activity thread.

## 3. Nothing generates proposals on its own

11 recommendations exist and only 2 ever became change requests. There is no
scheduled job that reads stored evidence and files new proposals, so the approvals
queue empties and stays empty.

Work:
- A daily "propose from evidence" job that reads Search Console pages and queries,
  files proposals into the approvals queue with evidence references, and never
  mutates anything without approval.

## 4. Only 2 schedules are enabled

Everything else is a registry declaration with no cadence. Observation is largely
manual, which is why evidence goes stale between operator sessions.

Work:
- Enable the read-only observation cadences (GA4, Umami, PageSpeed, Search Console)
  and leave every mutating cadence disabled and capability gated.

## 5. Coverage has no owner or due date

54 concerns render status but no one is accountable for any of them and nothing ages.

Work:
- Owner plus target date per concern, and an overdue signal on Today.

## 6. Smaller gaps

- Competitor shortlist: 6 domains still pending human review.
- Ads Transparency: free account gate still needs revalidation before creative work.
- No notifications. If a run fails overnight nothing tells the operator until they open the app.

## Suggested order

1. Prove GA4, Umami, PageSpeed with one stored reading each.
2. Enable the observation cadences.
3. Automatic proposal generation into the approvals queue.
4. GitHub authorization, then one complete change cycle with measurement.
5. Coverage ownership and failure notifications.

## Technical notes

- New reads follow the existing pattern: server function behind `requireSupabaseAuth`,
  tenant scoped, immutable snapshot row, provenance retained, no fabricated values.
- Proposal generation writes `recommendations` plus `change_requests` in `proposed`
  state only; approval stays with `transition_change_request`.
- Schedules stay declared in `src/registry/modules/*.ts` and synced, with the runtime
  allowlist controlling what may actually run.
