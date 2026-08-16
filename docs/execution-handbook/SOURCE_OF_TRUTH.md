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

| Area                                                          | State                                               | Evidence                                                          |
| ------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| GSC collection and stored observations                        | `IMPLEMENTED`; deployment is `EXTERNAL`             | `src/lib/search-console*.ts` and migrations                       |
| DataForSEO evidence adapters and spend ledger                 | `IMPLEMENTED`; account data is `EXTERNAL`           | `src/lib/dataforseo/`                                             |
| Observation-only approval separation                          | `IMPLEMENTED` locally                               | `src/lib/findings.ts`, producer tests, migration repair           |
| Title/H1 sufficiency, drafting, validation, version lifecycle | `IMPLEMENTED` as local core                         | `src/lib/title-h1/`                                               |
| Title/H1 database schema/RPC activation                       | `BLOCKED` on migration apply and type regeneration  | `20260814232127_title_h1_proposal_workflow.sql`                   |
| Proposal UI and persistence adapter                           | `DESIGNED`                                          | Action Center view model exists; end-to-end adapter is incomplete |
| GitHub source execution                                       | `BLOCKED` without approved credential/configuration | `src/lib/execution/`                                              |
| Lovable or public deployment                                  | `EXTERNAL` and separately authorized                | No local commit proves publish                                    |
| GA4 outcome collection                                        | `BLOCKED` on credential and reporting adapter       | connection truth exists; reporting call is not enabled            |
| Knowledge chunking, retrieval, and refresh                    | `DESIGNED`                                          | tables exist; production ingestion pipeline does not              |

## Change rule

Update the relevant handbook contract in the same change that alters a governing schema, threshold, lifecycle, permission, or execution guard. Preserve previous evidence and version history.

## Related

- [Evidence Policy](EVIDENCE_POLICY.md)
- [Proposal Data Contract](PROPOSAL_DATA_CONTRACT.md)
- [Knowledge Ingestion](KNOWLEDGE_INGESTION.md)
