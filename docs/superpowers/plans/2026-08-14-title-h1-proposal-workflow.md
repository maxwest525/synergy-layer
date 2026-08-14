# Title and H1 Proposal Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project must be executed inline; do not dispatch subagents.

**Goal:** Convert eligible page findings into one validated, exact, version-locked title/H1 change that can be approved, safely published, and measured without automatic success claims.

**Architecture:** Findings remain non-actionable `recommendations` rows. A focused proposal service collects a typed evidence bundle from the live page, stored GSC data, and stored DataForSEO competitor evidence; deterministic code gates eligibility, Gemini drafts structured wording through a replaceable interface, and deterministic validation creates an executable `change_requests` record. Existing change execution and GSC outcome tracking are extended with locked proposal snapshots and GA4 measurement gaps/data.

**Tech Stack:** TypeScript, TanStack Start/Router/Query, React, Vitest, Zod, Supabase/Postgres/RLS, Gemini Developer API structured output, existing GitHub/Firecrawl execution adapters.

**Spec:** `docs/superpowers/specs/2026-08-13-title-h1-proposal-workflow-design.md`

## Global Constraints

- Four practical states only: Finding → Proposal → Approved change → Measured outcome.
- `observationOnly` findings never require approval and never appear in Action Center.
- Gemini drafts title/H1 wording only; deterministic code owns eligibility, validation, versioning, approval, execution, and measurement.
- Never call the Lovable AI Gateway.
- Proposal evidence sources are only live webpage, GSC, and relevant stored DataForSEO competitor evidence.
- GA4 is measurement-only and cannot block proposal generation.
- Initial proposal creates no version row; Edit and Regenerate create versions.
- Approval locks the exact current payload and checksum atomically.
- Drift refuses execution and requests review.
- No automatic success/failure or causal label from new data or a point estimate.
- No other proposal type in this plan.
- No demo data.
- Every production change follows a witnessed red-green test cycle.

---

## File Structure

- `src/lib/findings.ts`: pure finding/actionability invariants and Needs-investigation view.
- `src/lib/findings.test.ts`: regression tests for observation-only behavior.
- `src/lib/search-console-rules.server.ts`: emit findings, never approvals.
- `src/lib/seo-validation.server.ts`: emit findings, never approvals.
- `src/lib/seo-validation.test.ts`: producer regression tests for observation-only persistence.
- `src/lib/os-queries.server.ts`: defense-in-depth Action Center exclusion.
- `src/lib/title-h1/types.ts`: proposal evidence and draft contracts.
- `src/lib/title-h1/sufficiency.ts`: pure eligibility/sufficiency rules.
- `src/lib/title-h1/sufficiency.test.ts`: missing-source and eligible-flow tests.
- `src/lib/title-h1/evidence.server.ts`: live/GSC/DataForSEO collection.
- `src/lib/title-h1/evidence.test.ts`: collector normalization and no-paid-call tests.
- `src/lib/title-h1/generator.server.ts`: provider-neutral generator and direct Gemini adapter.
- `src/lib/title-h1/generator.test.ts`: configuration, schema, and no-Lovable tests.
- `src/lib/title-h1/validation.ts`: unsupported-claim and before/after validation.
- `src/lib/title-h1/validation.test.ts`: deterministic validation tests.
- `src/lib/title-h1/proposals.server.ts`: generate/edit/regenerate/ignore/approve orchestration.
- `src/lib/title-h1/proposals.functions.ts`: authenticated server-function boundary.
- `src/lib/title-h1/proposals.test.ts`: versioning and locking tests.
- `src/lib/execution/execute.ts`: approved-snapshot and live drift enforcement.
- `src/lib/execution/execute.test.ts`: drift refusal tests.
- `src/lib/measurement/ga4.server.ts`: page engagement and lead-event reads.
- `src/lib/measurement/outcomes.ts`: neutral before/after outcome projection.
- `src/lib/measurement/outcomes.test.ts`: no-success-label tests.
- `src/routes/index.tsx`: Action Center proposal actions and exact payload.
- `src/routes/changes.$id.tsx`: proposal version, evidence, execution, and outcome detail.
- `src/integrations/supabase/types.ts`: generated database types.
- `supabase/migrations/<generated>_title_h1_proposal_workflow.sql`: schema constraints, immutable versions, cleanup, and RLS; create with the Supabase CLI rather than inventing the timestamp.

---

### Task 1: Stop Observation-Only Approval Leakage

**Files:**
- Create: `src/lib/findings.ts`
- Create: `src/lib/findings.test.ts`
- Create: `src/lib/seo-validation.test.ts`
- Modify: `src/lib/search-console-rules.server.ts`
- Modify: `src/lib/seo-validation.server.ts`
- Modify: `src/lib/os-queries.server.ts`

**Interfaces:**
- Produces: `findingPersistence(metadata): { state: "observed"; requiresApproval: false }`
- Produces: `isApprovalEligibleRecommendation(row): boolean`
- Consumes: existing `isObservationOnly(metadata)` behavior.

- [ ] **Step 1: Write failing pure invariant tests**

```ts
it("makes an observation-only finding non-approvable", () => {
  expect(findingPersistence({ observationOnly: true })).toEqual({
    state: "observed",
    requiresApproval: false,
  });
});

it("excludes an observation-only recommendation from approval", () => {
  expect(isApprovalEligibleRecommendation({
    state: "proposed",
    requires_approval: true,
    metadata: { observationOnly: true },
  })).toBe(false);
});
```

- [ ] **Step 2: Run the test and witness the missing-module failure**

Run: `npx vitest run src/lib/findings.test.ts`

Expected: FAIL because `./findings` does not exist.

- [ ] **Step 3: Implement the minimal invariants**

```ts
export function findingPersistence(metadata: unknown) {
  if (!isObservationOnly(metadata)) throw new Error("Only observation-only findings use this persistence path.");
  return { state: "observed" as const, requiresApproval: false as const };
}

export function isApprovalEligibleRecommendation(row: RecommendationApprovalShape): boolean {
  return !isObservationOnly(row.metadata) && row.requires_approval && row.state === "proposed";
}
```

- [ ] **Step 4: Run the test and witness it pass**

Run: `npx vitest run src/lib/findings.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing server tests proving both producers never file inbox items**

Add focused fake-client assertions to the existing SEO/GSC rule tests:

```ts
expect(insertedRecommendation).toMatchObject({ state: "observed", requires_approval: false });
expect(writes.filter((write) => write.table === "inbox_items")).toHaveLength(0);
```

- [ ] **Step 6: Run the focused tests and witness the current bug**

Run: `npx vitest run src/lib/search-console-observe.test.ts src/lib/seo-validation.test.ts`

Expected: FAIL because current producers store `proposed`, require approval, and file inbox items.

- [ ] **Step 7: Apply the invariant to both producers and filter legacy rows in `fetchInbox`**

Use `findingPersistence({ ...evidence, observationOnly: true })`, remove `fileInboxItem` calls for findings, and query recommendation metadata for recommendation-subject inbox rows before returning Action Center results.

- [ ] **Step 8: Run focused and existing Action Center tests**

Run: `npx vitest run src/lib/findings.test.ts src/lib/search-console-observe.test.ts src/lib/seo-validation.test.ts src/lib/action-center.test.ts src/lib/approval-inbox.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the regression fix**

```powershell
git add src/lib/findings.ts src/lib/findings.test.ts src/lib/search-console-rules.server.ts src/lib/seo-validation.server.ts src/lib/os-queries.server.ts
git commit -m "fix(action-center): keep findings out of approvals"
```

---

### Task 2: Add Narrow Proposal Persistence and Repair Existing Rows

**Files:**
- Create via CLI: `supabase/migrations/<generated>_title_h1_proposal_workflow.sql`
- Modify after generation: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: immutable `title_h1_proposal_versions` rows created only by edit/regenerate.
- Produces: approved snapshot columns on `change_requests`.
- Produces: database checks preventing observation-only approval.

- [ ] **Step 1: Create the migration with the installed CLI**

Run `supabase --help`, `supabase migration --help`, then:

```powershell
supabase migration new title_h1_proposal_workflow
```

- [ ] **Step 2: Write the migration contract before applying it**

The generated migration must:

```sql
alter table public.change_requests
  add column if not exists proposal_kind text,
  add column if not exists proposal_payload jsonb,
  add column if not exists proposal_checksum text,
  add column if not exists approved_payload jsonb,
  add column if not exists approved_checksum text,
  add column if not exists approved_version_number integer,
  add column if not exists finding_id uuid references public.recommendations(id) on delete set null;

create table public.title_h1_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  creation_reason text not null check (creation_reason in ('edit','regenerate')),
  payload jsonb not null,
  payload_checksum text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, change_request_id, version_number)
);
```

Add proposal-kind/payload checks, paired approved snapshot checks, indexes, `GRANT`, RLS, tenant-member SELECT, and operator-only INSERT. Do not grant UPDATE or DELETE on immutable versions.

Repair legacy data without deleting evidence:

```sql
update public.recommendations
set state = 'observed', requires_approval = false
where metadata @> '{"observationOnly": true}'::jsonb;

update public.inbox_items i
set lane = 'fyi', resolved_at = coalesce(i.resolved_at, now())
from public.recommendations r
where i.subject_kind = 'recommendation'
  and i.subject_id = r.id
  and r.metadata @> '{"observationOnly": true}'::jsonb
  and i.resolved_at is null;
```

- [ ] **Step 3: Add a database constraint/trigger test query**

Verify an observation-only recommendation cannot be inserted with `requires_approval = true`; verify tenant members cannot insert versions unless they satisfy the existing operator predicate; verify versions cannot be updated.

- [ ] **Step 4: Apply locally/live only through the established Supabase workflow and regenerate types**

Run the repository's existing Supabase type-generation command discovered from docs/config; do not hand-edit generated types.

- [ ] **Step 5: Verify the repair counts**

Expected SQL assertions:

```sql
select count(*) from public.recommendations
where metadata @> '{"observationOnly": true}'::jsonb and requires_approval;
-- 0

select count(*) from public.inbox_items i
join public.recommendations r on r.id = i.subject_id
where i.subject_kind = 'recommendation'
  and r.metadata @> '{"observationOnly": true}'::jsonb
  and i.lane = 'pending_approval' and i.resolved_at is null;
-- 0
```

- [ ] **Step 6: Commit schema and generated types**

```powershell
git add supabase/migrations src/integrations/supabase/types.ts
git commit -m "feat(proposals): add locked title and H1 persistence"
```

---

### Task 3: Build the Evidence Sufficiency Gate

**Files:**
- Create: `src/lib/title-h1/types.ts`
- Create: `src/lib/title-h1/sufficiency.ts`
- Create: `src/lib/title-h1/sufficiency.test.ts`
- Create: `src/lib/title-h1/evidence.server.ts`
- Create: `src/lib/title-h1/evidence.test.ts`

**Interfaces:**
- Produces: `TitleH1EvidenceBundle`.
- Produces: `assessTitleH1Evidence(bundle): { eligible: true } | { eligible: false; reasons: InvestigationReason[] }`.
- Consumes: existing rendered-page, GSC snapshot, and stored DataForSEO competitor evidence adapters.

- [ ] **Step 1: Write failing sufficiency tests**

Cover missing/ambiguous live title/H1, no page-level GSC evidence, no relevant DataForSEO competitor evidence, ineligible rule, and a complete eligible bundle. Assert GA4 absence does not affect eligibility.

```ts
expect(assessTitleH1Evidence(completeBundle({ ga4: null }))).toEqual({ eligible: true });
expect(assessTitleH1Evidence(completeBundle({ competitors: [] }))).toMatchObject({
  eligible: false,
  reasons: [{ code: "missing_competitor_evidence" }],
});
```

- [ ] **Step 2: Run and witness failure**

Run: `npx vitest run src/lib/title-h1/sufficiency.test.ts`

- [ ] **Step 3: Implement minimal types and pure gate**

Use discriminated unions for eligibility. Keep thresholds imported from existing typed SEO rule modules; do not duplicate magic numbers.

- [ ] **Step 4: Run and witness pass**

Run: `npx vitest run src/lib/title-h1/sufficiency.test.ts`

- [ ] **Step 5: Add failing collector tests around source normalization**

Assert the collector returns final URL, title, one H1, main text, checksum, GSC rows/dates, and relevant stored competitor evidence. Assert no DataForSEO transport function is called.

- [ ] **Step 6: Implement the collector with existing adapters**

The collector performs read-only calls and stores source timestamps/checksums. It returns explicit source failures rather than partial fake values.

- [ ] **Step 7: Run focused tests and commit**

```powershell
npx vitest run src/lib/title-h1/sufficiency.test.ts src/lib/title-h1/evidence.test.ts
git add src/lib/title-h1
git commit -m "feat(proposals): gate title and H1 evidence"
```

---

### Task 4: Add Direct Gemini Drafting and Deterministic Validation

**Files:**
- Create: `src/lib/title-h1/generator.server.ts`
- Create: `src/lib/title-h1/generator.test.ts`
- Create: `src/lib/title-h1/validation.ts`
- Create: `src/lib/title-h1/validation.test.ts`

**Interfaces:**
- Produces: `TitleH1Generator.generate(input): Promise<TitleH1Draft>`.
- Produces: `createConfiguredTitleH1Generator(env, transport)`.
- Produces: `validateTitleH1Draft(bundle, draft): ValidationResult`.
- Consumes: `TitleH1EvidenceBundle` from Task 3.

- [ ] **Step 1: Write failing provider-interface tests**

Assert missing provider/key/model returns a precise blocker; `PROPOSAL_GENERATOR_PROVIDER=gemini` chooses Gemini; any other value refuses; request uses `GEMINI_API_KEY` server-side and `GEMINI_PROPOSAL_MODEL`; structured JSON schema contains only the approved draft fields; no Lovable package/import/call exists.

- [ ] **Step 2: Run and witness failure**

Run: `npx vitest run src/lib/title-h1/generator.test.ts`

- [ ] **Step 3: Implement the interface and direct Gemini REST adapter**

Use the configured model and Google's structured-output `responseJsonSchema`. Parse the response again with Zod. Return usage metadata separately from the draft. Do not expose the key in errors.

- [ ] **Step 4: Run and witness pass**

Run: `npx vitest run src/lib/title-h1/generator.test.ts`

- [ ] **Step 5: Write failing deterministic-validation tests**

Cover unchanged values, missing title/H1, unsupported superlative/guarantee/location/service claims, claims absent from evidence text, invalid metric, live-before mismatch, valid proposal, and confidence derived from source coverage rather than model output.

- [ ] **Step 6: Implement minimal validator**

Return all validation errors with stable codes. Never call Gemini from validation. Normalize whitespace/case for comparison without changing approved display values.

- [ ] **Step 7: Run focused tests and commit**

```powershell
npx vitest run src/lib/title-h1/generator.test.ts src/lib/title-h1/validation.test.ts
git add src/lib/title-h1
git commit -m "feat(proposals): draft title and H1 with Gemini"
```

---

### Task 5: Create, Edit, Regenerate, Ignore, and Lock Proposals

**Files:**
- Create: `src/lib/title-h1/proposals.server.ts`
- Create: `src/lib/title-h1/proposals.functions.ts`
- Create: `src/lib/title-h1/proposals.test.ts`
- Modify: `src/lib/change-requests.server.ts`
- Modify: `src/lib/change-requests.functions.ts`

**Interfaces:**
- Produces: `generateTitleH1Proposal(findingId)`.
- Produces: `editTitleH1Proposal(changeRequestId, values)`.
- Produces: `regenerateTitleH1Proposal(changeRequestId)`.
- Produces: `ignoreTitleH1Proposal(changeRequestId)`.
- Produces: `approveTitleH1Proposal(changeRequestId, expectedChecksum)`.

- [ ] **Step 1: Write failing orchestration tests**

Assert insufficient evidence marks the finding `Needs investigation`, never calls Gemini, and files no inbox item. Assert valid generation creates the base proposal with no version row and one Action Center item. Assert edit/regenerate archive the previous payload and create versions 1, 2. Assert failed validation leaves current payload untouched. Assert Ignore closes the proposal but preserves the finding.

- [ ] **Step 2: Run and witness failure**

Run: `npx vitest run src/lib/title-h1/proposals.test.ts`

- [ ] **Step 3: Implement minimal orchestration**

Use injected collector/generator/store interfaces in core logic and thin Supabase adapters. Persist the base proposal only after validation. Store Needs-investigation reasons on the finding metadata without changing it into an approval.

- [ ] **Step 4: Run and witness pass**

Run: `npx vitest run src/lib/title-h1/proposals.test.ts`

- [ ] **Step 5: Write failing atomic-approval tests**

Assert approval fails when expected checksum is stale, locks current payload/checksum exactly, records actor/time, cannot be repeated with a different version, and changes the linked Action Center lane without leaving a pending duplicate.

- [ ] **Step 6: Implement the guarded atomic approval mutation**

Use the established RPC/transaction pattern in `change-requests.server.ts`. The mutation condition includes tenant, state `proposed`, and current checksum. It copies current payload/checksum into immutable approved columns.

- [ ] **Step 7: Run tests and commit**

```powershell
npx vitest run src/lib/title-h1/proposals.test.ts src/lib/change-request-state.test.ts
git add src/lib/title-h1 src/lib/change-requests.server.ts src/lib/change-requests.functions.ts
git commit -m "feat(proposals): version and lock title and H1 changes"
```

---

### Task 6: Build the Exact Action Center Experience

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/changes.$id.tsx`
- Modify: `src/lib/action-center.ts`
- Modify: `src/lib/action-center.test.ts`

**Interfaces:**
- Consumes the proposal payload/version and server functions from Task 5.
- Produces operator controls: Approve, Edit, Regenerate, Ignore.

- [ ] **Step 1: Write failing view-model tests**

Assert proposal cards expose URL, current/proposed title/H1, reason, expected metric, confidence, verification, reversal, source dates, limitations, and only the four requested actions. Assert finding rows never render as pending approval.

- [ ] **Step 2: Run and witness failure**

Run: `npx vitest run src/lib/action-center.test.ts`

- [ ] **Step 3: Implement proposal card/detail UI**

Edit opens controlled title/H1 inputs and creates a version only after validation. Regenerate shows provider/model cost context and creates a version only on success. Approve submits the visible checksum. Ignore records a decision. Disable actions while a mutation is running and refresh only relevant query keys.

- [ ] **Step 4: Run tests, typecheck, and commit**

```powershell
npx vitest run src/lib/action-center.test.ts src/lib/title-h1/proposals.test.ts
npx tsc --noEmit
git add src/routes/index.tsx 'src/routes/changes.$id.tsx' src/lib/action-center.ts src/lib/action-center.test.ts
git commit -m "feat(action-center): review exact title and H1 proposals"
```

---

### Task 7: Enforce Approved Snapshot Drift Safety and Publication Proof

**Files:**
- Modify: `src/lib/execution/execute.ts`
- Modify: `src/lib/execution/execute.server.ts`
- Modify: `src/lib/execution/execute.test.ts`
- Modify: `src/lib/execution/preflight.ts`
- Modify: `src/lib/execution/preflight.test.ts`

**Interfaces:**
- Consumes immutable approved payload/checksum.
- Produces `review_required` refusal detail for live/source drift.
- Produces publication proof inside the execution record.

- [ ] **Step 1: Write failing execution tests**

Assert execution uses approved—not current—payload; refuses when live title/H1 differs; refuses on source revision/content mismatch; makes zero GitHub writes on refusal; and records `Page changed — review required`. Assert matching values execute and publication proof stores final URL, title, H1, commit, renderer, and timestamp.

- [ ] **Step 2: Run and witness current failures**

Run: `npx vitest run src/lib/execution/execute.test.ts src/lib/execution/preflight.test.ts`

- [ ] **Step 3: Implement minimal approved-snapshot loading and live drift check**

Load only `approved_payload`. Re-render immediately before source write. Compare normalized live title/H1 and evidence checksum inputs. Refuse without adapting values.

- [ ] **Step 4: Run focused tests and commit**

```powershell
npx vitest run src/lib/execution/execute.test.ts src/lib/execution/preflight.test.ts
git add src/lib/execution
git commit -m "fix(execution): refuse drift from approved title and H1"
```

---

### Task 8: Add Neutral GSC and GA4 Measured Outcomes

**Files:**
- Create: `src/lib/measurement/ga4.server.ts`
- Create: `src/lib/measurement/outcomes.ts`
- Create: `src/lib/measurement/outcomes.test.ts`
- Modify: `src/lib/change-requests.server.ts`
- Modify: `src/routes/changes.$id.tsx`

**Interfaces:**
- Produces: `MeasuredOutcomeView` containing source windows, values, differences, completeness, and gaps—never success.
- Consumes: stored GSC post-change rows and configured GA4 Data API credentials/events.

- [ ] **Step 1: Write failing neutral-outcome tests**

```ts
const view = buildMeasuredOutcome({
  gsc: positiveGscDifference,
  ga4: positiveGa4Difference,
});
expect(view).not.toHaveProperty("success");
expect(JSON.stringify(view)).not.toMatch(/successful|winner|caused/i);
```

Also cover GSC lag, GA4 disconnected, missing lead mapping, partial data, and negative/positive differences.

- [ ] **Step 2: Run and witness failure**

Run: `npx vitest run src/lib/measurement/outcomes.test.ts`

- [ ] **Step 3: Implement neutral projection and GA4 reader**

Read page path, sessions/views, engagement, and configured lead events. Keep credential values server-only. Return explicit gaps. Calculate absolute/relative differences only with valid denominators and label average position direction without judging causality.

- [ ] **Step 4: Extend change detail with the measured-outcome view**

Show GSC ranking, impressions, clicks, CTR, GA4 engagement, lead events, source dates, window completeness, and gaps. Replace any “success” language with “measured outcome” or “evidence available.”

- [ ] **Step 5: Run focused tests, typecheck, and commit**

```powershell
npx vitest run src/lib/measurement/outcomes.test.ts src/lib/change-request-state.test.ts src/lib/change-request-evidence.test.ts
npx tsc --noEmit
git add src/lib/measurement src/lib/change-requests.server.ts 'src/routes/changes.$id.tsx'
git commit -m "feat(measurement): track neutral title and H1 outcomes"
```

---

### Task 9: Full Verification, Live Canary, and Publication

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Verifies all earlier deliverables; creates no new feature scope.

- [ ] **Step 1: Run the complete automated suite**

```powershell
npx vitest run
npx tsc --noEmit
npm run build
```

Run targeted lint on changed source files. Record any pre-existing repository-wide formatting failure separately.

- [ ] **Step 2: Verify database invariants and RLS**

Confirm zero unresolved observation-only approvals, immutable versions, tenant isolation, operator-only mutation, approved snapshot pairing, and atomic state changes. Run Supabase advisors when supported.

- [ ] **Step 3: Run authenticated browser regression**

Verify findings do not appear in Action Center and cannot be approved. Open the same finding in its evidence surface and confirm `Needs investigation` reasons are visible.

- [ ] **Step 4: Run one real title/H1 proposal canary**

Use a real current finding and real provider evidence. Confirm live/GSC/DataForSEO collection, direct Gemini provider/model record, deterministic validation, exact Action Center card, Edit/Regenerate version behavior, Ignore behavior on a disposable proposal if available, and locked approval checksum.

- [ ] **Step 5: Prove drift refusal before the real write**

Use an isolated test fixture or controlled stale checksum—not a destructive live-page mutation—to demonstrate zero-write refusal and `Page changed — review required`.

- [ ] **Step 6: Execute only the explicitly approved real proposal**

Recheck approval scope immediately before the write. Record source commit and rendered title/H1 proof. Do not execute an unapproved canary.

- [ ] **Step 7: Verify measured-outcome waiting state**

Confirm GSC reporting lag is shown honestly and GA4 data or its exact connection/event gap is visible. Confirm no success verdict exists.

- [ ] **Step 8: Publish and verify the live application**

Verify GitHub/Lovable sync SHA, deployment readiness, production HTTP status, authenticated browser behavior, and stored database evidence before reporting completion.

- [ ] **Step 9: Commit any verification-only fixes and save a checkpoint**

Use narrow conventional commits. The checkpoint must include final SHA, deployment ID, canary IDs, test counts, live database counts, remaining provider blockers, and cost incurred.
