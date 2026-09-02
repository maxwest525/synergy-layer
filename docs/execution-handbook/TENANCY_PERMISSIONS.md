---
id: 20260814-tenancy-permissions
title: Tenancy and Permissions
tags: [security, governance, architecture]
created: 2026-08-14
updated: 2026-09-02
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

The database side followed the same day (migration `20260902020000`,
applied live). A session's actor is `auth.uid()`: the proposal, revision and
run-claim routines refuse an `_actor` that is not the signed-in account, and
the null-actor system path is reserved for the server. Membership alone
writes nothing: advancing a run, owning or seeding concerns, and recording
audit rows require the operator role, and the measurement routines and the
two proposal wrappers execute for `service_role` alone. Provisioning creates
the tenant membership (`authorized_operators.tenant_id` names the workspace
an entry joins), and `profiles.active_tenant_id` is refused unless the
account is a member of that workspace. The anon role holds no table or
sequence privilege in `public`, `authenticated` holds no TRUNCATE,
REFERENCES or TRIGGER, and the default privileges for new tables start
closed. Approval locks every lane: the immutability guard fires on the state
alone.

The service-role client has no current operator: it resolves a tenant
from an explicit id or the sole tenant, never from a profile or a
membership, and a scheduled run carries the tenant its schedule names to
every step. Rows with no tenant are shared rows: readable by every member,
written by admins alone (`20260902030000`). Audit rows the server files carry the
operator's active workspace; a row filed without one (an unprovisioned
sign-in) reads for admins and its own actor. The DataForSEO postback is
authenticated by a per-task token whose hash alone is stored.

Still open from the same review, tracked in `BACKLOG.md`: the OpenAI Ads
bridge uses one global secret with a caller-chosen tenant (CODE-37), and
sign-up is open on the auth project (OP-11; the registry read policies were
found already narrowed).

## Related

- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Execution and Rollback](EXECUTION_ROLLBACK.md)
- [Canonical Test Cases](TEST_CASES.md)
