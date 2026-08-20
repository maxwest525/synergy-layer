# Handoff: the rule thresholds are wrong, and most of them cannot fire

**Status:** open. Nobody has done this work.
**Read first:** `.claude/skills/seo-measurement/SKILL.md` — it carries the method
and the primary-source quotes. This document is the work order.

## The situation, bluntly

The operator's own words: *"my rules aren't right."* They are correct, and the
problem is bigger than any individual number being off.

Every threshold in the codebase was written for a site with roughly a hundred
times this property's traffic. The best finalized day is **18 impressions across
the whole site**. Over a 28 day window that is about **500 impressions total**,
spread across roughly 48 pages — call it **10 impressions per page per month**.

Now read the thresholds:

| Rule | Requires | Reachable? |
| --- | --- | --- |
| `highImpressionLowCtr` | 200 impressions on one page | no |
| `zeroClickPage` | 150 impressions on one page | no |
| `decliningImpressions` | 100 previous impressions | no |
| `significantChange` | 100 previous impressions | no |
| `strikingDistance` | 50 impressions | no |
| `decliningPosition` | 50 impressions | no |
| `weakCtr` | 200 impressions | no |
| `positionLoss` | 100 impressions | no |
| `visibilityGain` | 100 impressions | no |
| `queryOverlap` | 25 impressions per page | no |
| `coverageGap` | 25 impressions | no |
| `researchTraction` | 20 impressions | barely |
| `decliningTraffic` | 10 previous clicks | no |

Widening the collection window from one day to 28 days multiplied the available
evidence by about twenty-eight and **still** left almost every rule unreachable.
That fix was necessary and it was not sufficient. The rules do not fire because
the thresholds are five to twenty times what a page here actually earns.

**Do not simply lower them.** Lowering a threshold until it fires is how a
system starts reporting noise as findings. That is the failure this project
exists to prevent, and it would be worse than silence.

## What to actually work out

### 1. Which questions the volume can carry

Published guidance is that a page at forty organic visits a month cannot reach
significance in a four week test. This property is an order of magnitude below
that. So for each rule, decide honestly which bucket it is in:

- **Answerable at any volume.** Indexation. Whether a page appeared at all.
  Whether robots.txt blocks it. These are facts, not inferences, and need no
  threshold.
- **Answerable only pooled.** Anything about click-through rate or a change in
  clicks. Twelve pages judged together carry twelve times the evidence. Rewrite
  the rule to fire on a cluster, not a URL.
- **Not answerable here yet.** Say so on screen, name the volume that would make
  it answerable, and do not ship a threshold that pretends otherwise.

Every rule in the table above needs to be assigned to one of these three, with
the reasoning written down.

### 2. Which rules Google's own documentation contradicts

The skill lists the quotes. At least one existing check is already in trouble:

- **`thin_content`** (`page-checks.ts`, severity `warning`) tells the operator to
  *"add real content to N pages that carry almost no text."* Google: *"The
  length of the content alone doesn't matter for ranking purposes (there's no
  magical word count target)."* The check may still be worth keeping — a
  near-empty page gives Google nothing to understand — but its stated reason is
  a ranking claim Google denies, and it must be rewritten or dropped.
- **`description_too_long` / `description_too_short`** are click-through rules,
  not ranking rules. Their copy should say so.
- **`h1_multiple`** is defensible, but for the documented reason (competing
  headings trigger title rewriting), not the usual folklore.

Audit every check in `page-checks.ts` and `site-checks.ts` the same way. For
each, find the sentence in Google's documentation that supports or refutes it,
and cite it in the code.

### 3. The measurement verdicts

`outcome-verdict.ts` carries three invented constants — `REAL_EXPOSURE = 100`,
`EARNED_CLICKS = 5`, `SUSTAINED_IMPRESSIONS = 300`. Nothing derives them. They
are the same species of unaccounted-for number as the `7` day window that was
removed.

Known defects in that module, established but not yet fixed:

- **It grades the level, not the change.** A page holding 400 clicks before and
  after grades `success`. A page falling from 50 clicks to 6 grades `success`.
  The approval baseline — the 28 days before the change, stored in the 0 day
  window — **is already collected and has never been read by anything.**
- **No control for site trend.** A seasonal rise reads as a win.
- **The 14 day failure verdict is wrong.** Google's own timeline says recrawl and
  reprocess alone *"may take a few days to a few weeks"*. Two weeks is inside
  normal reprocessing, so that window can report *not yet* and must never report
  *failure*.
- **`confidence.ts` is not wired in.** A change inside the noise should be
  inconclusive, not a result.
- **The treatment is never verified.** Google *"may try to generate an improved
  title link from anchors, on-page text, or other sources"* and *"we can't
  manually change title links for individual sites."* The pipeline verifies the
  wording is live on the page; it has never verified Google displays it. A
  rewritten title is an unmeasured treatment, not a failed one — and the system
  has never said so.

### 4. The data Google will not give you

Two constraints that change what is even collectable, both from Google's
documentation and both currently unaccounted for in the code:

- **Anonymized queries.** Queries *"not issued by more than a few dozen users
  over a two-to-three month period"* are omitted from tables, included in chart
  totals, and **omitted whenever a filter is applied**. At this volume nearly
  every query is under that threshold. Any rule reading the `query` dimension is
  reading a heavily filtered picture, and none of them say so.
- **Top rows only.** *"Search Console stores top data rows and not all data
  rows."* A page reading zero may never have been stored. Nothing in the codebase
  distinguishes "stored zero" from "never stored" at the row level, which is the
  first invariant broken one layer below where it is usually checked.

## Method

Follow the skill. Briefly: primary sources first and cite them in the code; a
threshold that cannot be traced is a guess and must be labelled as one beside the
constant; never lower a threshold to make a rule fire; and when the data cannot
answer the question, say which fact is missing rather than returning a number.

## Where to start

`src/lib/rule-reachability.ts` already holds the registry: every rule, the row
set it reads, the threshold that binds, what else it waits on, and a `source`
field that is `null` on all fourteen. Filling those `source` fields **is** most
of this work. `citedRuleCount()` counts them and its test asserts only that the
count is below the total, so adding the first citation will not turn the suite
red.

The registry is pinned against `finding-router.ts` by a test, so a rule added to
the router without a registry entry fails rather than silently shrinking the
count the operator sees.

## Definition of done

- Every constant in the table above either carries a citation in a comment, or
  is labelled a stated assumption with what would settle it, or is gone.
- Every rule is assigned to answerable / pooled-only / not-answerable-here, with
  the reasoning in the file.
- Every check in `page-checks.ts` and `site-checks.ts` cites the Google
  documentation that supports it, or is rewritten so its stated reason is true.
- The outcome verdict compares against the stored baseline and the site's own
  movement, uses `confidence.ts`, never reports failure at 14 days, and reports
  a Google-rewritten title as unmeasured rather than failed.
- Rules that read the `query` dimension say on screen that the data is filtered.
- `RULE_REQUIREMENTS` carries a `source` for every entry it can, and the ones it
  cannot are labelled assumptions with what would settle them.
- `weak_ctr_page` and `high_impression_low_ctr` are collapsed: they are the
  identical predicate over the same rows in two engines, and counting them
  separately inflates every total.
- The full suite, typecheck and lint stay green, and the adversarial review runs
  before merge as on every other phase.

## What not to do

Do not delete stored evidence to tidy a list — the ungraded 7 day readings are
kept and labelled for exactly this reason. Do not add a new provider or a new
metered call to solve a thresholds problem. Do not lower a number until
something fires.
