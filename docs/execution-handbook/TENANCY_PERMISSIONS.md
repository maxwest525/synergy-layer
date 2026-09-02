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

Tenant tables, membership resolution, RLS, operator checks, and service-role server clients are `IMPLEMENTED` and deployed. Live inspection confirmed RLS on proposal-version and measurement tables. Privileged title/H1, measurement, and rendered-proof functions grant execution only to `service_role`; browser-facing server functions independently assert the operator and tenant before calling them. `create_title_h1_proposal` additionally accepts a null actor as the governed system path for the nightly propose-from-evidence job: the draft is logged as a system actor, lands in `proposed`, and still requires a named human approval; every non-null actor keeps the full membership and role checks.

## Hardened 2026-09-02, from the security review

Identity is not authority, and the review found four places that treated it
as such. The streaming model routes (`/api/agent-chat`, `/api/studio-chat`)
and the model re-ranking of next actions accepted any valid session; sign-up
on the auth project is open, so any self-registered account could run metered
model calls. `requireOperatorFromRequest` now reads the caller's roles back
through their own token and refuses a non-operator with 403, and
`prioritizeNextActions` asserts the operator role and validates its input
shape and size. The page audit, which renders up to a hundred pages through a
metered fallback, likewise requires the operator role, not membership alone.

Public hooks compare their shared secret in constant time
(`shared-secret.server.ts`), return no configuration detail in a failure body
(the reason goes to the server log), and the execution readiness read
discloses which credentials a host holds only to an authenticated caller.

Still open from the same review, tracked in `BACKLOG.md`: the DataForSEO
postback authenticates with the public publishable key (CODE-34), the active
tenant on a profile is trusted without a membership check (CODE-35), audit
rows with no tenant are readable by every authenticated account (CODE-36),
the OpenAI Ads bridge uses one global secret with a caller-chosen tenant
(CODE-37), sign-up is open and the registry read policies are `USING (true)`
(OP-11), membership-only RPCs and policies (CODE-40), provisioning creates no
membership (CODE-41), and the anon role's default table privileges (CODE-45).

## Related

- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Execution and Rollback](EXECUTION_ROLLBACK.md)
- [Canonical Test Cases](TEST_CASES.md)
