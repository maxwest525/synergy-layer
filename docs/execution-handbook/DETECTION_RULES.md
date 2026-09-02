---
id: 20260814-detection-rules
title: Detection Rules
tags: [seo, evidence, governance]
created: 2026-08-14
updated: 2026-08-29
related: [20260814-component-registry, 20260814-diagnosis-remedy-matrix, 20260814-evidence-policy]
summary: Every implemented finding rule, the five producers they live in, and the three different ways a rule decides to fire.
---

# Detection Rules

> Detection creates a dated finding. It does not create permission to execute.

**Reviewed 2026-08-29 against the code.** Every threshold this file carried was
still correct, and every one below was re-read from source rather than carried
forward. What was wrong was the scope: the file documented 13 of 26 rules and
one of three detection mechanisms, while describing itself as the exact
implemented set. A reader — human or agent — would have concluded that a rule
absent from here does not exist.

## The three ways a rule fires

Not every rule is a number in a table, and treating them as one is how a reader
concludes a rule is missing when it is simply gated differently.

| Mechanism | What decides | Used by |
| --- | --- | --- |
| **Fixed numeric threshold** | A local constant. Every value has to carry a citation. | Search Console, SEO validation, GA4 |
| **Published band** | Google's own Core Web Vitals bands. No local value exists to argue about. | PageSpeed |
| **Confidence-band gate** | `confidenceInCountChange(before, after)` — the rule fires only when the band is **not `low`**. There is no impression floor; the volume itself decides whether the change is speakable. | Site-level shifts, referring domains |

The third is the one the 2026-08-20 threshold audit introduced, and it exists
precisely so a small denominator cannot be reported as a clean reading. A rule
using it has no number to document, and that is the point.

## Producer 1 — Search Console performance

`SEARCH_CONSOLE_THRESHOLDS` in `src/lib/rule-thresholds.ts`, applied in
`src/lib/search-console-rules.server.ts`. Comparison window: 7 days.

| Rule | Trigger |
| --- | --- |
| `striking_distance_query` | position 8–20 inclusive and at least 50 impressions |
| `weak_ctr_page` | at least 200 impressions and CTR at or below 1% |
| `position_loss` | at least 100 impressions and position worsened by at least 3 |
| `visibility_gain` | prior impressions at least 100 and impressions grew at least 35% |
| `site_visibility_shift` | **confidence-band gate** on the impression change. No floor. |
| `site_clicks_shift` | **confidence-band gate** on the click change. No floor. |

## Producer 2 — Search Console page checks

`RULE_CHECK_THRESHOLDS` in `src/lib/search-console-rule-checks.ts`.

| Rule | Trigger |
| --- | --- |
| `possible_query_overlap` | at least 2 pages at 25 impressions each, ignoring any page already at position 5 or better |
| `zero_impression_page` | an audited URL with no impressions at all; capped at 20 findings per run |
| `query_coverage_gap` | impressions at least 25, position 5–20, and **every** content word of the query absent from the page |
| `index_coverage_drift` | a stored URL inspection whose last crawl is more than 30 days old |

`query_coverage_gap` requires *all* content words missing, not some. A partial
match is not a coverage gap, and reporting it as one would manufacture work.

## Producer 3 — SEO validation

`SEO_VALIDATION_THRESHOLDS` in `src/lib/rule-thresholds.ts`, applied in
`src/lib/seo-validation.server.ts`.

| Rule | Trigger |
| --- | --- |
| `declining_clicks` | prior clicks at least 10 and drop at least 30% |
| `declining_impressions` | prior impressions at least 100 and drop at least 25% |
| `declining_position` | at least 50 impressions and position worsened by at least 3 |
| `high_impression_low_ctr` | at least 200 impressions and CTR at or below 1% |
| `zero_click_page` | at least 150 impressions and zero clicks |
| `possible_query_overlap` | 2 pages, 25 impressions per page, 2 periods, 50 total impressions |
| `significant_period_change` | prior impressions at least 100 and absolute change at least 50% |
| `research_page_traction` | at least 20 impressions and impression growth at least 25% |
| `competitor_outranks_owned` | at least 3 observed queries and confidence at least 0.5 |
| `owned_absent_from_approved_serps` | at least 5 absent SERPs and absence share at least 25% |

The last two read observed SERP profiles only, never estimates.

## Producer 4 — PageSpeed

`src/lib/pagespeed-rule-checks.ts`. **Google's published Core Web Vitals bands,
not local values**: LCP good at or under 2500 ms, poor above 4000 ms; CLS good
at or under 0.1, poor above 0.25.

| Rule | Trigger |
| --- | --- |
| `page_lcp_poor` | a stored lab reading in the poor band |
| `page_cls_poor` | a stored lab reading in the poor band |

**Only the poor band fires.** The middle band is not a finding, because "needs
improvement" is not a defect. These are lab readings, and the finding says so on
screen rather than implying field data. Neither claims a ranking effect.

## Producer 5 — GA4 behaviour

`GA4_RULE_THRESHOLDS` in `src/lib/ga4-rule-checks.ts`. Windows are two
**overlapping 28-day** GA4 windows, which damps every ratio — so a drop that
clears the bar means recent daily traffic fell harder than the number shows.

| Rule | Trigger |
| --- | --- |
| `page_traffic_loss` | prior sessions at least 50 and a drop of at least 20% |
| `page_traffic_gain` | prior sessions at least 50 and growth of at least 25% |
| `zero_engagement_page` | at least 50 sessions and no engagement; capped at 10 per run |
| `event_disappeared` | prior event count at least 25 and the event now absent; capped at 10 per run |

## Producer 6 — Targeting and backlinks

`src/lib/targeting-rules.ts`. **No numeric thresholds exist here**, and none
should be invented: two of these are facts read straight off stored rows, and
the third is confidence-gated.

| Rule | Trigger |
| --- | --- |
| `approved_keyword_unobserved` | an approved keyword no stored SERP has ever looked up |
| `approved_keyword_no_page` | an approved keyword with no page mapped to it |
| `referring_domain_movement` | domains gained or lost between collections, **confidence-band gated** on the count change |

## Persistence invariant

All rule-engine results are observation-only:

- state is `observed`;
- `requires_approval` is false;
- no pending-approval Inbox item is filed;
- identical evidence is deduplicated using stored fingerprints.

Producers use `observationRecommendationRecord` (`src/lib/observation-record.ts`).
This invariant is unchanged and was re-verified on 2026-08-29.

**What did change:** a finding may now offer a governed *draft*, which is not the
same as approval. `src/lib/finding-fix-target.ts` decides whether a rule has a
lane that could answer it. Four rules do; four more carry a written reason for
having none; the remaining 18 fall through to a generic sentence, which is
tracked as backlog CODE-1. Drafting still produces a `proposed` change request
that a human has to approve.

## Threshold changes

A threshold change must include rationale, evidence, affected rule IDs, test
updates, effective date, and whether the changed decision requires a major
knowledge-rule version.

**A new rule must be added to this file in the same change.** Thirteen were not,
between 2026-08-19 and 2026-08-29, which is what made this review necessary.

## Related

- [Diagnosis and Remedy Matrix](DIAGNOSIS_REMEDY_MATRIX.md)
- [Evidence Policy](EVIDENCE_POLICY.md)
