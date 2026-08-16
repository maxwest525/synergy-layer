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

| Record                  | Purpose                                      | Mutable fields                                       |
| ----------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Finding/recommendation  | Dated evidence and diagnosis                 | triage metadata only; evidence remains auditable     |
| Proposal/change request | Concrete action and lifecycle                | current draft pointer/state before approval          |
| Proposal version        | Immutable payload history                    | none after insert                                    |
| Approved snapshot       | Exact executable payload/checksum            | none after approval                                  |
| Execution attempt       | Adapter request, refusal/error, source proof | append-only attempt state                            |
| Outcome                 | Baseline/follow-up measurements and gaps     | append new finalized windows; never rewrite evidence |

## Title/H1 proposal payload

Required fields include tenant and source finding IDs, exact public URL, current and proposed title/H1, rationale, primary metric, confidence/limitations, evidence source dates and checksums, validation result, generator provider/model, version number, and payload checksum.

Approval atomically stores the selected version, payload, checksum, approver, approval time, and state transition. Execution reads only that approved snapshot. Editing or regeneration creates a new immutable version and invalidates any unapproved selection; it never mutates an approved payload.

## Current implementation truth

- `IMPLEMENTED`: pure evidence sufficiency, generator interface, deterministic validation, edit/regenerate/ignore/approve lifecycle tests, Action Center proposal view, approved-snapshot execution guard.
- `DESIGNED`: Supabase persistence adapter and complete UI binding.
- `BLOCKED`: schema/RPC activation until the local migration is reviewed/applied and generated database types are refreshed.

## Related

- [Validation Gates](VALIDATION_GATES.md)
- [Execution and Rollback](EXECUTION_ROLLBACK.md)
- [Outcome Measurement](OUTCOME_MEASUREMENT.md)
