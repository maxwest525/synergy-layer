---
id: 20260814-knowledge-ingestion
title: Knowledge Ingestion
tags: [knowledge, governance, evidence]
created: 2026-08-14
updated: 2026-08-14
related: [20260814-source-of-truth, 20260814-evidence-policy, 20260814-test-cases]
summary: Versioning, chunking, provenance, retrieval, refresh, and activation contract for AOOS knowledge.
---

# Knowledge Ingestion

> A document being stored is not proof that it is chunked, retrievable, current, or allowed to govern production.

## Required ingestion receipt

Every source version must record source ID, title, owner, source type, canonical location, content checksum, acquired/verified dates, scope, evidence class, version, supersession links, chunking method/version, chunk IDs/checksums, retrieval index/version, activation state, next review, and limitations.

## Pipeline

1. Register immutable source version and provenance.
2. Verify content and scope; reject secrets and unsupported claims.
3. Atomize rules, algorithms, examples, and evidence instead of mixing them in one chunk.
4. Assign stable IDs and dependency links.
5. Chunk reproducibly; preserve source offsets and checksums.
6. Index only validated chunks.
7. Run retrieval tests for scope, contradictions, and superseded content.
8. Activate rules only after schema, evidence, owner, review, and test gates pass.
9. Re-ingest as a new version when source or governing meaning changes.

## Governance states

`Draft`, `Active`, `Contested`, `Suspended`, `Superseded`, and `Retired`. Draft knowledge can assist research but cannot govern an executable proposal.

## Current state

Supabase contains knowledge collections, entries, and agent-knowledge relationships, and the app can list/read them. Title/H1 generation uses bounded, tenant-scoped knowledge guidance in its server workflow. A complete versioned chunking, embedding/retrieval, refresh, conflict, and activation pipeline is not present. State: tables and bounded proposal retrieval `IMPLEMENTED`; governed ingestion `DESIGNED`.

The two playbooks used to compile this handbook remain source documents. This handbook does not claim they have been embedded or activated in the runtime knowledge system.

## Related

- [Source of Truth](SOURCE_OF_TRUTH.md)
- [Evidence Policy](EVIDENCE_POLICY.md)
- [Canonical Test Cases](TEST_CASES.md)
