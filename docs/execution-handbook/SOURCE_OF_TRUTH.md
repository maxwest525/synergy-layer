---
id: 20260814-source-of-truth
title: Source of Truth
tags: [governance, architecture]
created: 2026-08-14
updated: 2026-08-14
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

| Area                                                   | State                                         | Evidence                                                          |
| ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------- |
| GSC collection and stored observations                 | `IMPLEMENTED`, deployed, and data-proven      | `src/lib/search-console*.ts`; live snapshots                      |
| DataForSEO evidence adapters and spend ledger          | `IMPLEMENTED`; provider state is `EXTERNAL`   | `src/lib/dataforseo/`                                             |
| Observation-only approval separation                   | `IMPLEMENTED` and deployed                    | `src/lib/observation-record.ts`; signal-integrity migration/tests |
| Title/H1 evidence, drafting, persistence, and versions | `IMPLEMENTED` and deployed                    | `src/lib/title-h1-proposals*`; `20260814080000` migration         |
| Proposal UI                                            | `IMPLEMENTED`                                 | `src/routes/changes.new.tsx`; `src/routes/changes.$id.tsx`        |
| GitHub execution and rendered proof                    | `IMPLEMENTED`; historically live-proven       | `src/lib/execution/`; live change-request receipts                |
| GitHub/Lovable source synchronization                  | `EXTERNAL`, matched at audit commit `1fc0040` | GitHub remote and Lovable metadata                                |
| Lovable production publication                         | `EXTERNAL`, published at audit time           | Lovable metadata; sync and Publish remain separate actions        |
| GA4 outcome collection                                 | `IMPLEMENTED`, deployed, not live-proven      | adapter/registry exist; zero live GA4 snapshots                   |
| Proposal knowledge retrieval                           | `IMPLEMENTED` for bounded tenant guidance     | deterministic retrieval in the proposal service                   |
| General governed ingestion, chunking, and refresh      | `DESIGNED`                                    | storage exists; full activation pipeline does not                 |

## Change rule

Update the relevant handbook contract in the same change that alters a governing schema, threshold, lifecycle, permission, or execution guard. Preserve previous evidence and version history.

## Related

- [Evidence Policy](EVIDENCE_POLICY.md)
- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Knowledge Ingestion](KNOWLEDGE_INGESTION.md)
