---
id: 20260814-validation-gates
title: Validation Gates
tags: [execution, evidence, testing]
created: 2026-08-14
updated: 2026-08-29
related:
  [
    20260814-evidence-policy,
    20260814-proposal-data-contract,
    20260814-brand-claims,
    20260814-execution-rollback,
    20260814-site-page-keyword-map,
    20260814-test-cases,
    20260814-diagnosis-remedy-matrix,
  ]
summary: Fail-closed gates for evidence, claims, intent, duplication, drift, executability, and measurement.
---

# Validation Gates

> A score cannot compensate for a failed mandatory gate.

| Gate          | Pass condition                                                                                                                      | Failure result                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Target        | exact allowlisted public URL and eligible page-level finding                                                                        | no proposal                                   |
| Render        | reachable final URL, readable title, main text, checksum                                                                            | no proposal                                   |
| Evidence      | sufficient dated GSC and relevant stored DataForSEO evidence                                                                        | `insufficient evidence`                       |
| Intent        | proposed wording matches mapped page purpose and observed query job                                                                 | proposal rejected                             |
| Claims        | every factual promise exists on the page or approved claims registry                                                                | proposal rejected                             |
| Competitor    | no copied competitor wording, name, or unsupported comparison                                                                       | proposal rejected                             |
| Duplication   | title/H1 is not duplicated or materially colliding with governed pages                                                              | proposal rejected                             |
| Change        | proposed value materially differs from current value                                                                                | proposal rejected                             |
| Format        | schema, lengths, forbidden terms, and field types pass deterministic checks                                                         | proposal rejected                             |
| Approval      | guarded operator transition has frozen the proposed request                                                                         | execution refused                             |
| Concurrency   | no other change to the same page is approved-and-not-live or still inside a measurement window, or the operator has acknowledged it | approval refused, naming the change in flight |
| Drift         | source revision and exact before-values match the approved baseline                                                                 | `Page changed — review required`; zero writes |
| Adapter       | exact source target and renderer/write adapter are configured                                                                       | execution blocked                             |
| Publish proof | public rendered title/H1 equals approved after-state                                                                                | not applied                                   |
| Measurement   | baseline/follow-up windows and gaps are explicit                                                                                    | comparison can display; no causal verdict     |

## Concurrency gate, added 2026-09-02

Two changes to one page inside the same measurement window share that page's
Search Console rows, so neither outcome can be attributed on its own. On
2026-09-01 the queue held two approved title changes for one page and a second
change approved inside another page's 28-day window, and nothing had said so
(BACKLOG.md CODE-31). `transition_change_request` now refuses `approve` while a
sibling change to the same `target_url` is `approved` (not yet live) or
`applied` with a window whose `available_after_pt` is still in the future,
unless the call carries `_acknowledge_in_flight = true`. The acknowledgement is
written to the audit event as `acknowledgedInFlightChangeId`. The page shows the
sibling and the consequence before the click (`change-request-conflicts.ts`),
and the only control that sends the acknowledgement is labelled with what it
costs. A `proposed` sibling is not a concurrency question; it is the queue
vocabulary question tracked as CODE-32.

## Generator boundary

The model may draft structured candidates only. Deterministic code owns eligibility, schema enforcement, claim/competitor/duplicate checks, approval locking, execution drift refusal, and measurement labeling.

## Current state

**Corrected 2026-08-29.** Two claims here were stale.

The Render gate no longer requires exactly one H1. `verifyRenderedPage`
(`src/lib/execution/source-change.ts`) was rewritten so a change to any owned
field — `seo_title`, `page_heading`, `meta_description`, or a subheading — is
independently provable; a page carrying a subheading change alone is proof
enough. Demanding both a title and an H1 on every change is exactly what forced
every proposal into a title-and-H1 shape regardless of what the finding said,
and is recorded as the cause in the code's own comment.

"The live database currently has zero GA4 snapshots" is no longer true: 13
`ga4_snapshots` rows exist and `ga4-rule-checks.ts` fires four findings from
them (`page_traffic_loss`, `page_traffic_gain`, `zero_engagement_page`,
`event_disappeared` — see Detection Rules). GA4 readout is proven, not merely
deployed.

Page wording, model/development drafting, persistence, UI, approval locking,
exact-source execution, drift refusal, and rendered proof are `IMPLEMENTED` and
deployed. Provider calls still require configured credentials.

## Related

- [Evidence Policy](EVIDENCE_POLICY.md)
- [Brand and Claims](BRAND_AND_CLAIMS.md)
- [Execution and Rollback](EXECUTION_ROLLBACK.md)
