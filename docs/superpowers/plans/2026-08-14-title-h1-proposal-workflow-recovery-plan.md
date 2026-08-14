# Title and H1 Recovery — Implementation Plan

Date: 2026-08-14  
Branch: `codex/aoos-recovery-title-h1`

## Delivery strategy

Ship the smallest complete automation loop while preserving the future agent code for later. Work is split into two mergeable slices plus a release gate.

## Slice A — Signal integrity

1. Replace observation-only recommendation writes with `observed`, `requires_approval=false`, and no inbox creation.
2. Centralize the Action Center predicate: unresolved change requests or items explicitly tagged `category=failure`.
3. Preserve but archive legacy observation, FYI, scheduled, agent-approval, and workflow-approval inbox rows.
4. Make unfinished agent/workflow nodes fail honestly and create no approval noise.
5. Require an explicit scheduler key allowlist and keep only `gsc-daily-observe` enabled.
6. Add deterministic tenant-scoped knowledge retrieval over active approved collections.
7. Replace command-center counts with the same active-action predicate.

Test first: observation writes, Action Center classification, fake-agent refusal, workflow approval refusal, scheduler fail-closed behavior, deterministic knowledge rank/provenance, and migration preservation.

## Slice B — Title/H1 proposal workflow

1. Add `proposal_type=title_h1`, generation context, revision count, and append-only `change_request_versions`.
2. Add tenant-scoped RLS, immutability triggers, content locking after approval, and transactional service RPCs.
3. Assemble required evidence from rendered live page, exact-page GSC rows, and relevant active-tracked-competitor DataForSEO rows.
4. Validate the Britt repository/file baseline and exact replacements before generation can persist.
5. Call Gemini directly with strict structured output for title, H1, and rationale only.
6. Implement operator-only Generate, Edit, and Regenerate server functions.
7. Add a single New title/H1 proposal route, proposal history, evidence grouping, and Edit/Regenerate controls.
8. Reuse existing approval, exact drift refusal, GitHub commit, rendered publication proof, and measurement display.

Test first: each evidence class missing, irrelevant competitor exclusion, prompt exclusions, structured-output failure, zero initial versions, one version per edit/regenerate, one Gemini call only on generate/regenerate, approved immutability, type constraint, tenant isolation, and existing execution/proof tests.

## Release gate

1. Add an explicit `test` script and run lint, build, and Vitest.
2. Review branch diff against the recovery specification.
3. Open a pull request; do not merge while required tests fail.
4. Merge without rewriting history.
5. Confirm GitHub `main` and Lovable report the same commit.
6. Exercise Generate → Edit/Regenerate → Approve → drift-safe Execute → rendered proof in the connected environment.
7. Update the external AOOS Recovery Ledger with commit, test, deployment, and sync evidence.

## Refusal rules

No fallback to Lovable AI Gateway, generic proposal generation, background Gemini, GA4 gating, observation approvals, auto-success, silent source drift handling, or unscoped knowledge retrieval.
