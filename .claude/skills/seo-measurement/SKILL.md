---
name: seo-measurement
description: Ground any SEO rule, threshold, measurement window, or "did this work" verdict in primary sources before writing it. Use when adding or changing a finding rule, a confidence value, a measurement window, an outcome verdict, or any number that tells the operator how their site is doing. Also use when auditing existing rules for claims Google's own documentation contradicts.
---

# Measuring search performance honestly

This project exists because two days were lost to a pipeline that looked busy and
was doing nothing. Every number that reaches the operator has to survive the
question "what says so, and where did you read it".

## The rule

**Primary sources first, and say which one.** In order:

1. Google's own documentation — `developers.google.com/search`,
   `support.google.com/webmasters`. This is the only source that is
   authoritative about how Google behaves.
2. Published research with a method — a paper, a study with sample sizes, an
   experiment with a control.
3. The operator's own verified research —
   `mark/05-logs/trumove-seo-geo-strategy-2026.md` carries 109 claims of which
   25 were adversarially verified with three independent votes each. Claims that
   survived that are usable; claims in the same file that did not are not.
4. Everything else, which is not evidence. SEO agency blogs, vendor content
   marketing and tool documentation are marketing. They may be right. They are
   not a citation.

If a threshold cannot be traced to 1, 2 or 3, it is a guess. Guesses are allowed
only when named as such in a comment beside the constant, with what would settle
it. `7` in the old measurement windows is the cautionary example: it appeared in
one spec line, was copied forward for months, and traced back to nothing.

## What Google's documentation actually constrains

These are quoted, checked, and they change designs. Re-verify before relying on
them; documentation moves.

**Query data is anonymized away below a threshold.** Anonymized queries are
those *"not issued by more than a few dozen users over a two-to-three month
period"*. They are omitted from tables, included in chart totals, **and omitted
whenever a filter is applied**. On a low-traffic property almost every query is
under this threshold, so query-dimension data is largely absent rather than
merely thin. Prefer page-dimension data as the unit of measurement. Non-query,
non-URL dimensions do not have this problem: *"For requests that don't involve
query or URL dimensions… Search Console will display and export all the
data"* — one more reason page-dimension beats query-dimension here.
<https://developers.google.com/search/blog/2022/10/performance-data-deep-dive>
(verbatim definition and per-dimension completeness);
<https://support.google.com/webmasters/answer/96568> (current top-rows
wording; the "few dozen users" definition itself is no longer stated here)

**Not every row is stored.** *"Due to internal limitations, Search Console
stores top data rows and not all data rows. As a result, not all queries
beyond anonymized queries will be shown."* A page reading zero may never have
been stored. Treat a missing page as unknown, never as a measured zero.

**Data lags two to three days.** Never measure a window that has not finalized.
`FINAL_DATA_LAG_DAYS = 3` in this repo exists for this.

**Changes take longer than intuition suggests.** *"Some changes might take
effect in a few hours, others could take several months."* Recrawl and reprocess
alone *"may take a few days to a few weeks"*, and Google's own advice is *"you
likely want to wait a few weeks to assess whether your work had beneficial
effects"*. A two-week window is inside normal reprocessing time, so it can
report *not yet*; it must never report *failure*.
<https://developers.google.com/search/docs/fundamentals/seo-starter-guide>

**Google may not show the title you approved.** *"If we've detected an issue on
the page, we may try to generate an improved title link from anchors, on-page
text, or other sources"*, drawing on `<title>`, the visible heading, `h1`,
`og:title`, prominent text, anchor text and structured data. And *"we can't
manually change title links for individual sites"*. Verifying wording is live on
the page is not verifying Google displays it. A rewritten title is an unmeasured
treatment, not a failed one.
<https://developers.google.com/search/docs/appearance/title-link>

**Several popular checks are things Google says do not matter.** Before adding a
rule, look for a sentence in Google's docs that contradicts it:

- *"Google Search doesn't use the keywords meta tag."*
- *"The length of the content alone doesn't matter for ranking purposes
  (there's no magical word count target)."*
- Heading order: *"it doesn't matter if you're using them out of order."*
- Meta descriptions and titles affect **appearance**, not ranking. A rule about
  them is a click-through rule, and its severity should say so.
- Duplicate content: *"it's fine; don't fret about it… it's not something that
  will cause a manual action."*

A rule may still be worth having when Google says the thing does not rank — a
near-empty page gives Google nothing to understand, and competing headings are a
documented trigger for title rewriting. But the rule's stated reason has to be
the real one, not a ranking claim Google denies.

## Before you write a verdict

**Ask whether the volume can carry the question.** At a 28-day baseline of 10
events, the exact two-sample Poisson test (Przyborowski & Wilenski 1940;
Krishnamoorthy & Thomson 2004) needs an observed jump of at least 2.3× before
p<0.05 is reached, and a true effect of roughly 2.7× before the test has 80%
power. Pooled to about 120 events across a cohort, an observed +29% clears
significance. No method rescues a single page below this floor — not longer
windows, not difference-in-differences, not Bayesian structural time series. A
per-page verdict at ten events a month is fabricated regardless of how it was
computed, and now for a citable reason:
`docs/superpowers/research/2026-08-20-low-volume-measurement-research.md` §2.

What survives at low volume:

- **Indexation.** Binary, per page, needs no statistics, works at any traffic.
- **Appearance at all.** Near-binary when impressions are in single figures.
- **Pooling.** Twelve changes judged together carry twelve times the evidence of
  one. Cluster, do not judge individual URLs.
- **Site-level aggregates** over long windows.

**Grade the change, not the level.** A page holding four hundred clicks before
and after has not improved. A threshold check on the after-number cannot tell
those apart. Compare against the stored baseline, and against the site's own
movement over the same period, so a seasonal swing is not read as a win.

**Do not diff overlapping windows.** Windows anchored to the same start date are
nested, not independent: the 28 day window contains the 14 day one. They answer
"has it cleared this yet", never "how much did it change between them".

**Use `confidence.ts`.** A change inside the noise is inconclusive, not a
result. Counts are arrivals, so the noise floor is set by volume: the standard
error on a count of n is about the square root of n.

## When the data is not there

Say which fact is missing and what would produce it. Never render an absence as
a zero, never render a refusal as a verdict, and never let a stored zero and a
missing row look the same on screen. This is the project's first invariant and
these rules are the specific ways it gets broken.
