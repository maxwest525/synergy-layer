---
id: 20260814-diagnosis-remedy-matrix
title: Diagnosis and Remedy Matrix
tags: [seo, evidence, execution]
created: 2026-08-14
updated: 2026-08-14
related: [20260814-detection-rules, 20260814-validation-gates, 20260814-component-registry]
summary: Permitted diagnostic branches and remedies for the search-to-conversion dependency chain.
---

# Diagnosis and Remedy Matrix

> Never prescribe a later-stage fix for an earlier-stage failure.

| Stage/problem         | Possible causes                                                 | Required evidence                                                   | Permitted remedy                                    | Prohibited leap                               |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Crawl failure         | blocked fetch, broken URL, redirect chain                       | fetch/status, robots, redirect evidence                             | repair access or redirect                           | rewrite copy                                  |
| Render failure        | critical content absent after rendering                         | rendered DOM and resource errors                                    | repair rendering/resource path                      | add backlinks                                 |
| Index failure         | noindex, canonical conflict, duplicate/low-value page           | live directives, canonical, index evidence                          | repair eligibility or consolidate with approved map | title-only change                             |
| Retrieve failure      | intent mismatch, insufficient coverage, weak internal discovery | page-query GSC, rendered content, mapped intent, links              | correct intent/coverage/linking                     | assume more words will rank                   |
| Select/rank weakness  | competition, authority, evidence quality, freshness             | comparable SERPs, authority vector, page quality, dates             | evidence-based page or authority test               | treat ranking as proof of universal authority |
| Click weakness        | unclear or mismatched title/snippet                             | stable impressions, query/device/position cohorts, rendered snippet | bounded title/meta candidate                        | promise unsupported benefit                   |
| Satisfaction weakness | poor answer, usability, trust, offer mismatch                   | behavior, user research, page facts, CRM quality                    | improve answer/usability/proof                      | chase more traffic first                      |
| Conversion weakness   | broken or mistimed CTA/form/operations                          | event path, form behavior, CRM/service outcomes                     | repair journey and measurement                      | call platform-attributed leads causal lift    |

## Remedy classes

- Deterministic repair: objectively broken, missing, invalid, or inconsistent.
- Evidence-based candidate: reproducibly selected, truthful proposal that has not won.
- Validated winner: passed a credible comparison and downstream guardrails.

Only an executable proposal can enter approval. A diagnosis may remain `Unknown` or `insufficient evidence` indefinitely without being forced into a remedy.

## Related

- [Detection Rules](DETECTION_RULES.md)
- [Validation Gates](VALIDATION_GATES.md)
- [Component Registry](COMPONENT_REGISTRY.md)
