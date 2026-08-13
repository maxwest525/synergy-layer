# Title and H1 Proposal Workflow

Date: 2026-08-13
Status: Approved design awaiting implementation-plan review

## Purpose

Build one trustworthy AOOS proposal workflow for changing an existing webpage's SEO title and H1. Findings remain evidence. Only a validated, exact, executable title/H1 change becomes a proposal and enters the Action Center.

This design deliberately excludes metadata descriptions, body content, internal links, technical SEO, advertising, backlinks, and every other proposal type.

## Product states

The operator sees four practical states:

1. **Finding** — AOOS observed a condition. A finding may carry `Needs investigation`, but is not approvable.
2. **Proposal** — AOOS has an exact, validated title/H1 before-and-after change.
3. **Approved change** — the operator approved one immutable proposal version. It may be awaiting execution, published, or tracking.
4. **Measured outcome** — finalized post-publication evidence is displayed beside the baseline without an automatic success verdict.

Existing internal execution states may remain where needed for safe transitions, but the UI must not expose them as additional product concepts.

## Scope

### Included

- Repair observation-only approval leakage.
- Clean up existing observation-only Action Center rows.
- Select a page-level finding for title/H1 evaluation.
- Collect evidence from only:
  - the live webpage;
  - Google Search Console;
  - DataForSEO;
  - GA4;
  - previous AOOS changes.
- Apply deterministic evidence-sufficiency rules.
- Draft one title/H1 candidate through a provider-neutral generator interface whose first adapter calls Gemini directly.
- Deterministically validate the candidate.
- Create, edit, regenerate, ignore, approve, execute, publish, and measure this proposal type.
- Lock the exact approved version.
- Refuse execution when source or live-page values drift.

### Excluded

- Lovable AI Gateway.
- Other model providers beyond the replaceable interface.
- Other proposal types.
- New provider catalogs or architecture inventories.
- GitHub repositories and skills as evidence sources.
- Automatic success scoring.
- Background paid DataForSEO collection initiated solely for proposal generation.

## Existing approval bug

Current Search Console and SEO validation rules create rows with `metadata.observationOnly = true`, while also setting `state = proposed`, `requires_approval = true`, and filing `pending_approval` inbox items. This makes evidence look like an executable proposal.

The repair has three layers:

1. **Producer invariant** — observation-only findings are stored as `observed`, set `requires_approval = false`, and never call `fileInboxItem`.
2. **Server invariant** — Action Center queries exclude recommendation subjects whose metadata is observation-only. Recommendation decision handlers continue to reject them even if called directly.
3. **Data repair** — unresolved Action Center items tied to observation-only recommendations are resolved into a non-actionable historical state. Their findings and evidence remain stored. No evidence is deleted.

A database constraint or guarded write path must prevent future observation-only rows from simultaneously requiring approval. Because the database is exposed through Supabase's Data API, every new table must have tenant-scoped RLS; operator mutations must require the existing operator predicate, not merely `TO authenticated`.

## Finding eligibility

Only an existing page-level finding with a title/H1-compatible rule may enter this workflow. Initial eligible rule families are:

- high-impression, low-CTR page;
- zero-click page with meaningful impressions;
- page visibility or click decline where title/query mismatch is supported;
- an approved-query coverage gap tied to one existing owned page.

Competitor identity observations, property-wide findings, query-only findings without a resolved page, indexing failures, technical failures, and backlink findings are ineligible.

An ineligible or incomplete row remains a finding with `Needs investigation` and a plain-language list of missing evidence.

## Required evidence bundle

The deterministic collector builds one immutable evidence bundle:

### Live webpage

- final URL after redirects;
- rendered title;
- exactly one primary H1;
- readable main-page text used only for claim validation and topical context;
- observation time;
- content checksum.

Failure to render the page, a cross-domain redirect, a missing title, no H1, or multiple ambiguous H1s blocks proposal creation.

### Google Search Console

- the page's finalized query rows;
- clicks, impressions, CTR, and average position;
- comparison-period values;
- reporting dates;
- the finding and threshold that caused evaluation.

The page must have enough finalized GSC evidence to support the originating rule. No modeled traffic estimates substitute for GSC evidence.

### DataForSEO

- stored, previously collected SERP and competitor-page evidence relevant to the page's approved queries;
- observed competitor titles and H1s when available;
- collection dates and provider provenance.

The generator must not trigger unapproved paid collection. Missing, stale, or irrelevant DataForSEO evidence blocks proposal generation and leaves `Needs investigation` with the exact reason.

### GA4

- page-level sessions or views;
- engagement measure;
- configured lead-event counts;
- comparison window and reporting dates.

GA4 is a required source for this first workflow. If the Data API is not connected, the page is not present in GA4 results, or lead events are not configured, the finding remains `Needs investigation`. AOOS must show the missing credential, access, property, or event mapping instead of skipping GA4.

### Previous AOOS changes

- prior title/H1 proposals and executions for the same canonical URL;
- the approved values and publication times;
- any rollback or unresolved measurement state.

An active proposal or unmeasured recent change for the same page blocks generation unless the operator explicitly ignores or closes it. This prevents recommendation churn and overlapping experiments.

## Sufficiency gate

Deterministic code decides eligibility. Gemini cannot override it.

The gate passes only when:

- the finding is an allowed page-level rule;
- the live rendered page is valid and allowlisted;
- title and H1 are unambiguous;
- GSC evidence satisfies the originating typed threshold;
- relevant stored DataForSEO competitor evidence exists and is fresh under a documented freshness window;
- GA4 page and lead-event evidence is readable;
- no conflicting AOOS change is active;
- every source timestamp and checksum is stored.

On failure, the finding gets `Needs investigation` plus machine-readable missing-evidence codes and operator-readable reasons. It does not enter Action Center.

## Generator boundary

Define a server-only interface conceptually equivalent to:

```ts
interface TitleH1Generator {
  generate(input: TitleH1DraftInput): Promise<TitleH1Draft>;
}
```

The interface receives only the normalized evidence bundle and explicit constraints. It cannot query providers, read secrets, write the database, approve anything, or execute changes.

The first adapter calls the Gemini Developer API directly using structured JSON output. Configuration is server-only:

- `PROPOSAL_GENERATOR_PROVIDER=gemini`
- `GEMINI_API_KEY`
- `GEMINI_PROPOSAL_MODEL`

The model name is configuration, not a code constant. No secret or raw authorization value reaches the browser or stored evidence. The call records provider, model, request time, response status, and token/usage metadata when Google returns it. The prompt and stored response exclude secrets.

Gemini produces exactly:

- proposed title;
- proposed H1;
- concise evidence-linked rationale;
- expected metric to improve;
- confidence rationale;
- verification description;
- reversal description;
- claim list used in the proposed wording.

It may draft wording only. It cannot decide that evidence is sufficient, assign final confidence, create a proposal, select an executor, or declare success.

## Deterministic validation

The draft becomes a proposal only after all checks pass:

- output conforms to the strict schema;
- title and H1 are non-empty and meaningfully different from current values;
- current title and H1 still match the captured live-page values;
- proposed values meet configured length and character rules;
- wording matches the page topic and approved query evidence;
- every factual claim appears in the live page or approved business evidence;
- competitor names, unsupported superlatives, prices, guarantees, locations, accreditations, and service claims are rejected unless directly supported;
- no existing owned page already uses the proposed title/H1 combination;
- exact execution target and reversal values exist;
- expected metric is one of GSC clicks, impressions, CTR, or ranking position; GA4 engagement and lead events remain tracked secondary measurements;
- confidence is calculated from deterministic evidence coverage, freshness, agreement, and validation results rather than copied from Gemini.

Validation failure leaves the row as `Needs investigation` and stores the rejection reasons. It does not silently retry more than the standing three-attempt limit and does not file an Action Center item.

## Proposal and versions

Reuse `change_requests` as the executable proposal record instead of adding another top-level lifecycle. Add an immutable version table for title/H1 payloads.

Each proposal version stores:

- proposal/change request ID and monotonically increasing version number;
- page URL and canonical URL;
- current and proposed title/H1;
- evidence bundle reference and checksum;
- live-page content checksum;
- source revision when available;
- rationale and evidence summary;
- expected metric;
- deterministic confidence and its inputs;
- verification and reversal instructions;
- generator provider/model metadata;
- creation reason: initial, regenerate, or operator edit;
- creator and timestamp.

Initial generation creates version 1. Edit or Regenerate creates a new immutable version and makes it current. Old versions remain readable for audit. No version is created for merely opening or reviewing a proposal.

Approval writes `approved_version_id`, `approved_by`, and `approved_at` atomically. A database invariant prevents the approved version from changing. Editing or regenerating after approval requires rejecting/closing the approved change and creating a new proposal; it cannot mutate the authorization.

## Action Center

Only a validated title/H1 proposal receives a pending-approval Action Center item.

The card and detail page display:

- page URL;
- current title and H1;
- proposed title and H1;
- evidence and reason;
- expected metric;
- deterministic confidence;
- verification plan;
- reversal plan;
- source freshness and any limitations.

Available actions:

- **Approve** — atomically locks the current exact version.
- **Edit** — creates a new operator-authored version, then revalidates it.
- **Regenerate** — runs Gemini once against a fresh evidence bundle and creates a new version only if validation passes.
- **Ignore** — records the decision, closes the proposal, and leaves the underlying finding available as evidence.

Generic Clear is not a proposal decision. Restore/Unclear may restore a dismissed non-approval inbox item, but cannot reopen or change an approved authorization.

## Execution and publication proof

Execution reads only the locked approved version.

Before any write it re-fetches the live rendered page and the governed source revision. It refuses when:

- the live title or H1 differs from the approved `before` values;
- the live content checksum has materially drifted;
- the source revision changed;
- either approved `before` value does not occur exactly once in the governed source;
- the proposed values are already present;
- the URL or source target falls outside the allowlist.

On drift, the state remains an approved change but execution is blocked with `Page changed — review required`. It never adapts the approved values automatically.

Successful execution records the source commit. Publication verification renders the live page and confirms both approved values. The render result, timestamp, final URL, commit, and matched values are stored inside the execution record as publication proof.

## Measurement

The proposal captures a pre-change baseline before approval. After publication, the existing daily observation process collects finalized evidence.

The measured outcome displays:

- GSC ranking position, impressions, clicks, and CTR;
- GA4 engagement and configured lead events;
- baseline window;
- post-publication window;
- reporting lag and completeness;
- absolute and relative differences where mathematically valid;
- source dates and sample sizes.

The system does not automatically label the result successful, failed, or causal. New data is only new evidence. A positive point estimate remains a point estimate. Outcome verification, if retained internally, means the evidence was reviewed—not that the change caused improvement.

## Security and tenancy

- Gemini and provider credentials stay server-side.
- Proposal versions and evidence bundles use tenant-aware foreign keys or guarded server writes.
- Public-schema tables have RLS enabled.
- Tenant members may read their tenant's proposal evidence.
- Only operators may generate, edit, regenerate, ignore, approve, execute, or alter proposal state.
- Approval and execution mutations must be atomic where multiple records change.
- Direct Data API writes cannot bypass the same state and version invariants.
- No `SECURITY DEFINER` function is added merely to bypass RLS.

## Failure behavior

- Missing source: finding remains `Needs investigation` with the precise source blocker.
- Gemini missing/unavailable: no proposal; record one failed generation attempt and show the provider/model blocker.
- Invalid model output: no proposal version is created.
- Validation failure: no Action Center item is created.
- Edit validation failure: current valid proposal version remains current; show the rejected edit reasons.
- Regeneration failure: current valid version remains unchanged.
- Approval race: compare current version and evidence checksum atomically; reject stale approval.
- Execution drift: no write; request review.
- Publication mismatch: execution record remains unproven; do not start the outcome window.
- GA4 post-publication failure: show GSC evidence and an explicit GA4 measurement gap; do not call the outcome complete.

## Testing strategy

Implementation follows red-green TDD.

### Approval regression

- Observation-only producers set `observed` and `requires_approval = false`.
- They never file an Action Center item.
- Action Center query filters legacy observation-only rows.
- Direct approval attempts remain rejected.
- Data repair preserves findings while closing their pending inbox rows.

### Sufficiency

- Each missing source independently produces `Needs investigation`.
- Ineligible rule and ambiguous page structure never call Gemini.
- Stale DataForSEO and conflicting AOOS changes block generation.
- Complete evidence calls the configured generator once.

### Generator and validation

- Provider selection comes from configuration.
- Lovable AI is never imported or called.
- Structured Gemini output is parsed strictly.
- Unsupported claims, unchanged wording, malformed output, and drift fail validation.
- Gemini confidence cannot set final confidence.

### Versioning and approval

- Initial generation creates version 1.
- Edit and regeneration create immutable subsequent versions.
- Failed edit/regeneration does not replace the current version.
- Approval locks the exact current version atomically.
- Approved versions cannot be edited or replaced.

### Execution and measurement

- Source/live drift refuses without writing.
- Exact approved values execute and publication proof records both rendered matches.
- Finalized GSC and GA4 rows display beside baseline.
- Missing or delayed data remains pending.
- Positive differences do not create an automatic success state.

### Verification

- Unit and server integration tests.
- Migration/RLS verification against the live project before claiming deployment.
- TypeScript, build, targeted lint, and full relevant test suite.
- Authenticated browser test: finding → generation → proposal card → edit/regenerate → approve locked version → drift refusal and clean execution canaries → publication proof → outcome display.
- Database inspection confirms version immutability, tenant isolation, audit events, and absence of observation-only pending approvals.

## Definition of done

This workflow is complete only when:

- no observation-only finding appears in Action Center or requires approval;
- legacy leaked items are repaired without deleting evidence;
- one real page finding is enriched from all five required sources;
- insufficient evidence visibly remains `Needs investigation`;
- direct Gemini creates a structured draft through the replaceable interface;
- deterministic validation creates one exact title/H1 proposal;
- Edit, Regenerate, Ignore, and Approve work in the authenticated browser;
- approval locks the exact version;
- pre-execution page drift is demonstrated to refuse safely;
- one approved version is published and rendered proof is stored;
- GSC and GA4 baseline/follow-up tracking is visible without an automatic success judgment;
- the live database, published UI, and stored evidence agree.
