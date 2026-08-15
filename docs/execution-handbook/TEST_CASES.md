---
id: 20260814-test-cases
title: Canonical Test Cases
tags: [testing, execution, governance]
created: 2026-08-14
updated: 2026-08-14
related:
  [
    20260814-validation-gates,
    20260814-tenancy-permissions,
    20260814-outcome-measurement,
    20260814-knowledge-ingestion,
  ]
summary: Required acceptance cases for observation, proposal, approval, execution, measurement, and knowledge workflows.
---

# Canonical Test Cases

> A workflow is not complete until its failure paths and permission boundaries are proven.

## Observation and proposal

1. An observation-only finding persists as `observed`, never requires approval, and never enters Action Center.
2. A legacy observation leaking into pending approval is filtered and repaired without deleting evidence.
3. Missing/ambiguous rendered title or H1 blocks proposal generation.
4. Missing page-level GSC or relevant stored DataForSEO evidence returns `insufficient evidence`.
5. GA4 absence is disclosed but does not block title/H1 drafting.
6. Model output that violates schema, copies a competitor, invents a claim, duplicates another page, or is unchanged is rejected deterministically.
7. Edit and regenerate create new immutable versions; ignore records the decision.
8. Approval freezes changes, evidence, rationale, generation context, and the source baseline.

## Execution

9. A non-operator, wrong-tenant actor, missing frozen approval, or non-executable state is refused.
10. Source revision or exact-before-value drift produces `Page changed — review required` and zero provider writes.
11. Ambiguous source replacement and stale source SHA fail without a commit.
12. Replayed execution is idempotent.
13. Source commit remains distinct from public rendered proof.
14. Rollback is a new approved, audited action.

## Measurement and knowledge

15. Missing/partial GSC and GA4 windows remain explicit.
16. Outcome output contains differences but no automatic success or causal verdict.
17. Cross-tenant reads/writes and version updates fail under RLS.
18. Superseded or contested knowledge cannot govern a new execution.
19. Every INDEX link resolves and every related knowledge link is mirrored.

## Verification map

Current tests cover observation persistence, Search Console/SEO producers, title/H1 sufficiency/evidence/generation/validation/lifecycle, Action Center UI shape, database migration contracts, execution/drift, rendered proof, and outcome comparisons. Live inspection verifies deployed RLS/RPC shape and persisted workflow history. Provider calls and future publications still require runtime credentials and authorized operator actions.

## Related

- [Validation Gates](VALIDATION_GATES.md)
- [Tenancy and Permissions](TENANCY_PERMISSIONS.md)
- [Outcome Measurement](OUTCOME_MEASUREMENT.md)
