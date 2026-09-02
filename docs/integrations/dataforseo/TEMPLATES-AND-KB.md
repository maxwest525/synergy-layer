# DataForSEO Published Templates and Knowledge Base: AOOS Digest

- **Provider:** DataForSEO (dataforseo.com, docs.dataforseo.com, API v3)
- **Digest version:** 1.0.0
- **Retrieval date:** 2026-09-02
- **Companion to:** [`DIGEST.md`](DIGEST.md) in this folder, which covers transport,
  auth, envelope, the SERP / Labs / Backlinks / OnPage families and their pricing.
  This file does not repeat any of that.
- **Status:** knowledge only. Nothing here is wired. No AOOS capability, rule,
  threshold or schema changes as a result of writing it.

**What this covers.** Every template DataForSEO publishes in its Template Gallery
(64 as of the retrieval date), with platform and calling APIs for each. The full
published method of two of them, the Keyword Cannibalization Detector and the AI
Content Plan Builder, read from the downloadable skill archives rather than from
the marketing pages. The AI Optimization API family (LLM Mentions, LLM Responses,
LLM Scraper, AI Keyword Data): endpoints, what each measures, published prices and
response shape. Help center material on cost control, rate limits, live versus
task endpoints, caching and result retention. One DataForSEO blog article on
building an API-backed SEO tool and keeping its API bill down.

**What this does not cover.** Anything verified against a live call. Every claim
here is read from a published page or a published file, not from a response AOOS
received. No credentials were used and none are recorded. It does not cover the
non-AI parts of the Keywords Data, Business Data, App Data, Merchant or Content
Analysis families beyond what a template happened to name. It does not establish
whether the AI Optimization family is enabled on the AOOS account.

---

## 1. Sources read

All retrieved 2026-09-02.

| Source | URL |
|---|---|
| Template Gallery (index, all 8 pages of results) | https://dataforseo.com/templates/ |
| Template: Keyword Cannibalization Detector | https://dataforseo.com/templates/keyword-cannibalization-detector-with-dataforseo-claude-code/ |
| Template: AI Content Plan Builder | https://dataforseo.com/templates/ai-content-plan-builder-with-dataforseo-claude-code/ |
| Template: Competitor Backlink Analysis | https://dataforseo.com/templates/competitor-backlink-analysis/ |
| Template: A client-ready SEO Visibility Report | https://dataforseo.com/templates/a-client-ready-seo-report-for-any-domain-on-demand/ |
| Template: Whole Client Portfolio SEO Audit | https://dataforseo.com/templates/portfolio-seo-audit-with-dataforseo-claude-code/ |
| Template: Detailed AI Visibility Report | https://dataforseo.com/templates/ai-visibility-report-with-dataforseo-claude-code/ |
| Skill archive: `keyword-cannibalization-detector.zip` (SKILL.md, references/decision-matrix.md, references/endpoints.md, scripts/cannibalization.py) | https://dataforseo.com/templates/wp-content/uploads/dfs-downloads/keyword-cannibalization-detector.zip |
| Skill archive: `content-plan-builder-uHfIRk.zip` (SKILL.md, references/endpoints.md) | https://dataforseo.com/templates/wp-content/uploads/dfs-downloads/content-plan-builder-uHfIRk.zip |
| Skill archive: `ai-visibility-report-bbPahw.zip` (SKILL.md, references/endpoints.md) | https://dataforseo.com/templates/wp-content/uploads/dfs-downloads/ai-visibility-report-bbPahw.zip |
| Help Center index | https://dataforseo.com/help-center |
| AI Optimization API overview (docs) | https://docs.dataforseo.com/v3/ai_optimization/overview/ |
| LLM Mentions API overview (docs) | https://docs.dataforseo.com/v3/ai_optimization/llm_mentions/overview/ |
| LLM Mentions Target Metrics Live (docs) | https://docs.dataforseo.com/v3/ai_optimization/llm_mentions/target_metrics/live/ |
| AI Optimization API product page | https://dataforseo.com/apis/ai-optimization-api |
| Pricing: LLM Mentions | https://dataforseo.com/pricing/ai-optimization/llm-mentions |
| Pricing: LLM Responses | https://dataforseo.com/pricing/ai-optimization/llm-responses |
| Pricing: LLM Scraper | https://dataforseo.com/pricing/ai-optimization/llm-scraper |
| Pricing: AI Keyword Search Volume | https://dataforseo.com/pricing/ai-optimization/ai-keyword-search-volume |
| Help: Rate Limits and Request Limits | https://dataforseo.com/help-center/rate-limits-and-request-limits |
| Help: Live versus Standard method | https://dataforseo.com/help-center/live-vs-standard-method |
| Help: Best practices for live endpoints | https://dataforseo.com/help-center/best-practices-live-endpoints-in-dataforseo-api |
| Help: How to limit duplicate tasks | https://dataforseo.com/help-center/limit-duplicate-tasks |
| Help: Can I set a limit for my payments | https://dataforseo.com/help-center/limit-my-payments |
| Help: How do I know when a task is completed | https://dataforseo.com/help-center/completed-tasks |
| Help: Do I get access to the live index | https://dataforseo.com/help-center/live-index |
| Help: What is AI Search Volume in DataForSEO | https://dataforseo.com/help-center/what-is-ai-search-volume-in-dataforseo |
| Help: How the AI search volume metric works in LLM Mentions | https://dataforseo.com/help-center/how-the-ai-search-volume-metric-works-in-llm-mentions |
| Help: How to get LLM citation data with LLM Mentions API | https://dataforseo.com/help-center/how-to-get-llm-citation-data-with-llm-mentions-api |
| Help: Track Brand Mentions in AI Answers | https://dataforseo.com/help-center/track-brand-mentions-in-ai-answers |
| Help: LLM Mentions versus LLM Mentions Lite | https://dataforseo.com/help-center/what-is-the-difference-between-llm-mentions-and-llm-mentions-lite-endpoints |
| Help: How the price for LLM Responses endpoints is calculated | https://dataforseo.com/help-center/how-the-price-for-using-llm-responses-endpoints-is-calculated |
| Blog: Building a Functioning SEO Tool From Scratch: Architecture, Costs & Lessons Learned (Anatolii, 27.08.2026) | https://dataforseo.com/blog/building-a-functioning-seo-tool-from-scratch-architecture-costs-lessons-learned |

Note on retrieval method for the gallery: the index page renders nine cards and
loads the rest through a WordPress admin-ajax `filter_posts` action. All eight
pages were pulled and the per-template API and tool labels were read from each
template page's own sidebar, not inferred from the card text.

---

## 2. Published templates

### 2.1 Shape of the catalog

The gallery reports **64 templates**. DataForSEO's own category counts, as shown
on the page, are: Other 23, LLM Optimization 3, Rank Tracking 7, Keyword Analysis
16, AI Search Visibility 7, Backlink Auditing 5, Lead Enrichment 15, Reporting and
Alerts 12, Business Listings Data 7, AI Skills 6. Templates carry more than one
category, so these do not sum to 64.

By platform, counted from each template's own "Tools Used" block:

| Platform | Count |
|---|---|
| Make.com | 38 |
| n8n | 20 |
| Claude Code | 6 |

There are no Google Sheets-only, Zapier, Airtable-only or Postman templates.
Google Sheets appears in 31 templates but always as the destination inside a Make
or n8n scenario, never as the automation platform itself. The gallery's filter
control offers a "Google Spreadsheets" tool value and a claude.ai value, but no
published template uses claude.ai as its platform.

By calling API, again from each template's own sidebar:

| DataForSEO API | Templates naming it |
|---|---|
| DataForSEO Labs API | 24 |
| SERP API | 15 |
| Backlinks API | 14 |
| Business Data API | 8 |
| Domain Analytics API | 7 |
| Keywords Data API | 5 |
| App Data API | 3 |
| Content Analysis API | 2 |
| AI Optimization API | 2 |

Only two of 64 published templates call the AI Optimization API, and both are
Claude Code skills.

### 2.2 The six Claude Code skills

These are the only templates that ship as installable skills with source. Each
page carries a download link to a ZIP containing a `SKILL.md`, a `references/`
folder and Python scripts. They are the substantive part of the catalog: the Make
and n8n templates are single-endpoint plumbing.

| Template | APIs named | What it does |
|---|---|---|
| Competitor Backlink Analysis | Labs, Backlinks, SERP | Intersects competitors' backlink profiles, removes sites already linking to you, scores each remaining domain for spam and drops those over a threshold, then ranks survivors by authority, link type and how long the link has existed. Published wording: "Every prospect on it links to all of the competitors you named". |
| Keyword Cannibalization Detector | Keywords Data, SERP, Labs | Detects two or more of one domain's own pages competing for one query. Method in §2.4. |
| AI Content Plan Builder | SERP, Labs, Content Analysis | Expands a seed into a keyword universe, enriches with volume, difficulty and intent, clusters by intent then theme, scores clusters by winnability, sequences a phased roadmap. Method in §2.5. |
| A client-ready SEO Visibility Report | Backlinks, SERP, Labs, Keywords Data, AI Optimization | One-shot client report: live rankings for tracked terms, map results where the business has locations, backlink profile, page health, ranked gap list with an estimated value each. States "Honest blanks. Anything that couldn't be measured says so, rather than being quietly estimated". |
| Whole Client Portfolio SEO Audit | Keywords Data, SERP, Labs | Runs one audit pass across a list of domains, scores each on technical health, visibility and backlink risk, and returns the ten highest-impact fixes across all clients plus one spreadsheet per client. Shows expected data cost before running and waits for approval. |
| Detailed AI Visibility Report | Keywords Data, AI Optimization, Labs | Puts a generated question set to ChatGPT, Gemini, Claude and Perplexity, records who is named and who is cited, compares against competitors, prints the prompt list in the report. Method in §3.7. |

The sidebar of the cannibalization page lists Keywords Data, SERP and Labs, and
its bundled `references/endpoints.md` names the exact endpoints, which include
`on_page/instant_pages`. The sidebar labels are therefore approximate: treat the
skill's own endpoints file as authoritative over the page.

### 2.3 Full inventory

Platform is the automation host. "Also uses" lists the non-DataForSEO services the
template writes to or reads from.

**Claude Code (6)**

| # | Template | APIs |
|---|---|---|
| 1 | Competitor Backlink Analysis | Labs, Backlinks, SERP |
| 2 | Keyword Cannibalization Detector | Keywords Data, SERP, Labs |
| 3 | AI Content Plan Builder | SERP, Labs, Content Analysis |
| 4 | A client-ready SEO Visibility Report | Backlinks, SERP, Labs, Keywords Data, AI Optimization |
| 5 | Whole Client Portfolio SEO Audit | Keywords Data, SERP, Labs |
| 6 | Detailed AI Visibility Report | Keywords Data, AI Optimization, Labs |

**n8n (20)**

| # | Template | Also uses | APIs |
|---|---|---|---|
| 7 | Find low-competition keyword opportunities with DataForSEO | Google Sheets | Labs |
| 8 | Check bulk domain ranks and save results to Google Sheets | Google Sheets | Backlinks (Bulk Ranks) |
| 9 | Pull bulk domain backlink profiles to Google Sheets | Google Sheets | Backlinks (Bulk Pages Summary) |
| 10 | Send Slack alerts for new app reviews from Google Play and App Store | Slack | Business Data |
| 11 | Create Tasks in ClickUp for New App Reviews Automatically | ClickUp | App Data |
| 12 | Collect keyword cluster by URL in Google Sheets | Google Sheets | Labs |
| 13 | Track keyword position dynamics by URL in Google Sheets | Google Sheets | SERP |
| 14 | Log new top-10 Google keywords to Airtable with Slack alerts | Airtable, Slack | Labs |
| 15 | Track new ranked keywords in Google Sheets with Slack alerts | Google Sheets, Slack | Labs |
| 16 | Track new Featured Snippet keyword wins via email | Gmail, Google Sheets | Labs |
| 17 | Track broken backlinks and create recovery tasks in Asana | Asana, Google Sheets | Labs |
| 18 | Pull references from Google AI mode to Google Sheets | Google Sheets | SERP |
| 19 | Monitor toxic backlinks and email weekly Google Sheets reports | Gmail, Google Sheets | Backlinks |
| 20 | Turn new high-volume ranked keywords into Asana tasks | Asana, Google Sheets, Slack | Labs |
| 21 | Get Gmail alerts for dropped top 10 keyword rankings | Gmail, Google Sheets | SERP, Labs |
| 22 | Get new ranked Google AI Overview keywords via email | Gmail, Google Sheets | Labs |
| 23 | Find competitor keyword gaps and log opportunities to Notion | Notion | Labs |
| 24 | Detect toxic backlinks and build a disavow file | Gmail, Google Drive | Backlinks |
| 25 | Extract citation sources from Google AI overview to Google Sheets | Google Sheets | SERP |
| 26 | Pull references from Google AI mode to Google Sheets (second entry) | Google Sheets | SERP |

**Make.com (38)**

| # | Template | Also uses | APIs |
|---|---|---|---|
| 27 | Check Bulk Domain Ranks and Save Results to Google Sheets | Google Sheets | Backlinks (Bulk Ranks) |
| 28 | Pull Bulk Live Backlink Counts into Google Sheets | Google Sheets | Backlinks (Bulk Backlinks) |
| 29 | Check bulk domain spam scores and save results to Google Sheets | Google Sheets | Backlinks (Bulk Spam Score) |
| 30 | Fetch bulk live referring domain data into Google Sheets | Google Sheets | Backlinks (Bulk Referring Domains) |
| 31 | Track New and Lost Referring Domains in Bulk | Google Sheets | Backlinks (Bulk New and Lost Referring Domains) |
| 32 | Track New and Lost Backlinks in Bulk | Google Sheets | Backlinks (Bulk New and Lost Backlinks) |
| 33 | Pull Bulk Domain Backlink Profiles to Google Sheets | Google Sheets | Backlinks (Bulk Pages Summary) |
| 34 | Send Slack alerts for new app reviews from Google Play and App Store | Slack | App Data |
| 35 | Create Tasks in ClickUp for New App Reviews Automatically | ClickUp | App Data |
| 36 | Get Traffic Stats for Pipedrive leads | Pipedrive | Domain Analytics |
| 37 | Track Brand Mentions | Google Docs, Slack | Content Analysis |
| 38 | Scrape references from Google's AI Overview | Google Sheets | SERP |
| 39 | Send a Slack message when keyword rank drops | Google Sheets, Slack | SERP |
| 40 | Scrape references from Google AI Mode | Google Sheets | SERP |
| 41 | Run a Ranked Keyword Gap Analysis Using Notion | Notion | Labs |
| 42 | Pull Google Ads metrics to Google Sheets | Google Sheets | Keywords Data |
| 43 | Log New Ranked Keywords in Top 10 Google Results in Airtable | Airtable, Slack | Labs |
| 44 | Get Traffic Stats for Zoho CRM leads | Zoho CRM | Domain Analytics |
| 45 | Get Ranked Keywords for new Airtable records | Airtable | Labs |
| 46 | Get Traffic Stats for Salesforce leads | Salesforce | Domain Analytics |
| 47 | Get New Ranked Keywords from Google | Google Sheets, Slack | Labs |
| 48 | Get New High-Volume Ranked Keywords on Google | Asana, Google Sheets, Slack | Labs |
| 49 | Get Traffic Stats for Monday CRM leads | Monday CRM | Domain Analytics |
| 50 | Get New Ranked Keywords in Google AIO | Gmail, Google Sheets | Labs |
| 51 | Get Traffic Stats for Hubspot leads | HubSpot | Domain Analytics |
| 52 | Get New Ranked Keywords in Featured Snippet | Gmail, Google Sheets | Labs |
| 53 | Get Traffic Stats for GoHighLevel leads | GoHighLevel | Domain Analytics |
| 54 | Get Traffic Stats for ActiveCampaign leads | ActiveCampaign | Domain Analytics |
| 55 | Get Google SERP position for new Airtable records | Airtable | SERP |
| 56 | Get Keyword's Top-10 Rank Drop Alert via Gmail | Gmail, Google Sheets | SERP, Labs |
| 57 | Get Business Data for Zoho CRM leads | Zoho CRM | Business Data |
| 58 | Get Business Data for Salesforce leads | Salesforce | Business Data |
| 59 | Get Business Data for Pipedrive leads | Pipedrive | Business Data |
| 60 | Get Business Data for Monday CRM leads | Monday CRM | Business Data |
| 61 | Get Business Data for Hubspot leads | HubSpot | Business Data |
| 62 | Get Business Data for GoHighLevel leads | GoHighLevel | Business Data |
| 63 | Get Business Data for ActiveCampaign leads | ActiveCampaign | Business Data |
| 64 | Add backlinks to Google Sheets | Google Sheets | Backlinks |

Two inconsistencies in DataForSEO's own labelling, recorded so a future reader does
not treat them as findings: entry 10 (n8n app reviews to Slack) is tagged Business
Data API while its Make twin (entry 34) is tagged App Data API for the same job;
and entries 18 and 26 are separate gallery items with near-identical titles,
descriptions and endpoint.

### 2.4 Keyword Cannibalization Detector: the method

The template page describes the method only in outline. The downloadable archive
contains the real thing: a deterministic Python engine (`scripts/cannibalization.py`),
a written rationale (`references/decision-matrix.md`), a unit-test file that locks
the behaviour, and an `evals/evals.json`. What follows is read from those files.

**The definition they use.** From `decision-matrix.md`:

> Cannibalization is **the domain fielding more than one of its own pages for one query.**

And the reason a single scrape does not find it, from the engine's module header:

> Modern Google applies host-crowding: usually only ONE URL per domain shows per SERP.
> So "≥2 of my pages in a single snapshot" almost never fires, and a single scrape
> under-detects real cannibalization. The true pattern is: **the domain has more than one
> of its own pages competing for the query, and Google rotates which one it shows across
> searches/dates.**

That is the load-bearing claim. DataForSEO's position is that same-SERP co-listing
is the wrong detector, because Google host-crowds, and that the correct signal is
**rotation of the domain's ranking URL across dated snapshots**.

**Data collection.**

1. Live organic SERP, `depth: 100`, for **every** input keyword. Endpoint
   `/v3/serp/google/organic/live/advanced` (or `/regular`). No database pre-filter
   and no triage: "Ranking status comes only from the live SERP, never from a Labs
   database guess." A keyword where the domain is absent from the live top 100 is
   recorded as not ranking and dropped.
2. Historical SERPs for every keyword that ranks, endpoint
   `/v3/dataforseo_labs/google/historical_serps/live`, with `date_from` / `date_to`
   spanning roughly 6 to 12 months, country-level location. Each dated snapshot is
   parsed for the domain's own URLs. The live observation is merged in with the
   date label `"live"`.
3. Intent, batched: `/v3/dataforseo_labs/google/search_intent/live`. Both the
   `label` and the `probability` are kept.
4. Volume and CPC, batched: `/v3/keywords_data/google_ads/search_volume/live`.
5. Page type only if still ambiguous after the URL map and slug rules, at most one
   `/v3/on_page/instant_pages` call per unresolved URL.

Parsing keeps organic items only. A featured snippet is collapsed onto its organic
twin. People Also Ask, video and related-search blocks are discarded. Position is
read from `rank_group`, not `rank_absolute`, because `rank_absolute` counts
shopping and other blocks above the organic result.

**The union.** All snapshots collapse into `pages = {url: {best_pos, dates, positions, type}}`
plus a record of which URL held the domain's best slot on each date. `primary` is the
page with the lowest position across time, `secondary` the next. `rotation_count` is
the number of distinct URLs that ever held the top domain slot, and
`rotating = rotation_count >= 2`.

**Page-type classification**, in descending order of confidence:

1. A per-domain URL map supplied by the operator, for example `{"/apis/*": "commercial", "/blog/*": "informational"}`.
2. Free SERP-item signals: `price`, `rating` or a shop flag imply commercial; a
   breadcrumb containing shop, products or category implies commercial, blog, news
   or guide implies informational.
3. A slug heuristic against written lists (`COMMERCIAL_SLUGS`, `INFO_SLUGS`), with
   root path `/` treated as commercial.

Unresolved is `ambiguous`, and only then is an `instant_pages` call spent.

**The verdict, verbatim from `decision-matrix.md`.** `band = 30` for commercial,
`20` for informational; `DEEP_POS = 40`.

```
if n_pages < 2:            verdict = harmless overlap   # only one page → not a conflict
elif best_pos > 40:        verdict = harmless overlap   # never ranks high enough to matter
elif best_pos <= band:     verdict = strong candidate if rotating else investigate
else (band < best_pos ≤40):verdict = investigate if (rotating or COMMERCIAL) else harmless
# informational query whose two competing pages are different types (commercial + info)
# = different needs → soften a strong to investigate
```

Their stated reasoning for each clause: rotation is the severity lever, because
"Two pages that Google actively swaps at a high position are splitting authority
now"; best position gates relevance, because past roughly 40 "there are no clicks
to fight over"; commercial terms get the deeper band because "money queries matter
even a bit deeper"; and a product page plus a blog on a non-commercial query
"serve different needs".

A further override, from the code: `SOFT_INTENT = 0.80`. A commercial page ranking
for a term whose intent-label probability is below 0.80 makes the term commercial
regardless of the label. The stated reason is that DataForSEO's own intent
classifier mislabels money terms, with "seo api" given as the example.

**Pricing the conflict.**

```
value_at_risk = clicks_at_risk × CPC
clicks_at_risk = CTR(best_pos) × volume × (n_pages−1)/n_pages
economic = max-normalized value across THIS list  (0.75 value + 0.25 clicks; clicks-only if no CPC anywhere)
priority_score = round(100 × severity × (0.15 + 0.85 × economic), 1)
severity: strong 1.0 · investigate 0.55 · harmless 0.10
```

The fragmentation term `(n_pages-1)/n_pages` is their model of how much potential
is spread across competing pages. The CTR curve is a hard-coded table in the
engine, positions 1 to 20 (1: 0.281, 2: 0.152, 3: 0.099, 4: 0.070, 5: 0.053,
6: 0.041, 7: 0.033, 8: 0.028, 9: 0.024, 10: 0.021, then 0.019 down to 0.0095 at
position 20), with linear decay formulas below that to a floor of 0.0008.

**Verdict to recommendation.** Their key correction, stated as such, is
"don't default to merge+301":

| Case | Fix |
|---|---|
| harmless overlap | No action. One page holds its position without rotation, or all pages sit too deep. |
| two commercial pages | Consolidate: merge the weaker into the stronger plus a 301. |
| two informational pages | Differentiate the articles, or consolidate into one guide and 301 the weaker. |
| commercial plus informational | Keep both, do not merge. Canonicalize or de-optimize the informational page for this term and point internal links and canonical at the commercial page. |
| ambiguous types | Clarify page roles first, then differentiate or consolidate. |

**Calibration.** `decision-matrix.md` lists ten unit-test cases that lock the
behaviour, including: two product pages rotating at best position 8 is strong;
two pages both buried at best position 55 is harmless; two pages high but with a
stable top page is investigate, not strong; commercial at best 35 while rotating
is investigate; and a mixed product plus blog pair rotating at 10 on an
informational query is investigate rather than strong.

**Evidence status of these numbers.** DataForSEO publishes the thresholds and the
reasoning, but publishes **no external source** for any of them. `DEEP_POS = 40`,
`band = 30 / 20`, `SOFT_INTENT = 0.80`, the severity weights, the 0.75 / 0.25
economic blend and the 0.15 floor are asserted. The CTR table carries the comment
"aggregate desktop organic" and the instruction "tune per market", with no study
cited. For AOOS purposes these are primary-source **vendor practice**, not
primary-source evidence: quoting them is citable as "this is what DataForSEO's
published skill does", never as "this is the correct threshold".

The skill also states, in its scope gate, "API credits are not a constraint" and
"credits aren't a constraint". That is a design assumption AOOS cannot adopt: it
justifies calling a depth-100 live SERP for every keyword with no triage, which is
the most expensive possible shape of this analysis.

### 2.5 AI Content Plan Builder: the method, and how DataForSEO says clustering should be done

Read from `content-plan-builder/SKILL.md`. This is the answer to "how does
DataForSEO say keyword clustering should be done", and the answer is narrower than
expected: **there is no clustering endpoint and no clustering algorithm.** The
clustering step is explicitly marked "skill-side, no API". DataForSEO supplies the
enrichment (volume, difficulty, intent); the grouping is done by the model against
written guardrails.

**Expansion, by seed type.**

- Topic or keyword list: `keyword_ideas` plus `keyword_suggestions` plus `related_keywords`.
- Domain: `keywords_for_site` plus `keyword_ideas` on the domain's top terms.

Universe size is an operator choice presented as 300 standard (recommended), 150
lean, 500 deep, coerced to an integer of at least 50, and is the target count
**after** deduplication.

**Deduplication and cleaning.** Merge everything, normalize (lowercase, trim), drop
duplicates keeping the highest inline volume seen, drop empty, single-character and
wrong-language terms, then trim to the universe size "keeping the highest-volume,
most seed-relevant terms". If nothing survives the skill must stop rather than
build an empty plan. This is the step the marketing page calls "cleaned of terms
that only look related".

**Enrichment**, in chunks of at most 1000 keywords:

- `dataforseo_labs_bulk_keyword_difficulty` for difficulty on a 0 to 100 scale. Always.
- `dataforseo_labs_search_intent` for intent plus probability. Always.
- `kw_data_google_ads_search_volume` **only** to fill keywords still missing a
  volume. The instruction is explicit: "Do not re-pull volume you already have."

**Clustering (Step 7.1), verbatim in structure:**

1. Primary split by intent: informational, commercial, transactional, navigational,
   taken from the intent data.
2. Within each intent, group by theme, described as "the head concept plus its
   modifiers", into "coherent, nameable topics a writer would recognize", with
   "How to make cold brew" and "Best cold brew makers" given as examples, and
   explicitly "not arbitrary keyword buckets".
3. Guardrails: each cluster maps to one pillar or page; a minimum of roughly 3 to 4
   keywords per cluster, with tiny fragments merged into the nearest theme or into a
   single "Long-tail / supporting" cluster; aim for roughly 6 to 15 clusters for a
   typical universe, described as "don't fragment or lump"; name clusters as human
   topics, not keyword strings.
4. Per cluster compute `keyword_count`, `total_volume` (sum), `avg_difficulty`
   (mean), and `winnability = 100 - avg_difficulty`.

Note what is absent. There is no SERP-overlap clustering, no embedding similarity,
no edit distance, no token-overlap threshold. The only quantitative constraints are
the cluster-size and cluster-count guardrails, and those are stated as
approximations ("Minimum ~3-4", "Aim for ~6-15"). The semantic work is judgement,
constrained by a written rule set and by an intent split that comes from an API.

**Prioritization (Step 7.3).**

```
volume_norm = ln(1 + total_volume) / ln(1 + max_total_volume)
priority_score = round(100 × volume_norm × (winnability / 100))
```

The log is there "so one giant cluster doesn't swamp the rest". Tiers use a fixed
vocabulary:

| Tier | Condition |
|---|---|
| Quick win | `avg_difficulty <= 30` AND `total_volume >= median cluster volume` |
| Strategic | `total_volume >= median cluster volume` AND `avg_difficulty > 30` |
| Fill | everything else (low-volume or long-tail or supporting) |

Note the median is computed across the clusters in this run, so the tier boundary
is relative to the plan, not absolute. The only absolute number is the difficulty
cut at 30, which is published without a source.

**Sequencing (Step 7.4).** Two or three phases. Phase 1 is the quick wins plus the
foundational pillar of the largest informational cluster. Phase 2 is the strategic
clusters, "attacked once Phase 1 is ranking and can pass internal authority".
Phase 3 is fill, long-tail and refreshes. A pillar publishes before its supporting
pages. Each cluster expands into a pillar plus two to four supporting article
themes, with roles from a fixed vocabulary (Pillar / Supporting / Cluster page,
exactly one Pillar per cluster), and every article carries a one-line internal
linking note: supporting articles link up to their pillar, the pillar links down to
each, and cross-links to sibling clusters are named specifically.

One instruction is directly relevant to AOOS's no-demo-data rule: for a topic or
keyword seed, where the live site is unknown, existing-page links must be phrased
generically. "Never fabricate a specific existing URL you have not seen."

Another is relevant to cost: the saved data JSON lets the PDF and XLSX be
re-rendered later "without re-querying DataForSEO", so re-cutting a plan costs
nothing.

### 2.6 A second, different DataForSEO cannibalization method

The blog article names a different approach used by SEOInspector, an app built by
a DataForSEO employee. Its Keyword Cannibalization module is powered by:

> DataForSEO Labs API (Page Intersection endpoint) keywords that several pages of the
> same domain rank for within the same SERP, position, search volume, and estimated
> traffic for pages

That is precisely the same-SERP co-listing detector that the Claude skill's engine
argues against, on the grounds that host-crowding makes it under-detect. Both are
DataForSEO-published. They are not reconciled anywhere DataForSEO publishes. The
practical difference for AOOS: `page_intersection` is one Labs call and is cheap;
the skill's method is one live depth-100 SERP per keyword plus historical SERPs per
ranking keyword, and is not.

---

## 3. The AI Optimization API and LLM Mentions

### 3.1 What it is

From the docs overview, the AI Optimization API "provides data for keyword
discovery, conversational optimization, and real-time LLM benchmarking" and
contains four purpose-driven APIs:

- **LLM Responses API** enables "real-time generation of structured responses from
  leading LLMs, including ChatGPT, Claude, Gemini, and Perplexity, based on your
  specified input parameters." This sends your prompt to a model and returns the
  answer.
- **LLM Scraper API** "provides results from scraped ChatGPT searches, based on the
  keyword and other input parameters." The pricing page adds: "To date, only ChatGPT
  and Gemini are supported."
- **AI Keyword Data API** "delivers search volume estimates and user intent insights
  based on keyword usage in AI tools like ChatGPT and other large language models."
- **LLM Mentions API** "provides data on keyword, brand and website mentions in LLMs,
  including metrics like AI search volume, impressions and mentions count."

The critical distinction for AOOS: **LLM Responses probes a model now; LLM Mentions
queries a pre-collected dataset of past answers.** They answer different questions
and cost very differently.

### 3.2 Endpoint inventory

Read from the docs navigation tree.

**LLM Mentions** (`/v3/ai_optimization/llm_mentions/...`), Live only:

| Endpoint | Purpose |
|---|---|
| `filters` | Lists the filterable fields |
| `locations_and_languages` | Valid locale set for the mentions dataset |
| `search_mentions/live` | Individual mention records: the question, the answer, the cited sources |
| `target_metrics/live` | Aggregated metrics for one target set |
| `multi_target_metrics/live` | Same, several entities in one call, grouped for side-by-side comparison |
| `top_mentioned_pages/live` | Pages most cited for the target |
| `top_mentioned_domains/live` | Domains most cited for the target |
| `top_mentioned_brands/live` | Brand entities most mentioned |
| `top_mentioned_brand_categories/live` | Brand entity categories |
| `historical/live` | Historical mentions data |
| `timeseries_delta/live` | Change over time |
| `timeseries_new_lost/live` | New and lost mentions over time |

Plus a **Lite** family (`target_metrics`, `top_mentioned_domains`,
`top_mentioned_pages`, `top_mentioned_brands`, `top_mentioned_brand_categories`).
Per the help center, Lite endpoints "return the same underlying data" as their
standard counterparts, but with a different response structure, and "Choosing
between them affects how much data you get back per request and how much work your
application has to do to parse the response."

**AI Keyword Data**: `locations_and_languages`, `keywords_search_volume/live`.

**LLM Responses**, one set per model family at `/v3/ai_optimization/{llm}/llm_responses/...`
where `{llm}` is `chat_gpt`, `claude`, `gemini` or `perplexity`. Each has `models`
(a free list of available models) and `live`. ChatGPT, Claude and Gemini also have
`task_post` / `tasks_ready` / `task_get`; Perplexity is Live only.

**LLM Scraper**, at `/v3/ai_optimization/{llm}/llm_scraper/...` for `chat_gpt` and
`gemini` only: `locations`, `languages`, `task_post`, `tasks_ready`, `task_get`
(`advanced`, `html`) and `live` (`advanced`, `html`).

Method support, stated in the overview: "AI Keyword Data API and LLM Mentions API
support only the Live method of data retrieval. LLM Responses and LLM Scraper APIs
support both Standard and Live methods, depending on the selected AI platform."

### 3.3 What LLM Mentions actually measures, and where the numbers come from

**The dataset.** The help center describes it as "a database of millions of real AI
responses". Mentions data is captured for two platforms only: `google`, meaning
Google's AI Overview feature in Google SERPs, and `chat_gpt`. Claude, Gemini and
Perplexity have **no mentions dataset**. Anything about those three models has to
come from live probing via LLM Responses.

**Sources versus search results.** This distinction is load-bearing and is stated
explicitly:

> The search_results encompass all web search outputs that the model retrieved when
> looking up information. The sources are the results that the model actually cited
> and used in the response. So, in our case, the citation data includes the results
> from the sources data fields of the API responses.

A citation count therefore means `search_scope: ["sources"]`, not `search_results`.
`search_results` is available for `chat_gpt` only.

**Target definition.** `target` takes up to 10 entities, each either a domain or a
keyword. A domain entity takes `search_filter` (`include` or `exclude`, default
include), `search_scope` (`any`, `sources`, `search_results`, default any) and
`include_subdomains` (default false). A keyword entity takes `search_filter`,
`search_scope` (`any`, `question`, `answer`, `brand_entities`, `fan_out_queries`,
default any) and `match_type`:

> word_match - full-text search for terms that match the specified seed keyword with
> additional words included before, after, or within the key phrase (e.g., search for
> "light" will return results with "light bulb", "light switch");
> partial_match - substring search that finds all instances containing the specified
> sequence of characters, even if it appears inside a longer word (e.g., search for
> "light" will return results with "lighting", "highlight");

Default is `word_match`. A request must include at least one entity with
`search_filter: include`.

**Locale limits.** Default `location_code` is 2840 (United States) and default
`language_code` is `en`. The docs state three times, for location_name,
location_code and language_name respectively: "chat_gpt data is available for
United States only", "chat_gpt data is available for 2840 only" and "chat_gpt data
is available for English only". The `google` platform is available for the wider
locale list returned by `locations_and_languages`.

**AI search volume, and what it is really counting.** This is the metric AOOS would
be tempted to treat as demand, and it is not measured LLM usage. From "What is AI
Search Volume in DataForSEO":

> AI Search Volume (ai_search_volume) is the estimated frequency with which a specific
> keyword is used in questions that people may ask AI tools.

and

> The ai_search_volume metric is calculated based on our proprietary algorithm that
> considers multiple signals, including data on the PAA section of Google search results
> from our extensive SERP index.

The per-platform detail is in "How the AI search volume metric works in LLM
Mentions", and the two platforms compute it differently:

- For `google`: "the ai_search_volume values are derived directly from the Google
  Search Volume", because AI Overview is a Google SERP feature.
- For `chat_gpt`: "to calculate ChatGPT AI search volume, we collect all People Also
  Ask questions that include the target keyword and count them."

So the ChatGPT variant of this metric is a count of Google PAA questions containing
the keyword. It is a proxy derived from Google SERP data, not an observation of
ChatGPT traffic. DataForSEO does not claim otherwise in the mechanics article, but
the product-level wording ("estimated frequency with which a specific keyword is
used in questions that people may ask AI tools") reads as a usage measure and the
underlying evidence does not support that reading. Two further stated quirks: the
algorithm treats grammatical forms of a word as one word, so "tie" and "ties" get
the same value; and for multi-word phrases it counts only questions containing all
the specified words.

### 3.4 Cost

Published prices as of 2026-09-02.

| Product | Mode | Price |
|---|---|---|
| LLM Mentions | Live only | $0.1 per request plus $0.001 per row, where "one row in the results is the object containing data on a single domain or keyword mention with related data" |
| LLM Responses | Live | $0.0006 per task plus the price charged by the LLM |
| LLM Responses | Standard queue | $0.0002 per task plus a $0.01 automatic prepayment |
| LLM Scraper | Standard queue, up to 45 minutes | $0.0012 per results page |
| LLM Scraper | Priority queue, up to 5 minutes | $0.0024 per results page |
| LLM Scraper | Live, up to 90 seconds | $0.004 per results page |
| AI Keyword Data search volume | Live only | $0.01 per task plus $0.0001 per item, worked example $110 per 1M keywords |

**LLM Responses is the one with an open-ended cost.** The help center article is
explicit that the LLM charge covers input and output token processing at the
model's own rate, plus feature charges, and that "you will be charged additionally
for using the web search feature". Web search is enabled with `web_search: true`,
its cost depends on the model, some models have no web search at all, and "in
Perplexity Sonar models, it is always enabled by default". For the Standard queue
the $0.01 prepayment is charged when the task is set, the difference is refunded if
the LLM charges less, and the excess is charged if it charges more. Standard tasks
"may take up to 72 hours to complete"; a task not completed in that window is
marked failed and the $0.01 is refunded. If the account balance is negative the
results are not delivered even when the task succeeded.

Two response fields carry the spend: `money_spent` in the result array is what the
LLM charged, and `cost` in the tasks array is the total, which is the base task
price plus `money_spent`. `input_tokens` and `output_tokens` are also returned.

**A discrepancy worth recording.** The LLM Mentions pricing page states $0.1 per
request and $0.001 per row, but its calculator shows a total of $0.05 against 1
request and 1,000 rows, which reconciles with neither figure. The documentation's
own worked examples are consistent with the unit prices: a `target_metrics` example
returns `"cost": 0.101` and a `top_mentioned_domains` example with `limit: 2`
returns `"cost": 0.102`. A `search_mentions` example in a different help-center
article returns `"cost": 0.001`, which does not fit the same formula. The safe
conclusion is that the published unit prices are approximately right for the
aggregation endpoints, that at least one page is stale or endpoint-specific pricing
differs, and that **AOOS must read the `cost` field returned on every response
rather than compute an expected cost from these tables**. That is already the rule
in `DIGEST.md` §6 and it applies with more force here.

### 3.5 What a caller gets back

**Aggregation endpoints** (`target_metrics`, `multi_target_metrics`,
`top_mentioned_*`) return the standard DataForSEO envelope. Inside `result[0]`,
`total_count`, `offset` and `items_count` are documented as "always equals 0" for
`target_metrics`, and `items` is null: everything is in `aggregated_metrics`.

`aggregated_metrics` contains parallel groupings, each an array of
`{key, mentions, ai_search_volume}`:

| Grouping | Key is |
|---|---|
| `location` | location code |
| `language` | language code |
| `platform` | platform name |
| `sources_domain` | a domain cited as a source in LLM responses |
| `search_results_domain` | a domain appearing in the LLM's web search results. ChatGPT only |
| `brand_entities_title` | a brand entity title. ChatGPT only |
| `brand_entities_category` | a brand entity category. ChatGPT only |

plus `total`, an object with `mentions` and `ai_search_volume` for the whole target.

`mentions` is defined as "the number of times the target keyword or domain were
mentioned in relation to this specific grouping key". `ai_search_volume` is
"aggregated AI search volume for mentions within this grouping".

**`search_mentions`** returns individual records instead. From the help center's
worked example, one item carries: `platform`, `model_name`, `location_code`,
`language_code`, `question` (the user prompt that produced the answer), `answer`
(the model's answer text), `sources` (an array of `{source_name, title, domain, url}`),
`ai_search_volume`, `monthly_searches` (a month-keyed map), `first_response_at`,
`last_response_at`, and `fan_out_queries`. It supports `order_by`, for example
`["ai_search_volume,desc"]`, and `limit`.

That item shape is the useful one for AOOS: it names the actual question, the
actual answer text, and the actual pages the model cited, each with a first-seen
and last-seen timestamp.

### 3.6 The limits that constrain what can honestly be claimed

Collected from the docs, the help center and DataForSEO's own AI Visibility skill.

1. **The mentions dataset covers two platforms.** `google` (AI Overview) and
   `chat_gpt`. Claude, Gemini and Perplexity are not in it. The skill's own
   endpoints file states the consequence plainly: "only chat_gpt has a dataset, so
   the dataset by_model matrix covers ChatGPT only. Do not fabricate
   Gemini/Claude/Perplexity rows."
2. **ChatGPT dataset coverage is United States and English only.** For any other
   market the skill sets its platform to `google` instead.
3. **The dataset is legitimately empty for small brands.** The skill states: "The
   dataset legitimately returns empty for niche B2B brands", and falls back to
   source links captured from live answers.
4. **Live answers are not reproducible.** DataForSEO's own framing: "the same prompt
   run twice rarely returns the same answer" and "Each AI response is generated on
   the fly". Any AOOS finding built on a single probe is a sample of one from a
   non-deterministic process.
5. **The two tracks disagree by construction.** The skill instructs that if the live
   figures and the dataset estimate "differ from this dataset estimate by more than
   ~20 points, keep the live numbers and note the gap", and that the reporting period
   label is never sent to any endpoint because scoping the dataset to a past window
   while live answers are "now" would make the two inconsistent.
6. **Concurrency.** AI Optimization is on the 30-simultaneous-request list. LLM
   Scraper endpoints are the exception, at the general 2,000 per minute.
7. **Turnaround.** LLM Mentions overview says "up to 2 seconds on average", while the
   Target Metrics endpoint page says "Execution time for tasks set with the Live LLM
   Mentions endpoint is currently up to 120 seconds". Design for the 120 second
   figure.

### 3.7 How DataForSEO's own skill turns this into a number

Recorded because it is the only published worked example of an AI-visibility score
from this vendor, and because AOOS would otherwise invent one.

The AI Visibility Report skill splits its work into two tracks. Track A is the
mentions dataset, described as broad and cheap. Track B is live probing through
`ai_optimization_llm_response`, described as "1 request = 1 prompt x 1 model" with
cost and time scaling as prompts times models.

The prompt set is generated by the skill, not fetched. For each keyword it produces
exactly `prompts_per_keyword` prompts from four fixed types: Informational,
Comparative, Recommendation and Branded. Allocation is deterministic: one prompt is
Comparative; two is Comparative plus Recommendation; three adds Informational; four
is one of each; beyond four it cycles the unbranded types. Invariants include at
least one unbranded prompt per keyword and at most one Branded prompt per keyword.
The full prompt list is printed in the report.

Classification per (prompt, model) is string matching on the answer:

> mention = brand name appears in the answer text (case-insensitive, word match).
> citation = brand domain appears in the answer / its cited sources/links.

Scoring, over unbranded prompts only and over successfully measured cells only:

```
D = (unbranded prompts x models) − not_measured cells
mention_share  = unbranded_mentions  / D * 100
citation_share = unbranded_citations / D * 100
ai_visibility_score = 0.6 * mention_share + 0.4 * citation_share
```

Failed cells are retried, and cells that still fail are excluded rather than
counted as "not mentioned". `cells_total`, `cells_measured` and `cells_failed` are
all recorded. Prominence is a four-value fixed vocabulary judged from the answer
text: Named first (sole lead recommendation), Shortlist (one of several named
options), Passing mention, Absent.

Competitor comparison uses a different denominator on purpose. It is share of
voice: each entity's share of all brand-plus-competitor mentions, summing to about
100, and the skill warns that this "is a DIFFERENT metric from the Section 1
response rate, so the brand's row here will not equal its page-1 headline (by
design)". It also warns that the cross-target endpoint "returns raw COUNTS, not
percentages" and that a raw count must never be emitted as a share.

The 0.6 / 0.4 weighting is asserted with no justification anywhere in the skill or
on the site. It is a vendor convention, not an evidenced weighting.

---

## 4. Help centre findings worth acting on

### 4.1 Rate and concurrency limits

- General rate limit is **2,000 requests per minute**, account-wide.
- Endpoint-specific exceptions: Live Google Ads endpoints in Keywords Data API are
  **12 requests per minute**; Live Google Trends is **250 Live tasks per minute
  across all users**, not per account; **User Data 6/min**; API Status 10/min;
  Errors 10/min; **Tasks Ready 20/min**, with callbacks recommended instead.
- **Maximum 30 simultaneous requests** for Content Analysis, DataForSEO Trends,
  DataForSEO Labs, Backlinks, **AI Optimization** and OnPage. The best-practices
  article adds Clickstream and Domain Analytics, and narrows OnPage to Content
  Parsing and Instant Pages. LLM Scraper endpoints are exempt and run at the
  general 2,000 per minute.
- The concurrency cap, not the rate limit, is the real ceiling. Their worked
  example: at a 1 second average response time, 30 threads gives 1,800 requests per
  minute, well under the nominal 2,000.
- Recommended maximum **100 tasks per POST** for `task_post` endpoints. Instant
  Pages, Content Parsing Live and Page Screenshot cannot exceed 20 tasks. For other
  OnPage endpoints, multiple tasks per POST are not recommended at all.
- Live LLM Mentions calls "can contain only one task". Multi-task batching does not
  apply there.

### 4.2 Live versus task endpoints

- "We recommend using standard endpoints whenever they are available."
- Live is for "Interactive dashboards, when users need real-time updates in a
  graphical interface" and "On-demand analytics use cases where high-speed data
  retrieval is crucial". For everything else, Standard "is more efficient and
  scalable. It allows you to collect data asynchronously, which is better suited
  for scheduled data retrieval over time."
- If Live is used for planned collection: "ensure that requests are made at a
  consistent rate. We recommend sending a steady flow of a few hundred requests per
  minute over a longer period. Avoid making 1,500-2,000 requests per minute in
  short bursts."
- Error handling for live endpoints: a single error should be retried with the same
  payload; on dozens or hundreds of errors per minute, "pause the requests for 5-10
  minutes to allow the system to recover", then resume at a consistent rate. The
  named retryable errors are `50000` Internal Error, `50401` Internal Error Timeout,
  and HTTP 500 or 504.
- Set a **120 second timeout** on SERP API calls to avoid premature termination.
- Completion detection for Standard tasks has three routes: poll by task ID; the
  free Tasks Ready endpoint; or `pingback_url` / `postback_url`. Tasks Ready returns
  up to 1,000 tasks completed within the previous three days, and a task stays on
  the list until collected. **Tasks not collected within three days of completion
  drop off the list.** With postback the ID never appears on the list, because the
  results were already delivered.

### 4.3 Cost control

DataForSEO exposes two account-level guards, both in the dashboard rather than the
API:

- **Daily expenses limit**, either across all APIs or scoped to one API or endpoint.
  Breach returns `40203`, and the limit resets on a 24 hour UTC cycle. Their own
  warning: hit the limit at 19:00 UTC and nothing new runs for five hours.
- **Duplicate task limit**: tasks with identical payloads to the same endpoint on
  the same account are duplicates. Off by default. Minimum 1, maximum 100. Breach
  returns `40205`. Caveat published: "If you send no more than 5 duplicate tasks
  simultaneously, some of such tasks might still go through despite the limit you
  set." It is a spend guard, not a correctness guarantee.
- The `tag` parameter on a task is the published way to attribute usage per customer
  or per project.

### 4.4 Caching, freshness and retention

- There is **no provider-side response cache and no conditional-request mechanism**.
  Nothing in the help centre offers an ETag, a `If-Modified-Since`, or a
  "return the previous result free" option. Caching is entirely the caller's job.
- The Backlinks index is a live index: "the data is updated continuously and is
  accessible in real-time", with historical data only via the History endpoint and
  all other endpoints supplying fresh stats.
- Retention figures for task results are in `DIGEST.md` §5 and are unchanged.

### 4.5 The vendor's own cost-control pattern

The blog article documents an app built directly against these APIs by a DataForSEO
employee, and its five stated cost decisions are the most directly transferable
material in the whole knowledge base:

1. "Cache every search and pay for it once. Every search is cached locally, so
   running the same request again does not produce a second charge." Refresh is an
   explicit button. "Browsing stored results costs nothing, whereas spending money
   always requires a deliberate action by the user."
2. Reuse data across modules: a domain already analyzed in the Backlinks module
   feeds the Backlinks Gap analysis rather than triggering a new request.
3. "Set the cost-adding options to off by default." The named example is
   `include_clickstream_data`, which "multiplies the cost of a request by two when
   enabled".
4. "Run locally whatever can run locally." Seven of nineteen modules never call the
   API at all.
5. "Display the account balance on every screen ... so the price of an action is
   visible at the moment the user decides whether to perform it."

His summarized advice adds: "Cache by default and refresh on request. The same
query should never be billed twice, and updating the data should remain an explicit
user action", and "Show the running cost in the interface. A visible balance
influences how users behave".

The article also records the module-to-API mapping used, which is a useful sanity
check on which endpoint answers which question: Keyword Cannibalization is Labs
`page_intersection`; Rank Tracker is "SERP API: live positions for a whole keyword
list, sent as one batched request"; LLM Mentions is "mentions and citations in
ChatGPT and Google's AI Overview, with AI search volume"; Brand Mentions is
Content Analysis, "citations of the brand name across web content, with sentiment
analysis, rating distribution".

Two claims in that article carry no evidence and should not be repeated as fact:
that the On-Page module's 109 checks are correct (testing was "completely manual,
with no automated suites", stated by the author), and the closing marketing line
that this makes the app "a more flexible and convenient alternative to the most
popular SEO Tools".

---

## 5. What this would change in AOOS

Nothing in this section is a decision. Each item is a concrete implication with the
work it would require, so the operator can choose.

### 5.1 Cannibalization: the current rule is not measuring what DataForSEO measures

AOOS today has two rules in this area, and neither is what the vendor's method does.

- `detectKeywordCannibalization` in `src/lib/targeting-rules.ts` reads the site's
  own wording. It groups approved keywords by word set (`groupByPhrase` in
  `src/lib/keyword-phrases.ts`), asks whether each page's title plus H1 contains
  every content word of the phrase (`pageCoversPhrase`), and files a finding when
  two or more pages do. Worth correcting a common description of it: since CODE-93
  it is **word-set matching, not literal substring matching**. The substring
  version was replaced precisely because 40 DataForSEO spelling variants of one
  query produced 40 findings for one gap.
- `detectQueryOverlap` in `src/lib/search-console-rule-checks.ts` reads Search
  Console page-query rows, requires `minImpressionsPerPage: 25` and `minPages: 2`,
  and ignores the query when the best position is at or above
  `ignoreBestPositionAtOrAbove: 5`.

Against DataForSEO's published method, three gaps stand out.

1. **Neither rule can see rotation.** Both look at one moment. DataForSEO's stated
   position is that a single observation systematically under-detects, because
   Google host-crowds to roughly one URL per domain per SERP, and that the real
   signal is Google swapping which of your pages it ranks across dates. AOOS already
   stores dated Search Console snapshots, so the rotation signal is computable from
   data AOOS already holds: for each query, which page held the best position on
   each reporting date, and how many distinct pages ever did. That is a
   `rotation_count` over stored rows, with **no new API call and no new threshold**.
   This is the single highest-value idea in this digest.
2. **`detectKeywordCannibalization` is a wording check, not a competition check.**
   Two pages carrying the same words in their titles is evidence the site created
   an overlap; it is not evidence Google is splitting anything. DataForSEO's engine
   would call that case unverified and would not file it until a ranking observation
   confirmed both pages compete. AOOS's own copy already hedges ("They are competing
   with each other for it"), which overstates what the check saw. If this rule is
   kept, its finding copy should say what it actually observed: two pages claim the
   same phrase in their own wording.
3. **`ignoreBestPositionAtOrAbove: 5` is the opposite polarity to DataForSEO's gate.**
   AOOS suppresses the finding when a page already ranks well. DataForSEO suppresses
   it when no page ranks well enough to matter (`DEEP_POS = 40`) and treats a high
   best position as the reason it is severe. These are defensible in different ways
   and the difference should be a deliberate, documented choice rather than an
   accident. Note that a Search Console average position is not comparable to a
   DataForSEO `rank_group`, so neither number transfers.

What would **not** be legitimate: importing 40, 30, 20, 0.80, the severity weights
or the CTR table into `rule-thresholds.ts`. DataForSEO publishes them without a
source. Under the no-invented-thresholds rule they can be cited only as vendor
practice, and any AOOS use needs its own `Stated assumption:` comment naming what
would settle it.

### 5.2 Keyword grouping: DataForSEO does not have an algorithm to copy

The direct answer to "how should clustering be done" is that DataForSEO's published
method does not cluster with string rules or with an endpoint. It splits by intent
from `search_intent` (an API call), then groups thematically by judgement against
written guardrails, then scores clusters with two formulas over `search_volume` and
`bulk_keyword_difficulty`.

For AOOS this means:

- The hand-written `QUALIFIERS` and `STOP_WORDS` lists in `keyword-phrases.ts` are
  not obviously worse than what the vendor ships. They are a written, arguable rule
  set, which is exactly the shape DataForSEO's own guardrails take. The module
  header already makes this argument and it survives contact with the vendor's
  method.
- The one thing AOOS is missing that DataForSEO treats as mandatory is **intent as
  data**. `dataforseo_labs/google/search_intent/live` returns a label and a
  probability per keyword. That is a real signal AOOS does not have, it is a Labs
  endpoint already inside `cap.dataforseo_labs`, and it is priced in `DIGEST.md` §6
  at $0.012 per task plus $0.00012 per keyword. Splitting AOOS's approved keywords
  by intent before any grouping is the smallest change with the largest effect.
- DataForSEO's own skill warns that this classifier mislabels commercial terms, and
  overrides the label with page type when `probability < 0.80`. If AOOS adopts
  intent, it must adopt that caveat too, and the 0.80 figure is a vendor constant
  needing its own justification here.
- The cluster scoring (`winnability = 100 - avg_difficulty`, log-normalized volume,
  a median-relative tier boundary) is worth recording but requires
  `bulk_keyword_difficulty`, which AOOS does not currently collect.

### 5.3 LLM visibility: AOOS has no measurement and this is what building one costs

Confirmed by inspection: there is no `cap.dataforseo_ai_optimization` capability
(the registered set is `labs`, `serp`, `backlinks`, `onpage`, `content_analysis`,
`domain_analytics`), and no `src/` file references `ai_optimization`, `llm_mentions`
or `ai_search_volume`.

If this is built, the shape is forced by the data, not by preference:

- **A cheap dataset read is possible today for two platforms only.** For a US brand,
  `llm_mentions/target_metrics/live` with `search_scope: ["sources"]` gives a
  citation count for the domain, and `search_mentions/live` gives the actual
  questions, answers and cited sources with first-seen and last-seen timestamps.
  Roughly $0.1 per request plus $0.001 per row, Live only, 30 concurrent max. This
  covers ChatGPT and Google AI Overview.
- **Claude, Gemini and Perplexity cannot be measured this way at all.** They require
  live probing, one call per prompt per model, at $0.0006 plus whatever the model
  charges for tokens and for web search. The bill is therefore not knowable in
  advance from a DataForSEO price table, which collides directly with the AOOS rule
  that a metered call carries its cost on the button. A prompts-times-models
  estimate with a stated upper bound would be needed before any such button could
  render honestly.
- **A single probe is not a measurement.** DataForSEO's own words: "the same prompt
  run twice rarely returns the same answer". Any AOOS finding here has to be built
  on a fixed prompt set repeated on a schedule, with the denominator (cells
  attempted, cells measured, cells failed) stored alongside the numerator. Failed
  cells must be excluded rather than scored as absent, which is what the vendor's
  own skill does.
- **`ai_search_volume` must not be presented to an operator as AI demand.** For
  ChatGPT it is a count of Google People Also Ask questions containing the keyword.
  Naming it "AI search volume" on an operator screen would be the exact failure the
  no-demo-data rule exists to prevent: a number that looks like a measurement of one
  thing and is a proxy for another.
- **Absence is the likely first result.** DataForSEO states the dataset "legitimately
  returns empty for niche B2B brands". A moving company in one metro is a strong
  candidate for an empty dataset. Under the AOOS rule that a failed read renders a
  named absence, the honest first version of this feature says in words that the
  brand does not appear in the collected AI answers for these terms, which is itself
  a finding.
- If a score is wanted, DataForSEO's `0.6 * mention_share + 0.4 * citation_share` is
  the only published convention, and it is unjustified. Reporting the two rates
  separately, as the vendor's own report does on its front page, avoids inventing a
  weighting.

### 5.4 Operational practice worth adopting regardless

- **Read `cost` from every response and store it.** Reinforced here: the vendor's own
  pricing page for LLM Mentions does not reconcile with its own documented examples.
- **A deterministic request fingerprint plus a stored-snapshot check is the only
  cache there is.** No provider-side caching exists. The vendor's own app author
  reached the same conclusion independently and made "the same query should never be
  billed twice" his stated rule.
- **Turn the account-level guards on.** Daily expenses limit (`40203`) and duplicate
  task limit (`40205`) are dashboard settings, free, and directly protect the AOOS
  spend ceiling. `40205` is not currently handled anywhere in the AOOS retry policy,
  and like `40203` it is a budget condition rather than a transient failure, so it
  belongs in the Inbox as `needs_attention` and must never be blind-retried.
- **Use `tag` to carry the AOOS run identifier.** Already noted in `DIGEST.md` §7;
  the help centre confirms it is the vendor's supported route to per-project usage
  attribution.
- **Prefer Standard plus callback over Live for anything scheduled.** Restated by the
  vendor as a direct recommendation, with the burst-avoidance guidance ("a steady
  flow of a few hundred requests per minute", not "1,500-2,000 requests per minute
  in short bursts") that AOOS's scheduler would need to honour.
- **Handle `40602` / `40603`, `50000`, `50401` and the three-day Tasks Ready window.**
  A task completed and not collected within three days is gone from the ready list.

Any of the above that becomes code requires the matching
`docs/execution-handbook/` contract updated in the same change, a
`docs/context/BACKLOG.md` entry with a new ID for whatever is found and not done,
and, for a new capability, registration in `src/lib/rule-buckets.ts` for any rule it
feeds.

---

## 6. What this digest does not establish

1. **Nothing here was verified against a live API call.** No AOOS credential was
   used. Every price, limit, field name and response shape is as published on
   2026-09-02 and may be stale, exactly as the Backlinks pricing claim in
   `DIGEST.md` was stale for a month.
2. **Whether AI Optimization is enabled on the AOOS account is unknown.** The
   overview says the family can be tested free in the DataForSEO Sandbox, which
   implies no separate approval gate, but that is inference. Availability is real
   only when the live API says so.
3. **The LLM Mentions dataset's provenance is not documented.** DataForSEO calls it
   "a database of millions of real AI responses" and does not publish how those
   responses are collected, at what cadence, from what prompt population, or how
   representative it is. Coverage per market, per model version and per topic is
   unknown. A share-of-voice number from this dataset is a share of DataForSEO's
   sample, not a share of what users actually saw, and nothing published lets a
   caller estimate the gap.
4. **The cannibalization and clustering thresholds have no published basis.** Every
   number in §2.4 and §2.5 is asserted by DataForSEO without a source, a study, or a
   validation set beyond ten hand-written unit tests that the same authors wrote. The
   CTR table in particular is labelled "aggregate desktop organic" with the
   instruction "tune per market" and no citation. They are evidence of what
   DataForSEO does, not evidence that it is right.
5. **Two DataForSEO-published cannibalization methods contradict each other** (§2.6)
   and nothing published reconciles them. This digest cannot say which the vendor
   would defend.
6. **The template pages carry no cost information at all.** The cannibalization
   skill states outright that "API credits are not a constraint", so no run cost for
   any of the six Claude Code skills could be read. The n8n and Make templates
   likewise publish no cost.
7. **Only the sidebar labels and the three downloaded archives were read per
   template.** For the 58 Make and n8n templates, the exact endpoints, parameters and
   depth settings inside each scenario file were not downloaded or inspected, so the
   API attributions are DataForSEO's own labels and are known to contain at least one
   error (§2.3).
8. **The Lite endpoint family was not compared field by field** against its standard
   counterpart. The help centre says the underlying data is the same and the response
   structure differs; the size and cost difference was not measured.
9. **No claim here has been reconciled against Google's own documentation.** Where a
   rule derived from this digest would tell an operator how their site is doing, the
   `seo-measurement` discipline applies and a primary Google source is still needed.
10. **AOOS's own current behaviour was read from source, not run.** The descriptions
    in §5.1 come from reading `targeting-rules.ts`, `keyword-phrases.ts` and
    `search-console-rule-checks.ts`. No test was run and no build was performed while
    writing this file.

---

## 7. Revision history

| Version | Date | Change | Sources |
|---|---|---|---|
| 1.0.0 | 2026-09-02 | Initial digest. Template Gallery inventory (64), full published method of the Keyword Cannibalization Detector and AI Content Plan Builder read from their skill archives, AI Optimization / LLM Mentions endpoint and pricing survey, help centre findings on limits and cost control, and the vendor's own build-and-budget blog article. | All sources in §1 |

Correction protocol as in `DIGEST.md`: pricing, access and limit claims here are
dated, and any claim that would gate AOOS behaviour must be re-verified against a
current source before it is allowed to block or authorize a run.
