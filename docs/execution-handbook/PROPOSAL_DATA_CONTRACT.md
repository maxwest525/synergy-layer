---
id: 20260814-proposal-data-contract
title: Proposal Data Contract
tags: [execution, architecture, governance]
created: 2026-08-14
updated: 2026-08-14
related:
  [
    20260814-source-of-truth,
    20260814-validation-gates,
    20260814-execution-rollback,
    20260814-outcome-measurement,
    20260814-tenancy-permissions,
  ]
summary: Record and lifecycle contract from immutable finding evidence through approved execution and measured outcome.
---

# Proposal Data Contract

> Approval locks one exact proposed action; it does not approve a finding, future rewrite, or mutable draft.

## Lifecycle

`observed finding -> evidence-sufficient draft -> proposed version -> approved snapshot -> executing -> source committed -> published proof -> measured outcome`

Failure, refusal, ignore, and supersession are explicit states. Clear/un-clear is Inbox triage and does not alter proposal state.

## Record separation

| Record                  | Purpose                                       | Mutable fields                                         |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Finding/recommendation  | Dated evidence and diagnosis                  | triage metadata only; evidence remains auditable       |
| Proposal/change request | Concrete action, evidence, and lifecycle      | wording/evidence while proposed; frozen after approval |
| Proposal version        | Immutable edit/regenerate history             | none after insert                                      |
| Approved content        | Frozen executable changes and source baseline | none after approval                                    |
| Execution attempt       | Adapter request, refusal/error, source proof  | append-only attempt state                              |
| Outcome                 | Baseline/follow-up measurements and gaps      | append new finalized windows; never rewrite evidence   |

## Title/H1 proposal payload

Required fields include the tenant and recommendation ID, `proposal_type: title_h1`, exact public URL, current and proposed title/H1 changes, rationale, evidence, generation context, source repository/branch/file/project/revision, and revision count.

Initial generation stores the proposed request without inventing a history row. Each Edit or Regenerate appends the prior state to `change_request_versions`, advances the revision count, and updates the still-proposed request. The approval transition freezes changes, evidence, rationale, generation context, and source baseline through database guards. Execution reads that frozen row; approved content cannot be edited or regenerated.

## Current implementation truth

- `IMPLEMENTED` and deployed: evidence sufficiency, deterministic generation/validation, Supabase persistence, immutable edit/regenerate history, approval locking, Action Center generation and detail UI, guarded execution, and rendered proof.
- Live database evidence includes proposed, applied, rolled-back, version-history, and measurement records. Provider availability remains a runtime credential/configuration concern, not a missing persistence contract.

## Related

- [Validation Gates](VALIDATION_GATES.md)
- [Execution and Rollback](EXECUTION_ROLLBACK.md)
- [Outcome Measurement](OUTCOME_MEASUREMENT.md)
