---
id: 20260814-detection-rules
title: Detection Rules
tags: [seo, evidence, governance]
created: 2026-08-14
updated: 2026-08-14
related: [20260814-component-registry, 20260814-diagnosis-remedy-matrix, 20260814-evidence-policy]
summary: Exact implemented observation thresholds and the boundary between a finding and a proposal.
---

# Detection Rules

> Detection creates a dated finding. It does not create permission to execute.

## Implemented Search Console thresholds

| Rule                    | Trigger                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| Striking-distance query | position 8–20 inclusive and at least 50 impressions                      |
| Weak CTR page           | at least 200 impressions and CTR at or below 1%                          |
| Position loss           | at least 100 current impressions and position worsened by at least 3     |
| Visibility gain         | prior impressions at least 100 and current impressions grew at least 35% |
| Possible query overlap  | at least 2 pages with 25 impressions each                                |

Comparison window: 7 days. Source: `SEARCH_CONSOLE_THRESHOLDS` in `src/lib/search-console-rules.server.ts`.

## Implemented SEO-validation thresholds

| Rule                             | Trigger                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| Declining clicks                 | prior clicks at least 10 and drop at least 30%                             |
| Declining impressions            | prior impressions at least 100 and drop at least 25%                       |
| Declining position               | at least 50 impressions and position worsened by at least 3                |
| High-impression low CTR          | at least 200 impressions and CTR at or below 1%                            |
| Zero-click page                  | at least 150 impressions and zero clicks                                   |
| Query overlap                    | at least 2 pages, 25 impressions per page, 2 periods, 50 total impressions |
| Significant period change        | prior impressions at least 100 and absolute change at least 50%            |
| Research traction                | at least 20 impressions and impression growth at least 25%                 |
| Competitor outranks owned        | at least 3 observed queries and confidence at least 0.5                    |
| Owned absent from approved SERPs | at least 5 absent SERPs and absence share at least 25%                     |

Source: `SEO_VALIDATION_THRESHOLDS` in `src/lib/seo-validation.server.ts`.

## Persistence invariant

All current rule-engine results are observation-only:

- state is `observed`;
- `requires_approval` is false;
- no pending-approval Inbox item is filed;
- Action Center filters legacy leaking observations;
- identical evidence is deduplicated using stored fingerprints.

State: `IMPLEMENTED` and deployed. Producers use `observationRecommendationRecord`; the `20260814070000_signal_integrity_recovery.sql` migration repaired legacy rows and is present in live migration history.

## Threshold changes

A threshold change must include rationale, evidence, affected rule IDs, test updates, effective date, and whether the changed decision requires a major knowledge-rule version.

## Related

- [Diagnosis and Remedy Matrix](DIAGNOSIS_REMEDY_MATRIX.md)
- [Evidence Policy](EVIDENCE_POLICY.md)
