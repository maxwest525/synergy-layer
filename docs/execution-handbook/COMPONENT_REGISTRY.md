---
id: 20260814-component-registry
title: SEO Component Registry
tags: [seo, architecture]
created: 2026-08-14
updated: 2026-08-14
related:
  [20260814-detection-rules, 20260814-diagnosis-remedy-matrix, 20260814-site-page-keyword-map]
summary: Scope, evidence, local outcome, and current AOOS state for the twelve governed page components.
---

# SEO Component Registry

> A component may be observed without being safely executable.

| Component        | Local goal                                            | Minimum evidence                                                        | Nearest outcome                            | Current AOOS state                                  |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| URL              | One reachable, intended canonical URL                 | rendered status, canonical, indexability, redirects, page-query mapping | crawl/index consistency                    | `DESIGNED`                                          |
| Title element    | Accurate query and task recognition                   | rendered title, GSC page/query rows, relevant stored SERP evidence      | qualified CTR at comparable position       | paired title/H1 workflow `IMPLEMENTED` and deployed |
| Meta description | Factual, useful result summary                        | HTML description, rendered snippet sample, page intent                  | qualified click choice                     | `DESIGNED`                                          |
| H1               | One truthful primary page promise                     | exactly one rendered H1, page copy, GSC and relevant SERP evidence      | comprehension and relevant coverage        | paired title/H1 workflow `IMPLEMENTED` and deployed |
| Opening          | Confirm fit and scope quickly                         | first non-boilerplate paragraph, page intent, claims                    | comprehension and progression              | `DESIGNED`                                          |
| H2/H3 structure  | Complete, ordered, non-redundant sub-intents          | rendered headings, query/PAA evidence, content structure                | section findability and coverage           | `DESIGNED`                                          |
| Body content     | Complete the user job with supportable facts          | rendered main content, approved claims, primary sources, query gaps     | satisfaction and qualified progression     | `DESIGNED`                                          |
| Internal links   | Accurate discovery and destination priority           | source, target, anchor, status, canonical, context                      | reachability and intended target discovery | `DESIGNED`                                          |
| Images/media     | Accessible, performant, useful media                  | resource status/size, dimensions, alt semantics, placement              | accessibility, performance, comprehension  | `DESIGNED`                                          |
| Trust block      | Resolve uncertainty using verified identity and proof | approved business facts, credentials, policies, authoritative records   | qualified confidence                       | `BLOCKED` on approved brand/claim registry          |
| CTA              | A truthful, working next action matched to stage      | destination/form behavior, page intent, event and CRM mapping           | action completion and qualified leads      | `DESIGNED`                                          |
| Structured data  | Truthful, valid, applicable markup                    | rendered content, schema properties, validator results                  | enhancement eligibility                    | `DESIGNED`                                          |

## Component rule

Technical defects can be deterministic repairs. Wording, structure, creative, persuasion, and net-new markup are candidates until measured. DataForSEO observability does not itself authorize a change.

## Related

- [Detection Rules](DETECTION_RULES.md)
- [Diagnosis and Remedy Matrix](DIAGNOSIS_REMEDY_MATRIX.md)
- [Site, Page, and Keyword Map](SITE_PAGE_KEYWORD_MAP.md)
