---
id: 20260814-evidence-policy
title: Evidence Policy
tags: [evidence, governance, seo]
created: 2026-08-14
updated: 2026-08-14
related:
  [
    20260814-source-of-truth,
    20260814-detection-rules,
    20260814-validation-gates,
    20260814-outcome-measurement,
    20260814-brand-claims,
    20260814-knowledge-ingestion,
  ]
summary: Sufficiency, provenance, freshness, confidence, contradiction, and recommendation-language rules.
---

# Evidence Policy

> Tool output is evidence with limits, never hidden platform truth or automatic causal proof.

## Recommendation labels

| Label                    | Use                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Deterministic repair     | X is objectively broken, missing, invalid, or inconsistent and Y repairs that defect.                    |
| Evidence-based candidate | Y was selected reproducibly from dated evidence and house rules but has not won.                         |
| Validated winner         | A credible comparison indicates Y improved local outcome Z while quality and business guardrails passed. |

Normative claim language is separate: `Required`, `Supported`, `Probable`, `Hypothesis`, or `Unknown`.

## Evidence hierarchy

1. Engine rule, law, accessibility/security standard for named eligibility requirements.
2. Valid direct first-party evidence: GSC for Google exposure/clicks; analytics, logs, CRM, and research for site behavior/business outcomes.
3. Controlled or credible matched test for causal effect.
4. Replicated independent research for general mechanisms.
5. Industry observational datasets for discovery and directional heuristics.
6. Expert judgment for labeled hypotheses.
7. Proprietary tool scores and AI output for triage or drafting only.

Question fit matters. An official policy does not quantify this site's conversion effect; a site experiment does not reveal Google's private ranking system.

## Mandatory evidence fields

Every evidence object must carry source/provider, collection time, target/query/page scope, checksum or immutable reference, relevant dimensions, freshness state, limitations, and collection method. Confidence must explain evidence reliability and scope fit; it is not a disguised probability.

## Contradictions and freshness

- Preserve conflicting evidence and name the context difference if known.
- A higher-level source controls only the question it is authoritative for.
- Expired or materially changed evidence blocks high-impact execution.
- Provider estimates never replace owned measurements.
- Generated copy never serves as factual support for its own claims.

## Title/H1 sufficiency

The current executable slice requires one allowlisted rendered live page with one H1, exact-page GSC rows, relevant active-tracked DataForSEO competitor evidence, and the source revision/before-values needed for execution. GA4 and SerpAPI have optional, explicitly labeled roles; their absence is disclosed and does not block title/H1 drafting. No composite score may conceal a missing mandatory source.

## Related

- [Source of Truth](SOURCE_OF_TRUTH.md)
- [Validation Gates](VALIDATION_GATES.md)
