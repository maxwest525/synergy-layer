---
id: 20260814-tenancy-permissions
title: Tenancy and Permissions
tags: [security, governance, architecture]
created: 2026-08-14
updated: 2026-08-14
related: [20260814-proposal-data-contract, 20260814-execution-rollback, 20260814-test-cases]
summary: Tenant isolation, RLS, roles, service boundary, and approval-rights contract.
---

# Tenancy and Permissions

> Authentication is not authorization, and tenant membership alone is not operator approval authority.

## Roles and rights

| Actor          | Read tenant data              | Triage               | Draft/version | Approve/ignore                             | Execute/publish                               |
| -------------- | ----------------------------- | -------------------- | ------------- | ------------------------------------------ | --------------------------------------------- |
| Tenant member  | tenant-scoped only            | where policy permits | no            | no                                         | no                                            |
| Operator/admin | tenant-scoped only            | yes                  | yes           | yes                                        | only through guarded server adapter           |
| Service role   | server-only policy operations | server path          | server path   | never substitutes for named human approval | provider adapter only after approved snapshot |

## RLS contract

- Every Data API table is RLS-enabled.
- Reads require membership in the row's tenant.
- Mutations require the existing operator/admin predicate, not merely `authenticated`.
- Proposal versions are append-only and tenant-bound.
- Approved changes, evidence, rationale, generation context, and source baseline are immutable.
- Cross-tenant IDs are rejected even when syntactically valid.
- Public hooks use narrow signatures, provider verification, idempotency, and explicit tenant resolution.

## Secret boundary

Secrets stay in runtime configuration or approved secret storage. They never enter evidence, knowledge documents, logs, proposal payloads, generated copy, or browser-visible responses. Mask identifiers in operator-facing diagnostics.

## Current state

Tenant tables, membership resolution, RLS, operator checks, and service-role server clients are `IMPLEMENTED` and deployed. Live inspection confirmed RLS on proposal-version and measurement tables. Privileged title/H1, measurement, and rendered-proof functions grant execution only to `service_role`; browser-facing server functions independently assert the operator and tenant before calling them.

## Related

- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Execution and Rollback](EXECUTION_ROLLBACK.md)
- [Canonical Test Cases](TEST_CASES.md)
