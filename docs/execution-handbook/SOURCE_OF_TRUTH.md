---
id: 20260814-source-of-truth
title: Source of Truth
tags: [governance, architecture]
created: 2026-08-14
updated: 2026-08-21
related:
  [
    20260814-execution-handbook-index,
    20260814-execution-handbook-topic,
    20260814-evidence-policy,
    20260814-proposal-data-contract,
    20260814-knowledge-ingestion,
  ]
summary: Precedence rules for runtime state, implementation, evidence, policy, and historical context.
---

# Source of Truth

> No document, chat, tool score, or generated answer may overrule verified runtime facts.

## Precedence

1. Live rendered page, production database, and provider response for current external state.
2. Version-controlled code and applied migrations for implemented behavior.
3. Immutable, dated evidence snapshots for observations.
4. This handbook for approved decision and execution policy.
5. SEO/AEO and DataForSEO playbooks for scientific reasoning and candidate methods.
6. Design documents and plans for intended behavior.
7. Chats, summaries, and recovery notes as leads only.

When sources disagree, record the contradiction. Do not silently select the convenient source. Live production proves state; local code proves only what this branch contains; an unapplied migration is `DESIGNED`, not production truth.

## Required state labels

Every feature, adapter, rule, or document claim must be marked `IMPLEMENTED`, `DESIGNED`, `BLOCKED`, `EXTERNAL`, or `DEPRECATED` using the definitions in [INDEX](INDEX.md).

## Current state summary

| Area                                                   | State                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GSC collection and stored observations                 | `IMPLEMENTED`, deployed, and data-proven              | `src/lib/search-console*.ts`; live snapshots                                                                                                                                                                                                                                                                                                                 |
| DataForSEO evidence adapters and spend ledger          | `IMPLEMENTED`; provider state is `EXTERNAL`           | `src/lib/dataforseo/`                                                                                                                                                                                                                                                                                                                                        |
| Observation-only approval separation                   | `IMPLEMENTED` and deployed                            | `src/lib/observation-record.ts`; signal-integrity migration/tests                                                                                                                                                                                                                                                                                            |
| Title/H1 evidence, drafting, persistence, and versions | `IMPLEMENTED` and deployed                            | `src/lib/title-h1-proposals*`; `20260814080000` migration                                                                                                                                                                                                                                                                                                    |
| Proposal UI                                            | `IMPLEMENTED`                                         | `src/routes/changes.new.tsx`; `src/routes/changes.$id.tsx`                                                                                                                                                                                                                                                                                                   |
| GitHub execution and rendered proof                    | `IMPLEMENTED`, `EXTERNAL` for the token               | `src/lib/execution/`. Corrected 2026-09-01: `GITHUB_EXECUTOR_TOKEN` has been configured and working since 2026-08-11 (`change_request_executions` holds real commits on 08-14, 08-25, 08-28, 08-29; one change reached `applied`). The earlier "not configured" reading in this row was stale and is withdrawn; `CURRENT_BUILD.md` §0l carries the evidence. |
| GitHub/Lovable source synchronization                  | `EXTERNAL`, **divergent since 2026-08-30**            | Lovable's AOOS project syncs to `maxwest525/trumove-resource-center`, not to this repository. GitHub `main` (`bfdf59c`) and the mirror (`2cc5efb4`) share `a076088` as merge base; 26 commits exist only here. Evidence and the plan: `docs/context/DEPLOYMENT_TOPOLOGY.md`.                                                                                 |
| Lovable production publication                         | `EXTERNAL`, published from the mirror lineage         | Lovable metadata 2026-09-01; sync and Publish remain separate actions. A Vercel project (`synergy-layer.vercel.app`) also builds GitHub `main` but holds no secrets and is not production.                                                                                                                                                                   |
| GA4 outcome collection                                 | `IMPLEMENTED`; live-proven per record, `EXTERNAL` now | First successful snapshot recorded 2026-08-18 (124 rows, 48 pages) in `docs/context/CURRENT_BUILD.md`. The "zero live GA4 snapshots" note here predates it. Neither claim was re-verified against the production database on 2026-08-21.                                                                                                                     |
| Proposal knowledge retrieval                           | `IMPLEMENTED` for bounded tenant guidance             | deterministic retrieval in the proposal service                                                                                                                                                                                                                                                                                                              |
| General governed ingestion, chunking, and refresh      | `DESIGNED`                                            | storage exists; full activation pipeline does not                                                                                                                                                                                                                                                                                                            |

### Added 2026-08-21, at `2a2e87f`

Read from code and applied migrations in this worktree. Nothing in these rows was
verified against production.

| Area                                                                | State                                         | Evidence                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Rule bucketing and non-volume prerequisites                         | `IMPLEMENTED`                                 | `src/lib/rule-buckets.ts`, 24 rules bucketed with `alsoNeeds`; `rule-buckets.test.ts` forces an assignment per registered rule |
| Grounded outcome verdicts                                           | `IMPLEMENTED`                                 | `src/lib/outcome-verdict.ts`, `confidence.ts`, migration `20260820200000_grounded_measurement_windows`                         |
| Page audit checks                                                   | `IMPLEMENTED`                                 | `src/lib/page-checks.ts`, 30 checks; `audit-fixes.ts` exhaustive over `CheckId`                                                |
| Suggestion queue verbs and suppression                              | `IMPLEMENTED`                                 | `suggestion-queue.ts`, `suggestion-verbs.ts`, `suggestion-card.tsx`, migration `20260821090000_suggestion_suppressions`        |
| Targeting layer (keyword and backlink findings)                     | `IMPLEMENTED`                                 | `src/lib/targeting-rules.ts`, `src/lib/dataforseo/targeting-rules.server.ts`                                                   |
| Connection stage registry                                           | `IMPLEMENTED`                                 | `src/lib/connections.ts`; `connections.registry.test.ts` asserts it against the codebase                                       |
| Category pages: Getting found, Your pages, Site health, Connections | `IMPLEMENTED`                                 | `src/components/os/*-page.tsx`                                                                                                 |
| Category pages: Who visits your site, Your competition              | `DESIGNED`                                    | `src/lib/categories.ts` reserves the slugs; the nav absorbs `/ga4` and `/competitors`                                          |
| Model routing through LiteLLM                                       | `IMPLEMENTED` in app, `EXTERNAL` at the proxy | `docs/litellm-routing.md`; falls back to the previous paths when unconfigured                                                  |
| CI verification gate                                                | `IMPLEMENTED`                                 | `.github/workflows/ci.yml`: lint, typecheck, test, build on every pull request                                                 |

## Change rule

Update the relevant handbook contract in the same change that alters a governing schema, threshold, lifecycle, permission, or execution guard. Preserve previous evidence and version history.

## Related

- [Evidence Policy](EVIDENCE_POLICY.md)
- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Knowledge Ingestion](KNOWLEDGE_INGESTION.md)
