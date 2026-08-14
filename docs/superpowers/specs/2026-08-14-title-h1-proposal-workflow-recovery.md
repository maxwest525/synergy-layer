# Title and H1 Proposal Workflow — Recovery Specification

Date: 2026-08-14  
Status: implementation authority for the protected recovery branch

## Product boundary

AOOS supports exactly one executable proposal: a paired SEO title and H1 change. There is no generic proposal API and no other proposal type.

The workflow is operator-driven automation, not a runtime-agent system. Generate and Regenerate are the only operations allowed to call Gemini. Page loads, observations, schedulers, approvals, execution, publication checks, and measurement never call Gemini.

## Evidence contract

Proposal generation requires three and only three proposal-evidence classes:

1. the current rendered live page, including its title and H1;
2. stored Google Search Console page/query evidence for the exact page;
3. stored DataForSEO organic results for those queries, filtered to active tracked competitors.

GA4 is measurement-only. It never blocks generation and never enters the Gemini prompt. Project knowledge may supply bounded writing guidance, but it is labeled separately and is not proposal evidence or an eligibility signal.

Missing live-page facts, usable GSC evidence, relevant competitor evidence, or an executable source baseline fails closed before Gemini or persistence.

## Model boundary

AOOS calls the Google Gemini API directly. The Lovable AI Gateway is not in this path.

Gemini drafts only:
- SEO title;
- H1;
- concise rationale.

AOOS deterministically owns evidence selection, eligibility, tenant isolation, URL allowlisting, source-file targeting, lifecycle rules, version rules, approval, drift checks, GitHub execution, rendered publication proof, and measurement semantics.

Gemini output must use a strict JSON schema and be validated. Malformed, incomplete, timed-out, or unparseable output creates no proposal, version, or Action Center item.

## Operator lifecycle

The UI exposes four practical states without rewriting the existing execution-state storage:

1. **Draft** — generated or revised and editable.
2. **Approved** — exact wording and source baseline are locked.
3. **Committed** — the approved source change has been committed; publication is not yet proven.
4. **Live** — the rendered page exactly matches both approved values.

Rejected and rolled-back outcomes remain recorded as terminal history, not additional active workflow lanes. A Live result is publication proof, not an automatic success judgment.

## Version contract

Initial Generate creates the current proposal and no version-history row.

Edit and Regenerate each append one immutable version containing the new current wording, rationale, evidence snapshot, generation context, author, revision kind, and timestamp. Edit does not call Gemini. Regenerate rebuilds the three evidence classes and calls Gemini exactly once.

Once approved, proposal wording, evidence, and source baseline cannot be mutated. Further change requires a new draft workflow.

## Action Center contract

Observation-only findings never enter Action Center, require no approval, and expose no approve or execute action. Action Center contains only:
- unresolved concrete title/H1 change requests; and
- explicitly classified real failures requiring operator attention.

Legacy FYI, scheduled, agent-approval, workflow-approval, and observation items are preserved as history but archived from the active surface.

## Execution and proof

Approval authorizes the exact title, H1, target, and source revision reviewed by the operator.

Execution reuses the existing exact-replacement GitHub executor. It refuses before writing when the branch head differs from the approved source revision, either approved before-value is absent, or either occurs more than once.

A source commit is not publication proof. The rendered page must exactly match both approved values before the workflow is shown as Live.

## Measurement

GA4 and post-change GSC data may be displayed once available. AOOS never converts data availability or metric movement into an automatic success verdict. Success remains an operator judgment.

## Knowledge behavior

Knowledge retrieval is deterministic and tenant-scoped: active entries are filtered to approved collections, ranked by collection priority plus tag/title/body token overlap, and returned as bounded excerpts with entry IDs and source references. It uses no embeddings and no model call.

For title/H1 generation, knowledge can be labeled as writing guidance only. It cannot replace, satisfy, or alter the three required evidence classes.

## Safety and tenancy

All new tables, reads, writes, and RPCs are tenant-scoped with RLS and server-side tenant enforcement. Proposal persistence is transactional. Cross-tenant access fails. Approved versions are append-only and update/delete operations fail.

## Acceptance gates

- observation-only evaluation produces no Action Center item;
- scheduler and observation paths cannot invoke Gemini;
- GA4 absence does not block generation;
- irrelevant or untracked competitor rows are excluded;
- malformed Gemini output writes nothing;
- initial Generate creates zero version rows;
- Edit and Regenerate each append one immutable version;
- no non-title/H1 type is accepted;
- approval snapshots exact wording and baseline;
- source or branch drift refuses with zero GitHub write;
- commit and rendered-live proof remain distinct;
- measurement never auto-marks success;
- cross-tenant proposal and version access fails.
