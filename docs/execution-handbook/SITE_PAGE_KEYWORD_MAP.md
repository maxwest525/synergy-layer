---
id: 20260814-site-page-keyword-map
title: Site, Page, and Keyword Map
tags: [seo, governance, architecture]
created: 2026-08-14
updated: 2026-08-14
related: [20260814-component-registry, 20260814-brand-claims, 20260814-validation-gates]
summary: Canonical schema and current verified boundary for page purpose, query ownership, funnel role, and cannibalization control.
---

# Site, Page, and Keyword Map

> No page or keyword assignment is filled with demo or inferred data.

## Required row schema

| Field                     | Meaning                                         |
| ------------------------- | ----------------------------------------------- |
| site/property             | exact owned site and Search Console property    |
| canonical URL             | final governed public URL                       |
| source repo/branch/path   | exact executable source target                  |
| page type and purpose     | the user job the page must complete             |
| primary query cluster     | one governed intent cluster, not a keyword dump |
| supporting clusters       | non-conflicting sub-intents                     |
| exclusions                | queries/jobs this page must not target          |
| funnel role and CTA       | stage, next action, and measured destination    |
| brand/claim dependencies  | approved facts required by the page             |
| current title/H1/checksum | dated rendered before-state                     |
| evidence window           | GSC/SERP source dates and IDs                   |
| cannibalization boundary  | sibling pages and resolution rule               |
| owner/status/last review  | accountable operator and freshness              |

## Current verified registry

| Site/property                                         | State                                            | Notes                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://trumoveinc.com` / `sc-domain:trumoveinc.com` | `EXTERNAL` observed property; page map `BLOCKED` | The repo records the selected property and real page/query observations, but it does not contain an operator-approved page-purpose/query-ownership export. |

No individual mappings are asserted here. Observed GSC query-to-page rows are evidence inputs, not automatic strategic assignments. Before a proposal is executable, the exact URL must be allowlisted and its page purpose, exclusions, source target, and cannibalization boundary must be approved.

## Import and review rule

Populate this registry only from an authoritative owned-site inventory plus operator-approved intent assignments. Validate canonical/rendered URLs, preserve source date/checksum, flag conflicts, and require explicit resolution when two pages own the same primary intent.

## Related

- [Component Registry](COMPONENT_REGISTRY.md)
- [Brand and Claims](BRAND_AND_CLAIMS.md)
- [Validation Gates](VALIDATION_GATES.md)
