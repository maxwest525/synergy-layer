# OpenSEO Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every capability exposed by the live self-hosted OpenSEO MCP discoverable and operable from AOOS with tenant evidence, spend confirmation, and safe AOOS MCP access.

**Architecture:** A bounded server-only JSON-RPC client discovers the live OpenSEO MCP catalog and calls tools generically. AOOS classifies each live tool from its schema, annotations, and cost language, gates anything uncertain/metered/mutating behind a second operator confirmation, and stores immutable invocation evidence. A dedicated route renders the dynamic surface; AOOS MCP exposes discovery and confirmed-safe free reads only.

**Tech Stack:** TypeScript, TanStack Start/Router, React Query, Zod, Supabase/Postgres RLS, MCP JSON-RPC 2.0, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-openseo-runtime-design.md`

## Global Constraints

- The live `tools/list` response is authoritative; do not hard-code the current 39-tool list.
- Credentials stay in environment variables and never enter chat, git, logs, database rows, or error messages.
- Only a live `free_read` tool may run without a second operator confirmation.
- No background or scheduled paid OpenSEO work.
- Every result ledger row is tenant scoped and append-only.
- Do not modify AOOS Knowledge Center.

---

### Task 1: MCP transport and live catalog classification

**Files:**
- Create: `src/lib/openseo/types.ts`
- Create: `src/lib/openseo/catalog.ts`
- Create: `src/lib/openseo/catalog.test.ts`
- Create: `src/lib/openseo/mcp.server.ts`
- Create: `src/lib/openseo/mcp.server.test.ts`

**Interfaces:**
- Produces: `discoverOpenSeo(options?): Promise<OpenSeoDiscovery>`
- Produces: `callOpenSeoTool(name, args, options?): Promise<OpenSeoCallResult>`
- Produces: `classifyOpenSeoTool(tool): OpenSeoToolClassification`

- [ ] **Step 1: Write failing classification tests** using literal fixtures for free reads, credit-bearing reads, mutations, destructive tools, and uncertain metadata.
- [ ] **Step 2: Run `npm test -- src/lib/openseo/catalog.test.ts`** and verify failure because the production modules do not exist.
- [ ] **Step 3: Implement minimal types and classification** with uncertain tools defaulting to governed.
- [ ] **Step 4: Run the catalog test** and verify it passes.
- [ ] **Step 5: Write failing transport tests** for Basic auth, initialize/tools-list, JSON and SSE responses, MCP errors, timeout, malformed response, and the response-size bound.
- [ ] **Step 6: Run `npm test -- src/lib/openseo/mcp.server.test.ts`** and verify the expected failures.
- [ ] **Step 7: Implement the bounded JSON-RPC transport** without adding dependencies.
- [ ] **Step 8: Run both focused test files** and verify they pass.
- [ ] **Step 9: Commit** as `feat(openseo): add live MCP transport`.

### Task 2: Immutable tenant evidence ledger

**Files:**
- Create: `supabase/migrations/20260816120000_openseo_runtime.sql`
- Modify: `src/integrations/supabase/types.ts`
- Create: `src/lib/openseo/schema-migration.test.ts`

**Interfaces:**
- Produces: `public.openseo_tool_runs` with service-role insert, tenant-member read, and append-only protection.

- [ ] **Step 1: Write a failing schema test** asserting tenant FK, status/classification checks, JSON payloads, credit fields, RLS, grants, and update/delete rejection.
- [ ] **Step 2: Run the schema test** and verify it fails because the migration is absent.
- [ ] **Step 3: Add the migration and exact generated TypeScript table shape.**
- [ ] **Step 4: Run the schema test and `npx tsc --noEmit`** and verify both pass.
- [ ] **Step 5: Commit** as `feat(openseo): add invocation evidence ledger`.

### Task 3: Authenticated operator discovery and execution

**Files:**
- Create: `src/lib/openseo/runtime.server.ts`
- Create: `src/lib/openseo/runtime.server.test.ts`
- Create: `src/lib/openseo/functions.ts`
- Create: `src/lib/openseo/functions.test.ts`

**Interfaces:**
- Produces: `getOpenSeoWorkspace` GET server function.
- Produces: `invokeOpenSeoTool` POST server function accepting `{ toolName, arguments, confirmed }`.
- Consumes: Task 1 transport/classification and Task 2 ledger.

- [ ] **Step 1: Write failing runtime tests** for operator authorization, active tenant resolution, server-side rediscovery, free-read execution, governed-call refusal, confirmed execution, sanitized persistence, credit extraction, and MCP error persistence.
- [ ] **Step 2: Run the runtime test** and verify expected failures.
- [ ] **Step 3: Implement the operator runtime and append-only insert.** Never trust client classification.
- [ ] **Step 4: Run focused runtime tests** and verify they pass.
- [ ] **Step 5: Write failing server-function validation tests** for invalid names, non-object arguments, and missing confirmation.
- [ ] **Step 6: Implement Zod boundaries and authenticated server functions.**
- [ ] **Step 7: Run all `src/lib/openseo` tests** and verify they pass.
- [ ] **Step 8: Commit** as `feat(openseo): govern live tool execution`.

### Task 4: OpenSEO operator workspace

**Files:**
- Create: `src/routes/openseo.tsx`
- Create: `src/components/os/openseo-tool-runner.tsx`
- Create: `src/components/os/openseo-tool-runner.test.tsx`
- Modify: `src/components/os/shell.tsx`
- Modify: generated route tree through the existing Vite route generator only.

**Interfaces:**
- Consumes: `getOpenSeoWorkspace` and `invokeOpenSeoTool` from Task 3.
- Produces: `/openseo` operator workspace.

- [ ] **Step 1: Write failing component tests** proving all discovered tools render, project IDs prefill, free reads have one run action, governed calls require a distinct confirmation action, and errors/results remain visible.
- [ ] **Step 2: Run the component test** and verify expected failures.
- [ ] **Step 3: Implement the schema-driven runner** using existing AOOS primitives and restrained neutral/green styling.
- [ ] **Step 4: Add the route, connection/SAM status, history, and navigation item.**
- [ ] **Step 5: Run focused component tests and the production build** to regenerate/verify routes.
- [ ] **Step 6: Inspect `/openseo` at desktop and mobile widths** and correct clipping, focus, contrast, and pending states.
- [ ] **Step 7: Commit** as `feat(openseo): add operator workspace`.

### Task 5: AOOS MCP safe OpenSEO surface

**Files:**
- Create: `src/lib/mcp/tools/list-openseo-tools.ts`
- Create: `src/lib/mcp/tools/call-openseo-free-read.ts`
- Create: `src/lib/mcp/tools/openseo-tools.test.ts`
- Modify: `src/lib/mcp/index.ts`

**Interfaces:**
- Produces: AOOS MCP tools `list_openseo_tools` and `call_openseo_free_read`.
- Consumes: Task 1 discovery and Task 3 tenant evidence path.

- [ ] **Step 1: Write failing MCP tests** proving authenticated discovery, free-read execution, tenant evidence insertion, and refusal of metered/mutating/destructive/uncertain tools.
- [ ] **Step 2: Run the focused MCP test** and verify expected failures.
- [ ] **Step 3: Implement both guarded tools and register them.**
- [ ] **Step 4: Run focused and existing MCP tests** and verify they pass.
- [ ] **Step 5: Commit** as `feat(mcp): expose safe OpenSEO reads`.

### Task 6: Connector truth and live configuration

**Files:**
- Modify: `src/lib/connectors/probes.server.ts`
- Modify: `src/lib/connectors/probes.server.test.ts`
- Create: `src/lib/openseo/live-contract.test.ts`
- Modify: VPS `/root/stack/docker-compose.yml` only after inspection and backup.
- Modify: VPS `/root/stack/openseo.env` through a secure terminal input; never through chat or command output.

**Interfaces:**
- Produces: schema-validated OpenSEO health proof and SAM status.
- Requires Lovable secrets: `OPENSEO_BASE_URL`, `OPENSEO_USERNAME`, `OPENSEO_PASSWORD`.
- Requires VPS secret: `OPENROUTER_API_KEY`.

- [ ] **Step 1: Write failing probe tests** requiring the documented OpenSEO health object rather than accepting any HTTP 200.
- [ ] **Step 2: Run the focused connector test** and verify expected failure.
- [ ] **Step 3: Implement bounded OpenSEO health validation** with no body exposure.
- [ ] **Step 4: Run connector tests** and verify they pass.
- [ ] **Step 5: Securely configure OpenRouter and recreate only the OpenSEO container.** Verify `/api/health` reports AI configured without emitting the key.
- [ ] **Step 6: Configure the three AOOS OpenSEO secrets in Lovable.**
- [ ] **Step 7: Apply the Supabase migration through the Supabase migration tool and verify the table/RLS.**
- [ ] **Step 8: Run live non-metered `tools/list`, `whoami`, and `list_projects` through AOOS.** Do not call DataForSEO-backed tools.
- [ ] **Step 9: Update the canonical system record to callable only after the live proof.**
- [ ] **Step 10: Commit** as `fix(connectors): prove OpenSEO runtime health`.

### Task 7: Full verification and delivery

**Files:**
- Modify only files required by failures attributable to this implementation.

- [ ] **Step 1: Run `npm test`.** Expected: all suites pass.
- [ ] **Step 2: Run `npx tsc --noEmit`.** Expected: exit 0.
- [ ] **Step 3: Run `npm run lint`.** Expected: no errors.
- [ ] **Step 4: Run `npm run build`.** Expected: exit 0.
- [ ] **Step 5: Run `git diff --check` and inspect every changed file for secrets and unrelated edits.**
- [ ] **Step 6: Push the feature branch, open a PR, wait for GitHub checks, and merge without rewriting published history.**
- [ ] **Step 7: Verify `origin/main`, Lovable sync, deployed AOOS route, VPS health, and the three live free OpenSEO calls separately.**
- [ ] **Step 8: Report code, database, secrets, VPS, GitHub, Lovable sync, publish, GSC, GA4, and SAM as separate truth states.**
