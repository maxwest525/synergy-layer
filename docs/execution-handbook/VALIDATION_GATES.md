---
id: 20260814-validation-gates
title: Validation Gates
tags: [execution, evidence, testing]
created: 2026-08-14
updated: 2026-08-14
related:
  [
    20260814-evidence-policy,
    20260814-proposal-data-contract,
    20260814-brand-claims,
    20260814-execution-rollback,
    20260814-site-page-keyword-map,
    20260814-test-cases,
    20260814-diagnosis-remedy-matrix,
  ]
summary: Fail-closed gates for evidence, claims, intent, duplication, drift, executability, and measurement.
---

# Validation Gates

> A score cannot compensate for a failed mandatory gate.

| Gate          | Pass condition                                                              | Failure result                                |
| ------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| Target        | exact allowlisted public URL and eligible page-level finding                | no proposal                                   |
| Render        | reachable final URL, readable title, exactly one H1, main text, checksum    | no proposal                                   |
| Evidence      | sufficient dated GSC and relevant stored DataForSEO evidence                | `insufficient evidence`                       |
| Intent        | proposed wording matches mapped page purpose and observed query job         | proposal rejected                             |
| Claims        | every factual promise exists on the page or approved claims registry        | proposal rejected                             |
| Competitor    | no copied competitor wording, name, or unsupported comparison               | proposal rejected                             |
| Duplication   | title/H1 is not duplicated or materially colliding with governed pages      | proposal rejected                             |
| Change        | proposed value materially differs from current value                        | proposal rejected                             |
| Format        | schema, lengths, forbidden terms, and field types pass deterministic checks | proposal rejected                             |
| Approval      | selected version checksum equals locked approved checksum                   | execution refused                             |
| Drift         | live title/H1 and content checksum still match approved before-state        | `Page changed — review required`; zero writes |
| Adapter       | exact source target and renderer/write adapter are configured               | execution blocked                             |
| Publish proof | public rendered title/H1 equals approved after-state                        | not applied                                   |
| Measurement   | baseline/follow-up windows and gaps are explicit                            | comparison can display; no causal verdict     |

## Generator boundary

The model may draft structured candidates only. Deterministic code owns eligibility, schema enforcement, claim/competitor/duplicate checks, approval checksum, execution drift refusal, and measurement labeling.

## Current state

Title/H1 gates through drift refusal are `IMPLEMENTED` locally. Database activation, real provider invocation, UI persistence, and live publication proof remain `BLOCKED` or `EXTERNAL`.

## Related

- [Evidence Policy](EVIDENCE_POLICY.md)
- [Brand and Claims](BRAND_AND_CLAIMS.md)
- [Execution and Rollback](EXECUTION_ROLLBACK.md)
