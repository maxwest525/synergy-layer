---
id: 20260814-execution-rollback
title: Execution and Rollback
tags: [execution, governance, security]
created: 2026-08-14
updated: 2026-09-01
related: [20260814-proposal-data-contract, 20260814-validation-gates, 20260814-tenancy-permissions]
summary: Guarded source change, publication proof, refusal, verification, and reversal contract.
---

# Execution and Rollback

> A source commit is not publication, and publication is not verified outcome improvement.

## Preconditions

Execution requires an authenticated operator, tenant ownership, executable proposal state, frozen approved content, allowlisted repository/branch/file and public URL, configured adapter, and a passing source drift check.

## Execution sequence

1. Load the approved, frozen change request by ID.
2. Load the exact approved source revision and compare the exact approved before-values once.
3. Refuse on revision or before-value drift with `Page changed — review required`; perform zero GitHub writes.
4. Require exactly one intended replacement for each approved field.
5. Write with an idempotent commit marker and record source repository, branch, before/after commit, and adapter response.
6. Keep state as source-committed until the live site proves the approved after-state: for wording lanes (title/H1, meta description), the live public page must serve the exact approved values. The proof source order is a direct fetch of the page's own HTML first (the site serves prerendered pages as of 2026-09-01; free, no credential), then the JavaScript renderers (Crawl4AI, then Firecrawl) as fallback for routes the prerender does not cover. Any one source serving every approved value is proof; a stale copy can only under-prove a forward change, because the approved new wording cannot exist in a cache older than the commit. For the crawl-directives lane, the deployed static file must match the committed file at the recorded commit, whole-file, no renderer involved.
7. Store dated published proof separately.
8. Wait for finalized measurement windows; do not mark a winner at publish time.

## Failure behavior

Transport error, ambiguous replacement, stale source SHA, drift, permission failure, or mismatched rendered proof leaves the proposal unverified and records the attempt. Automatic retries must be bounded and idempotent.

## Rollback

Rollback is a new approved action using the stored before-state and current live/source evidence. It must pass the same drift, source, claim, permission, and proof gates. Never overwrite history or silently reset status.

## Current state

There is no mark-applied: since 2026-09-02 `transition_change_request` refuses the action by name, and `applied` is reached only through `apply_change_request_rendered_proof`. The guarded execution core, frozen-request read, exact replacement, source-revision drift refusal, source commit, and rendered proof are `IMPLEMENTED`; the live database contains source-committed and rendered-proof history. Current execution still depends on runtime GitHub credentials and operator authorization. GitHub synchronization and Lovable Publish remain separate actions; neither is implied by the other.

## Related

- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Validation Gates](VALIDATION_GATES.md)
- [Tenancy and Permissions](TENANCY_PERMISSIONS.md)
