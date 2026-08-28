---
id: 20260814-outcome-measurement
title: Outcome Measurement
tags: [measurement, evidence, seo]
created: 2026-08-14
updated: 2026-08-28
related: [20260814-evidence-policy, 20260814-proposal-data-contract, 20260814-test-cases]
summary: Baseline, comparison-window, GSC, GA4, and neutral result-classification contract.
---

# Outcome Measurement

> AOOS reports observed differences and measurement gaps; it does not translate correlation into causation.

## Dependency order

1. Access and indexability.
2. Query-cluster impressions and retrieval.
3. Click choice at comparable query, device, country, appearance, and position.
4. Page satisfaction and qualified progression.
5. Controlled or matched causal comparison.
6. Incremental business contribution against total cost and risk.

## Stored windows

Each baseline and follow-up requires source, page, date range, finalized/complete status, dimensions, metric values, collection time, and limitations. Partial windows remain visibly partial.

## Wording-change readout (title/H1 and meta description)

Both wording lanes are measured identically, because Google's own documentation
places titles and meta descriptions in the same category: they affect how the
result appears, not how it ranks, so the observable for both is the page's own
Search Console rows. The crawl-directives lane is deliberately not measured on
these windows: a robots.txt change's outcome is crawl and indexation state, not
click choice, and opening a CTR-shaped cycle for it would grade the wrong
observable.

- GSC: clicks, impressions, CTR, and average position with absolute and relative differences where defined.
- GA4 when connected: views, sessions, engagement rate, lead events, and whether lead-event mapping is configured.
- Display source and follow-up windows side by side.
- State missing baseline, reporting lag, disconnected GA4, absent page rows, missing lead mapping, and partial windows explicitly.

## Result language

Allowed: `waiting for finalized data`, `partial comparison`, `comparison available`, and a neutral list of differences. Forbidden without a credible causal design: `success`, `winner`, `caused`, `lift from this change`, or `ROI from this change`.

## Graded verdict layer

`src/lib/outcome-verdict.ts` is the one layer permitted the words success and failure, because it earns them: each stored reading is graded only on the research-grounded windows (14, 28, 56, 90 days), only against the stored 28-day approval baseline, only above the count-noise floor in `src/lib/confidence.ts`, and only after the site's own trend over the same weeks is ruled out as the cause. A reading that clears none of that is `neutral`, `not_yet`, `too_early`, or `unmeasurable`, never a verdict. The neutral calculator and `describeOutcome` keep the Result language rules above unchanged.

Where a verdict travels, as of 2026-08-28:

- Site health renders every graded reading. A failure leads the list; a success reads as a completed journey rather than one more pending card.
- The change detail page and its execution card show the change's own graded readings beside the Mark verified control, so verifying is an informed act. The verify gate itself is unchanged: finalized post-change Search Console rows, enforced in `transitionChangeRequest`. The verdict is displayed context and deliberately does not gate the transition, because the grading and the operator's judgment answer different questions and neither may impersonate the other.
- A failure verdict files one needs-attention Inbox item per change (`src/lib/outcome-alerts.server.ts`, on the daily Search Console observation), naming the change, the verdict's own reason, and the evidence window, and linking to the change page where the rollback control already lives. Once per change, ever: clearing the item means it was seen, not that the failure should be re-announced daily.

## Current state

The neutral calculator and server collection path are `IMPLEMENTED` in `src/lib/change-measurement.ts` and `src/lib/change-measurements.server.ts`. Their canonical database contracts are the applied `20260814103007_60f61bc3-b4ce-4ff4-a663-ccea36894966.sql` and `20260814104303_bbbbecf6-47d9-46b7-8907-cc40aa0df615.sql` migrations. The live database has one measurement cycle and seven provider observations. The GA4 adapter and registry are deployed, but zero GA4 snapshots exist, so live GA4 collection is not yet proven.

## Related

- [Evidence Policy](EVIDENCE_POLICY.md)
- [Canonical Test Cases](TEST_CASES.md)
