---
id: 20260814-execution-handbook-index
title: AOOS Execution Handbook
tags: [governance, execution, seo]
created: 2026-08-14
updated: 2026-08-28
related: [20260814-execution-handbook-topic, 20260814-source-of-truth]
summary: Index and operating boundary for AOOS SEO and AEO execution.
---

# AOOS Execution Handbook

> The executable contract between observations, proposals, approval, publishing, and measurement.

## Read first

1. [Source of Truth](SOURCE_OF_TRUTH.md)
2. [Competitive Model](COMPETITIVE_MODEL.md) — who we compete with, and what is out of scope
3. [Evidence Policy](EVIDENCE_POLICY.md)
4. [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
5. [Validation Gates](VALIDATION_GATES.md)
6. [Execution and Rollback](EXECUTION_ROLLBACK.md)
7. [Outcome Measurement](OUTCOME_MEASUREMENT.md)

## Reference contracts

- [Component Registry](COMPONENT_REGISTRY.md)
- [Detection Rules](DETECTION_RULES.md)
- [Diagnosis and Remedy Matrix](DIAGNOSIS_REMEDY_MATRIX.md)
- [Knowledge Ingestion](KNOWLEDGE_INGESTION.md)
- [Tenancy and Permissions](TENANCY_PERMISSIONS.md)
- [Canonical Test Cases](TEST_CASES.md)
- [Brand and Claims](BRAND_AND_CLAIMS.md)
- [Site, Page, and Keyword Map](SITE_PAGE_KEYWORD_MAP.md)

## Status vocabulary

| Label         | Meaning                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `IMPLEMENTED` | Present in local code or migrations and covered by local verification. It is not necessarily deployed. |
| `DESIGNED`    | Contract exists, but the runtime path is incomplete.                                                   |
| `BLOCKED`     | A named prerequisite is absent or requires operator authorization.                                     |
| `EXTERNAL`    | State exists outside this worktree and must be verified at the provider or deployed system.            |
| `DEPRECATED`  | Retained only for audit or transition.                                                                 |

These labels describe current implementation state. Recommendation certainty uses the separate labels in [Evidence Policy](EVIDENCE_POLICY.md).

## Current handbook boundary

This handbook contains 15 named contracts. It does not assert that all 15 are fully wired.

Updated 2026-08-21: the executable slice is no longer only title/H1 proposals. Page metadata proposals, the page audit's 30 checks, the bucketed finding rules and the targeting layer all now reach the suggestion queue, and four modules write recommendations. Execution against the real repository is `IMPLEMENTED` and proven: commits to the website repository have been recorded since 2026-08-11 (corrected 2026-09-02; an earlier sentence here said it was blocked on the token). Other components remain governed detection or design contracts until their adapters and tests exist. Current state is in [`docs/context/CURRENT_BUILD.md`](../context/CURRENT_BUILD.md).

## Topic map

See [_topic.md](_topic.md) for the complete relationship map.
