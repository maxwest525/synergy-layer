# Governed SEO Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and production-verify the complete governed SEO runtime, visible handbook and playbooks, Authority Science rules, literal-all connector control plane, and end-to-end SEO run workflow.

**Architecture:** Preserve the existing title/H1 execution path and place a connector preflight, governed hybrid knowledge layer, Authority Science findings, and visible SEO-run orchestration around it. Store only safe connector metadata in Supabase, keep secrets server-side, and make every runtime state provable rather than inferred.

**Tech Stack:** TanStack Start, React 19, TypeScript, Vitest, Supabase/Postgres with pgvector, Gemini Embeddings REST API, existing GitHub/Firecrawl/GSC/GA4/DataForSEO/SerpAPI adapters.

**Spec:** `docs/superpowers/specs/2026-08-14-governed-seo-runtime.md`

## Global Constraints

- Never insert demo, synthetic, or invented production data.
- Never label configured credentials as live-proven without a successful bounded probe.
- Preserve the exact approval and rollback state machine.
- Use `gemini-embedding-001` with exactly 768 dimensions for both documents and queries.
- Store no secret values in Supabase.
- A missing n8n or VPS endpoint remains blocked and is never silently treated as healthy.
- Provider/model calls require a bounded spend approval immediately before live execution.

---

### Task 1: Connector contract and runtime inventory

**Files:**

- Create: `src/lib/connectors/catalog.ts`
- Create: `src/lib/connectors/catalog.test.ts`
- Create: `src/lib/connectors/probes.server.ts`
- Create: `src/lib/connectors/probes.server.test.ts`
- Create: `src/lib/connectors/functions.ts`
- Modify: `src/lib/tool-estate.server.ts`
- Modify: `src/routes/capabilities.systems.index.tsx`

**Interfaces:**

- Produces: `CONNECTOR_CATALOG`, `describeConnectorReadiness(env)`, `probeConnector(key)`, and `syncConnectorReadiness(client, tenantId)`.
- Consumes: existing provider environment variables and `tenant_connections`.

- [ ] Write failing catalog tests asserting all 14 exact connector keys, required secret names, safe endpoint keys, and state derivation for missing/configured/healthy/degraded/failing.
- [ ] Run `npm test -- src/lib/connectors/catalog.test.ts` and verify missing-module failure.
- [ ] Implement typed descriptors and pure state derivation without reading secret values into returned objects.
- [ ] Add mocked probe tests for success, timeout, HTTP failure, malformed response, n8n endpoint absence, and VPS scraper endpoint absence.
- [ ] Implement bounded read-only probes using existing adapters where possible and 10-second aborts for external HTTP probes.
- [ ] Add a server function that upserts safe readiness/proof rows into `tenant_connections` and returns the current ledger.
- [ ] Render connector status and a manual `Check connections` action in Systems & Operations.
- [ ] Run connector tests, TypeScript, and lint; commit only connector files.

### Task 2: Governed knowledge schema and hybrid retrieval

**Files:**

- Create: `supabase/migrations/20260814150000_governed_knowledge_runtime.sql`
- Create: `src/lib/knowledge/schema-migration.test.ts`
- Create: `src/lib/knowledge/chunking.ts`
- Create: `src/lib/knowledge/chunking.test.ts`
- Create: `src/lib/knowledge/embeddings.server.ts`
- Create: `src/lib/knowledge/embeddings.server.test.ts`
- Create: `src/lib/knowledge/runtime.server.ts`
- Create: `src/lib/knowledge/runtime.server.test.ts`
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/lib/knowledge-retrieval.server.ts`

**Interfaces:**

- Produces: `chunkKnowledgeSource`, `embedDocuments`, `embedQuery`, `ingestKnowledgeVersion`, `activateKnowledgeVersion`, and `retrieveGovernedKnowledge`.
- Consumes: tenant ID, source content/checksum/version metadata, Gemini key, and the `match_knowledge_chunks` RPC.

- [ ] Write a migration contract test asserting `vector`, the three governed tables, tenant RLS, explicit grants, one-active-version enforcement, 768 dimensions, checksums, and the hybrid RPC.
- [ ] Run the migration test and verify failure before the migration exists.
- [ ] Implement the migration with indexes, triggers, policies, grants, and tenant-scoped RPC filtering active versions only.
- [ ] Write chunking tests covering Markdown headings, long paragraph packing, deterministic ordering/checksums, heading context, and no empty chunks.
- [ ] Implement deterministic chunking and token estimates.
- [ ] Write mocked Gemini REST tests asserting `gemini-embedding-001`, 768 dimensions, document/query task types, normalized vector length, and hard failure on malformed vectors.
- [ ] Implement bounded batched embedding calls without logging content or keys.
- [ ] Implement idempotent version ingestion by source checksum and atomic activation.
- [ ] Replace proposal lexical guidance with hybrid governed retrieval while retaining safe legacy fallback only when no active governed chunks exist.
- [ ] Generate Supabase types after migration and run focused tests, TypeScript, and lint.

### Task 3: Source ingestion and visible Operating Manual

**Files:**

- Create: `scripts/ingest-governed-knowledge.mjs`
- Create: `src/lib/knowledge/sources.ts`
- Create: `src/lib/knowledge/sources.test.ts`
- Modify: `src/lib/os-queries.server.ts`
- Modify: `src/lib/os.functions.ts`
- Modify: `src/routes/knowledge.index.tsx`
- Modify: `src/routes/knowledge.$id.tsx`
- Create: `src/routes/knowledge.manual.tsx`
- Modify: `src/components/os/shell.tsx`

**Interfaces:**

- Produces: an idempotent ingestion manifest for the two supplied playbooks and 16 handbook documents plus manual-source/version/chunk view models.
- Consumes: the Task 2 ingestion functions and exact approved source paths.

- [ ] Write source-manifest tests asserting the exact two playbook identities, all 16 handbook files, source type, checksum, version label, and Authority Science inclusion.
- [ ] Implement source loading with exact-path failure and duplicate/checksum detection.
- [ ] Implement the ingestion CLI with dry-run, live mode, exact request/chunk counts, and no production mutation before embedding completion.
- [ ] Add knowledge queries for sources, versions, activation, chunk counts, embedding coverage, and rendered chunk bodies.
- [ ] Add an Operating Manual route and navigation entry that renders handbook headings and content inside AOOS.
- [ ] Enhance Knowledge pages with active-version, checksum, chunk, embedding, and provenance status.
- [ ] Run tests, TypeScript, lint, and build.

### Task 4: Authority Science executable rules

**Files:**

- Create: `src/lib/authority/types.ts`
- Create: `src/lib/authority/rules.ts`
- Create: `src/lib/authority/rules.test.ts`
- Create: `src/lib/authority/evaluate.server.ts`
- Create: `src/lib/authority/evaluate.server.test.ts`
- Create: `supabase/migrations/20260814160000_authority_findings.sql`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**

- Produces: `AuthorityFinding`, `AuthorityAction`, `evaluateAuthorityRules(input)`, and `persistAuthorityFindings`.
- Consumes: dated rank/GSC/DataForSEO/page/entity/link/satisfaction observations and governed knowledge chunk IDs.

- [ ] Write table-driven failing tests for all ten rule families in the spec, including missing-evidence and non-causality behavior.
- [ ] Implement pure rules with explicit thresholds, confidence, provenance, and permitted-action allowlists.
- [ ] Write migration tests for tenant-scoped append-only finding/evidence/action tables and RLS.
- [ ] Implement the Authority schema and typed database bindings.
- [ ] Implement evidence assembly from existing AOOS observations and governed retrieval.
- [ ] Verify one-rank observations never become authority claims and recommendations cannot become change requests without exact executable fields.
- [ ] Run focused tests, TypeScript, lint, and commit.

### Task 5: Visible SEO run lifecycle

**Files:**

- Create: `supabase/migrations/20260814170000_seo_runs.sql`
- Create: `src/lib/seo-runs/types.ts`
- Create: `src/lib/seo-runs/orchestrator.server.ts`
- Create: `src/lib/seo-runs/orchestrator.server.test.ts`
- Create: `src/lib/seo-runs/functions.ts`
- Create: `src/routes/seo-runs.tsx`
- Create: `src/routes/seo-runs.index.tsx`
- Create: `src/routes/seo-runs.$id.tsx`
- Modify: `src/components/os/shell.tsx`
- Modify: `src/routes/changes.new.tsx`
- Modify: `src/routes/changes.$id.tsx`

**Interfaces:**

- Produces: `createSeoRun`, `runSeoPreflight`, `evaluateSeoRun`, and links to concrete existing change requests.
- Consumes: connector readiness, live evidence adapters, governed knowledge retrieval, Authority findings, and existing title/H1 proposal/execution functions.

- [ ] Write migration tests for immutable run events and state transitions.
- [ ] Write orchestrator tests for blocked connectors, evidence capture, knowledge retrieval, findings, proposal creation, approval separation, execution proof, measurement, rollback, and idempotency.
- [ ] Implement schema and orchestrator without duplicating the existing execution state machine.
- [ ] Add run list/detail pages showing every stage and proof source.
- [ ] Link title/H1 proposal creation and change detail back to the originating run.
- [ ] Verify a run can stop honestly at missing evidence and resume after connectors recover.
- [ ] Run tests, TypeScript, lint, and build.

### Task 6: Google Ads, n8n, and VPS scraper operational bridges

**Files:**

- Create: `src/lib/connectors/google-ads.server.ts`
- Create: `src/lib/connectors/google-ads.server.test.ts`
- Create: `src/lib/connectors/n8n.server.ts`
- Create: `src/lib/connectors/n8n.server.test.ts`
- Create: `src/lib/connectors/vps-scraper.server.ts`
- Create: `src/lib/connectors/vps-scraper.server.test.ts`
- Modify: `src/registry/modules/serpapi-ads.ts`
- Create: `src/registry/modules/automation-runtime.ts`

**Interfaces:**

- Produces: `probeGoogleAds`, `probeN8n`, `triggerN8nWorkflow`, `probeVpsScraper`, and `scrapeWithVps`.
- Consumes: server-only credentials/endpoints and returns redacted proof.

- [ ] Write mocked tests for Google Ads accessible-customer read, n8n health/workflow trigger, and VPS health/scrape with timeout, auth, schema, and redaction failures.
- [ ] Implement read-only Google Ads probe with customer/developer/OAuth metadata kept server-side.
- [ ] Implement n8n health and explicit workflow trigger; never trigger during a health check.
- [ ] Implement VPS scraper health and scrape operation with URL allowlist and response-size ceiling.
- [ ] Register the bridges as real only when implemented; use connection health for actual readiness.
- [ ] Run focused tests, TypeScript, lint, and commit.

### Task 7: Full verification, production migration, content activation, and delivery

**Files:**

- Modify: `docs/context/CURRENT_BUILD.md`
- Modify: `docs/execution-handbook/KNOWLEDGE_INGESTION.md`
- Create: `docs/verification/2026-08-14-governed-seo-runtime.md`

**Interfaces:**

- Produces: requirement-by-requirement proof with commands, row counts, vector coverage, connector health, run state, GitHub SHA, Lovable sync SHA, and production URL.
- Consumes: all prior tasks.

- [ ] Run every focused test, then `npm test`, `npm run lint`, TypeScript no-emit, and `npm run build`; preserve exact output.
- [ ] Obtain bounded approval before any metered provider/model calls; report maximum embedding and probe request counts.
- [ ] Apply migrations to the connected production Supabase project and regenerate types.
- [ ] Dry-run ingestion, compare exact source/checksum/chunk counts, then ingest and activate only approved real sources.
- [ ] Verify every active chunk has a 768-dimensional embedding and every source has exactly one active version.
- [ ] Run bounded connector probes and report each connector separately; leave unavailable n8n/VPS endpoints honestly blocked.
- [ ] Create or resume one real SEO run for an existing governed target and verify it reaches the furthest truthful lifecycle state without auto-approval.
- [ ] Re-run the complete test/build suite after production operations.
- [ ] Commit surgical files, push the feature branch, open and merge the PR only after checks pass.
- [ ] Verify GitHub `main`, Lovable source synchronization, and Lovable production publish as three separate states.
- [ ] Record the final proof ledger and close the goal only if every explicit requirement is evidenced.
