# Low-volume SEO measurement: source-cited research digest

**Date:** 2026-08-20. **Property context:** best finalized day 18 impressions site-wide;
~500 impressions/28d across ~48 pages (~10 impressions/page/28d).
**Source classes used below:** `[G]` = Google's own documentation (authoritative about Google's
behavior). `[P]` = published research/statistical method (peer-reviewed or standard reference,
method stated). `[V]` = vendor/agency content — **not evidence** under the skill hierarchy;
included only to trace where a claim came from. Computed results are labeled `[computed]` with
the method they derive from.

---

## 1. GSC data limits: anonymized queries, top rows, API, granularity

### Anonymized queries — the verbatim source is the 2022 blog post, not answer/96568

`[G]` Daniel Waisberg, "A deep dive into Search Console performance data filtering and limits,"
Google Search Central Blog, Oct 2022 —
<https://developers.google.com/search/blog/2022/10/performance-data-deep-dive>
(fetched verbatim 2026-08-20):

> "Some queries (called anonymized queries) are not included in Search Console data to protect
> the privacy of the user making the query. Anonymized queries are those that aren't issued by
> more than a few dozen users over a two-to-three month period."

> "While the actual anonymized queries are always omitted from the tables, they are included in
> chart totals, unless you filter by query."

> "There is no row for anonymized queries in the report table or API (added here for
> illustration purposes), so if you sum up clicks for all the rows, you'll not find the same
> number of clicks as the chart totals."

> "The anonymized queries are omitted whenever a filter is applied, so there will be a
> discrepancy if you compare the sum of clicks in the chart totals to the sum of clicks
> containing some_string and not containing some_string."

**Wording drift vs the skill:** the skill cites
<https://support.google.com/webmasters/answer/96568> for the "few dozen users" definition. The
current answer/96568 page carries only the softer wording (fetched 2026-08-20):

> "To protect user privacy, the Performance report doesn't show all data. For example, we might
> not track some queries that are made a very small number of times or those that contain
> personal or sensitive information."

The precise "few dozen users over a two-to-three month period" definition lives in the blog
post above. The skill's quote is real; its URL attribution should move to the blog post (or
cite both).

### Top data rows — confirmed at answer/96568, current wording

`[G]` <https://support.google.com/webmasters/answer/96568> (fetched 2026-08-20):

> "Due to internal limitations, Search Console stores top data rows and not all data rows. As a
> result, not all queries beyond anonymized queries will be shown."

The skill's quote matches the current first sentence exactly; the second sentence ("not all
queries beyond anonymized queries will be shown") is a useful addition — the storage cut is a
*second* filter stacked on top of privacy filtering. Consequence stands: a page or query absent
from rows is **unknown, not zero**.

### Per-page vs per-query completeness

`[G]` Deep-dive post (URL above):

> "For requests that don't involve query or URL dimensions, such as countries, devices, and
> Search Appearances, Search Console will display and export all the data."

So: query and URL dimensions are subject to *both* privacy filtering and the daily row limit;
non-query/non-URL dimensions are complete. Page (URL) dimension is not privacy-filtered the way
queries are — anonymized-query traffic still appears in page totals as long as no query filter
is applied — which supports the skill's "prefer page-dimension data" rule. But the page
dimension is still subject to top-rows storage.

### Row limits — the "1000-row API limit" is imprecise

`[G]` Deep-dive post (URL above):

> "The maximum you can export through the Search Console user interface is 1,000 rows of data.
> Currently, the upper limit for the data exported through the Search Analytics API (and
> through the Looker Studio connector) is 50,000 rows per day per site per search type, which
> may not be reached in all cases. The default returned by the API will be 1,000 rows, but you
> can use rowLimit to increase it to 25,000 and startRow to pull the rows 25,001 to 50,000
> using pagination."

`[G]` Search Analytics API reference
<https://developers.google.com/webmaster-tools/v1/searchanalytics/query> (fetched 2026-08-20):
`rowLimit` — "Optional; Valid range is 1–25,000; Default is 1,000"; `startRow` — "Optional;
Default is 0 … Zero-based index of the first row in the response." Also:

> "If 'all' (case-insensitive), data will include fresh data. If 'final' (case-insensitive) or
> if this parameter is omitted, the returned data will include only finalized data."

> "When date is one of the dimensions, any days without data are omitted from the result list."

**At 48 pages, none of these row limits bind.** The binding limit here is the top-rows
*storage* cut, not export volume.

### Data lag and daily granularity

`[G]` <https://support.google.com/webmasters/answer/96568>:

> "There can be a lag between when the numbers are calculated and when they are visible to site
> owners. Although data gets published in intervals, we continually collect it. Normally,
> however, collected data should be available in 2-3 days."

Supports `FINAL_DATA_LAG_DAYS = 3`. Same page: "The Performance report tracks daily data
according to local time in California" — daily is the granularity floor; a day with no data is
an omitted row in the API (quote above), which is another place absence and zero are
indistinguishable unless handled.

`[G]` API quotas <https://developers.google.com/webmaster-tools/limits>: Search Analytics
1,200 QPM per site/per user; URL Inspection **2,000 QPD and 600 QPM per site** (10M QPD
per project). At 48 pages, a full daily indexation sweep uses 2.4% of the URL-inspection quota.

---

## 2. Statistical floor at low volume

### The "40 organic visits/month" claim: traced, and it is not evidence

The skill states: "The published guidance is that a page at forty organic visits a month cannot
reach significance in a four week test."

`[V]` Traced to Celeste Gonzalez, RooLabs, "How to Design SEO Tests"
<https://ricketyroo.com/blog/how-to-design-seo-tests/>, section "Testing on Tiny Traffic":

> "If a page gets 40 organic visits a month, you won't reach statistical significance from a
> 4-week test."

**No method, no sample size, no citation is given** — it is an experience-based assertion on an
agency blog. Under the skill's own hierarchy this is class 4, not evidence. The *direction* of
the claim is nevertheless correct and can be re-grounded on class-2 statistics (below), which
give a stronger result: honesty fails well above 40 visits/month for realistic effect sizes.

`[V]` For calibration only — SearchPilot, "What is SEO split-testing?"
<https://www.searchpilot.com/resources/blog/what-is-seo-split-testing>: "We generally work with
sites with at least hundreds of pages on the same template and at least 30,000 organic sessions
per month to the group of pages you want to test on" and "We've got some customers that test on
sections of their site that only get a couple of thousand sessions per month, but the changes
in traffic need to be much higher to be able to reach statistical significance." Vendor
content; their analysis method is a proprietary neural network, unpublishable as method. Cited
only to show that even the testing vendors' floor is ~2,000–30,000 sessions/month — two to
three orders of magnitude above this property.

### What count statistics actually say (class 2)

Clicks/impressions in a fixed window are event counts; the standard model is Poisson, and the
comparison of a before-window count with an after-window count is the classic two-sample
Poisson problem. Published methods:

- `[P]` Przyborowski & Wilenski (1940), the exact conditional test ("C-test"): given totals
  n₁+n₂ over equal windows, n₂ ~ Binomial(n₁+n₂, ½) under the null. Modern treatment and power
  tables: Krishnamoorthy & Thomson (2004), "A more powerful test for comparing two Poisson
  means," *J. Statistical Planning and Inference* 119:23–35 —
  <https://userweb.ucs.louisiana.edu/~kxk4695/JSPI-04.pdf> (also
  <https://www.sciencedirect.com/science/article/abs/pii/S0378375802004081>). Their studies
  show the conditional test and E-test remain valid "even for small samples and/or small values
  of Poisson mean" — i.e. exact tests, not normal approximations, are the honest tool below
  roughly λ≈20–30.
- `[P]` Exact (Garwood) Poisson confidence intervals via chi-square quantiles — standard
  reference method for count uncertainty at any λ.

**Computed from these methods** (exact binomial C-test, equal 28d windows, two-sided α=0.05)
`[computed]`:

| Baseline count (28d) | Exact 95% CI on the count | Observed after-count needed for p<0.05 | 80%-power true effect needed |
| --- | --- | --- | --- |
| 10 (one page here) | 4.8 – 18.4 | ≥ 23 (a 2.3× observed jump; 10→22 is p=0.050) | true rate ≈ ×2.7 |
| 120 (12-page pool) | 99.5 – 143.5 | ≥ 155 (+29%; 120→152 is p=0.06) | true rate ≈ ×1.40 |

Reading: at 10 impressions/28d, only a change that roughly **triples** the true rate is
detectable with conventional power — no realistic meta-description or title change does that,
so per-page verdicts at this volume are fabrication, exactly as the skill says, and now for a
citable reason. Pooled to ~120/28d, a true **+40%** cohort effect becomes detectable at 80%
power, and an observed **+29%** clears significance. That is still a large effect, but it is
the difference between "never answerable" and "answerable for big wins."

The skill's own noise-floor rule ("standard error on a count of n is about √n") is the correct
first-order statement of the same mathematics; at n=10 the relative SE is ±32%, at n=120 ±9%.

### Sequential/monitoring alternative

`[P]` Lucas (1985), "Counted Data CUSUM's," *Technometrics* 27(2):129–144 —
<https://www.jstor.org/stable/1268761> — the standard method for detecting a persistent shift
in a low-rate Poisson stream faster than fixed-window comparison; designed explicitly for
counts, including low counts (time-between-events CUSUM for very low rates). A site-level CUSUM
on daily total impressions is the defensible "did the whole site shift" monitor at this volume.
Recent low-count treatment: Heidema et al. (2026), *Biometrical Journal* —
<https://onlinelibrary.wiley.com/doi/10.1002/bimj.70127>.

---

## 3. Pooling/clustering methodology for "12 changes judged as one cohort"

Three published routes, in increasing complexity:

1. **Pool the counts, one exact test.** Sum before-counts and after-counts across the cohort's
   pages and run the single two-sample Poisson comparison above (C-test / E-test,
   Przyborowski–Wilenski 1940; Krishnamoorthy & Thomson 2004, URLs above). Simplest and fully
   defensible when the pages are of the same kind and windows are equal. Weakness: one
   high-traffic page can dominate. Numbers for this route are in the table above.
2. **Sign test across pages.** Score each page +/− by direction of change, test against
   Binomial(N, ½). Standard nonparametric method (any text; critical-value table e.g.
   <https://statisticsfundamentals.com/tables/sign-test-table/>, values derived from exact
   binomial, consistent with the NIST/SEMATECH e-Handbook). `[computed]` **At N=12: 10 of 12
   moving the same direction is required for two-sided p<0.05** (p=0.0386; 9/12 is only
   p=0.146). Power: 56% if the true per-page improvement probability is 0.8; 89% at 0.9. So a
   12-page cohort can only sign-test its way to significance for changes that help nearly
   every page. Immune to domination by one page; throws away magnitude.
3. **Combine per-page p-values.** Fisher's method (χ² on −2Σln p), or better the weighted
   Z-method: `[P]` Whitlock (2005), "Combining probability from independent tests: the weighted
   Z-method is superior to Fisher's approach," *J. Evolutionary Biology* 18:1368–1373 —
   <https://doi.org/10.1111/j.1420-9101.2005.00917.x>. Overkill here: per-page p-values at 10
   counts/page are nearly uninformative, and route 1 uses the same information more directly.

**Recommendation for the codebase:** route 1 as the primary cohort verdict (one exact
conditional binomial test on pooled counts — a few lines of code, no approximation), route 2 as
a cheap robustness check that the pooled result is not one page's doing. Both are class-2
citable.

---

## 4. Google's measurement-timeline wording (current, verified 2026-08-20)

`[G]` SEO Starter Guide
<https://developers.google.com/search/docs/fundamentals/seo-starter-guide>:

> "Some changes might take effect in a few hours, others could take several months."

> "In general, you likely want to wait a few weeks to assess whether your work had beneficial
> effects in Google Search results."

`[G]` Ask Google to recrawl your URLs
<https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl>:

> "Crawling can take anywhere from a few days to a few weeks."

> "Requesting a crawl does not guarantee that inclusion in search results will happen instantly
> or even at all."

> "There's a quota for submitting individual URLs and requesting a recrawl multiple times for
> the same URL won't get it crawled any faster."

All three quotes the skill relies on are current. The 14-day-failure defect stands confirmed:
two weeks is inside Google's stated recrawl range alone, before any ranking effect.

Bonus verifications from the starter guide (same URL), current wording:

> "The length of the content alone doesn't matter for ranking purposes (there's no magical word
> count target, minimum or maximum, though you probably want to have at least one word)."

> "Google Search doesn't use the keywords meta tag."

Heading order: current text says there's no ideal number of headings and that semantic order
matters for accessibility/screen readers, not ranking — same substance as the skill's quote,
phrasing may differ; re-quote from the live page when citing in code.

---

## 5. What survives at any volume: facts, not inferences

Enumerated observables with zero statistical requirement, each backed by a Google doc:

- **Per-URL index status.** `[G]` URL Inspection tool
  <https://support.google.com/webmasters/answer/9012289>: verdicts "URL is on Google" / "URL is
  on Google, but has issues" / "URL is not on Google"; plus discovery ("How Google found the
  URL"), last crawl time, crawl allowed (robots.txt), user-declared vs Google-selected
  canonical ("Google might select the user-declared canonical, but sometimes Google might
  choose another URL"). Caveat to encode: **"'URL is on Google' doesn't actually guarantee that
  your page will appear in Search results."** Indexed = eligible, not shown. API: 2,000
  inspections/day/site (<https://developers.google.com/webmaster-tools/limits>) — a daily full
  sweep of 48 pages is trivially inside quota.
- **Page Indexing (coverage) states.** `[G]`
  <https://support.google.com/webmasters/answer/7440203>: indexed vs not-indexed with reasons —
  "Server error (5xx)", "Redirect error", "URL blocked by robots.txt", "URL marked 'noindex'",
  "Soft 404", "Not found (404)", "Crawled - currently not indexed", "Discovered - currently
  not indexed". Also: "Google doesn't guarantee that all pages everywhere will make it into the
  Google index" — so unindexed is a state to report, not automatically a defect.
- **Sitemap fetch status.** `[G]` <https://support.google.com/webmasters/answer/7451001>:
  per-sitemap status ("Success: The sitemap was fetched and read without any errors" /
  "Couldn't fetch" / "Sitemap had X errors"), number of URLs parsed, last-fetched time.
- **Robots availability.** Crawl-allowed per URL via URL Inspection (above); site robots.txt
  fetch health via the Search Console robots.txt report (the help URL fetched, answer/12818275,
  rendered only the general robots.txt definition — the report-specific wording was **not
  captured verbatim**; re-fetch before quoting it in code).
- **Appearance at all.** Any impression > 0 in the page dimension is a fact (subject only to
  the top-rows caveat in §1: zero rows are unknown, nonzero rows are real).
- **Page experience self-checks.** `[G]`
  <https://developers.google.com/search/docs/appearance/page-experience>: "There is no single
  signal. Our core ranking systems look at a variety of signals that align with overall page
  experience." Core Web Vitals: "Core Web Vitals are used by our ranking systems." Self-assess
  list (good CWV, HTTPS, mobile display, no excessive ads, no intrusive interstitials, main
  content distinguishable). Note for rule copy: any check claiming a "page experience ranking
  boost" as a single signal contradicts the current doc.

---

## Unverified / not found

- **The robots.txt *report* field wording** (answer/12818275): fetch returned only the general
  robots.txt definition page; report-specific quotes not captured. Re-fetch before citing.
- **Any class-1 or class-2 source for a specific visits-per-month significance floor** (the
  "40/month" figure): does not exist as published research; the figure is an agency assertion
  (ricketyroo, above). Use the computed Poisson/C-test table in §2 instead — it is derivable,
  citable, and stricter.
- **The skill's duplicate-content quote** ("it's fine; don't fret about it…") and the exact
  title-link quotes (title-link doc) were **not re-verified this pass** (not in scope of the
  five questions; title-link doc URL: 
  <https://developers.google.com/search/docs/appearance/title-link>).
- **Krishnamoorthy & Thomson's own power tables** were not extracted from the PDF; the power
  figures in §2's table are computed here from the exact conditional test and the standard
  normal-approximation power identity, not transcribed from the paper.
- WebFetch could not render the deep-dive blog post (JS shell); the verbatim quotes in §1 were
  extracted from the raw HTML of
  <https://developers.google.com/search/blog/2022/10/performance-data-deep-dive?hl=en>
  fetched by curl on 2026-08-20.
