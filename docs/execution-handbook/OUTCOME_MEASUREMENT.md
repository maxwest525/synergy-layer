---
id: 20260814-outcome-measurement
title: Outcome Measurement
tags: [measurement, evidence, seo]
created: 2026-08-14
updated: 2026-08-14
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

## Title/H1 readout

- GSC: clicks, impressions, CTR, and average position with absolute and relative differences where defined.
- GA4 when connected: views, sessions, engagement rate, lead events, and whether lead-event mapping is configured.
- Display source and follow-up windows side by side.
- State missing baseline, reporting lag, disconnected GA4, absent page rows, missing lead mapping, and partial windows explicitly.

## Result language

Allowed: `waiting for finalized data`, `partial comparison`, `comparison available`, and a neutral list of differences. Forbidden without a credible causal design: `success`, `winner`, `caused`, `lift from this change`, or `ROI from this change`.

## Current state

The neutral outcome calculator is `IMPLEMENTED` locally in `src/lib/measurement/outcomes.ts`. GSC collection exists. GA4 connection truth exists, but the reporting adapter is not enabled; GA4 outcome collection is `BLOCKED`.

## Related

- [Evidence Policy](EVIDENCE_POLICY.md)
- [Canonical Test Cases](TEST_CASES.md)
