---
id: 20260814-execution-rollback
title: Execution and Rollback
tags: [execution, governance, security]
created: 2026-08-14
updated: 2026-08-14
related: [20260814-proposal-data-contract, 20260814-validation-gates, 20260814-tenancy-permissions]
summary: Guarded source change, publication proof, refusal, verification, and reversal contract.
---

# Execution and Rollback

> A source commit is not publication, and publication is not verified outcome improvement.

## Preconditions

Execution requires an authenticated operator, tenant ownership, executable proposal state, immutable approved payload/checksum, allowlisted repository/branch/file and public URL, configured adapter, and a passing live drift check.

## Execution sequence

1. Load the approved snapshot by ID.
2. Render the public page and compare current title/H1 and content checksum to the approved before-state.
3. Refuse on any drift with `Page changed — review required`; perform zero GitHub writes.
4. Load the exact source revision and require exactly one intended replacement.
5. Write with an idempotent commit marker and record source repository, branch, before/after commit, and adapter response.
6. Keep state as source-committed until the public rendered page proves the approved after-state.
7. Store dated published proof separately.
8. Wait for finalized measurement windows; do not mark a winner at publish time.

## Failure behavior

Transport error, ambiguous replacement, stale source SHA, drift, permission failure, or mismatched rendered proof leaves the proposal unverified and records the attempt. Automatic retries must be bounded and idempotent.

## Rollback

Rollback is a new approved action using the stored before-state and current live/source evidence. It must pass the same drift, source, claim, permission, and proof gates. Never overwrite history or silently reset status.

## Current state

The guarded execution core, approved-snapshot read, exact replacement, drift refusal, and rendered proof logic are `IMPLEMENTED` locally. Real execution is `BLOCKED` by GitHub executor configuration and operator authorization. Lovable synchronization and Publish are separate `EXTERNAL` actions; neither is implied by a commit.

## Related

- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Validation Gates](VALIDATION_GATES.md)
- [Tenancy and Permissions](TENANCY_PERMISSIONS.md)
