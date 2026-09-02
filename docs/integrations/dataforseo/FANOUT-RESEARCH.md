# DataForSEO LLM fan-out research: AOOS knowledge digest

- **Provider:** DataForSEO
- **Primary source:** _Inside 100,000 Prompts: How LLMs Use Fan-Out Queries to Navigate the Web_ (PDF, 38 numbered pages, 39 PDF pages)
- **Digest version:** 1.0.0
- **Retrieval date:** 2026-09-02
- **Source publication date:** not stated in the document. The PDF's own `CreationDate` is `D:20260507124238+03'00'` (2026-05-07) and it is hosted under `/wp-content/uploads/2026/04/`. The companion blog article carries the date 12.05.2026.
- **Data collection date:** **not stated anywhere in the paper.** See §6.2.
- **What this covers:** what DataForSEO means by a fan-out query, every figure the paper reports, what it tells operators to do, what that would imply for AOOS, and what the paper does not support.
- **Status:** knowledge only. Nothing in AOOS reads, implements or depends on any of this. No threshold in this repository is derived from it, and §5.4 explains why none should be.

This is a **vendor research paper, not vendor API documentation.** The
documentation-first rule in `AGENTS.md` covers provider behaviour that
integration code will rely on. Nothing here describes an API contract. Read
`DIGEST.md` for the API. Read this for what DataForSEO claims about LLM
behaviour, and for how much of that claim is actually evidenced.

## 1. Sources reviewed

| Source | URL | Read |
|---|---|---|
| _Inside 100,000 Prompts: How LLMs Use Fan-Out Queries to Navigate the Web_ (PDF) | https://dataforseo.com/wp-content/uploads/2026/04/DataForSEO-LLM-Fan-out-queries-research-2026.pdf | 2026-09-02, in full, 39 pages |
| Blog article "Fan-Out Queries: The Hidden Layer of AI Search You Need to Optimize For" | https://dataforseo.com/blog/fan-out-queries-the-hidden-layer-of-ai-search-you-need-to-optimize-for | 2026-09-02 |
| Blog index (to locate the article) | https://dataforseo.com/blog | 2026-09-02 |
| DataForSEO help centre, "What is AI search volume" (cited by the paper, page 13) | https://dataforseo.com/help-center/what-is-ai-search-volume-in-dataforseo | 2026-09-02 |
| Raw dataset the paper links to (page 5) | https://www.kaggle.com/datasets/a240adc9473180f44ef1b7879abeed92638a6be286e0022c2adc6a8a0d141e2a | link resolves (HTTP 200); **contents not downloaded or checked against the paper** |
| LLM Mentions API product page (the database the sample came from) | https://dataforseo.com/apis/ai-optimization-api/llm-mentions-api | linked from the paper, pages 3 and 5; not read for this digest |
| Labs Search Intent endpoint (the classifier used, page 15) | https://docs.dataforseo.com/v3/dataforseo_labs/google/search_intent/live/ | linked from the paper; not read for this digest |
| AI Keyword Data search volume endpoint (recommended on page 35) | https://docs.dataforseo.com/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live/ | linked from the paper; not read for this digest |

**How the PDF was read.** `WebFetch` refused the file (31,921,189 bytes, over its
10 MB limit). It was downloaded with `curl` and text-extracted with `pypdf`.
Every figure quoted below that comes from a chart rather than from body prose
was additionally verified by rendering the page to an image and reading it,
because plain text extraction reordered several chart labels. One such
reordering was caught and corrected: see §3.2, the 3-query and 4-query buckets.

## 2. What a fan-out query is, in the paper's own words

The paper defines the mechanism on page 6, under the heading "What is
"fan-out" in LLMs?":

> When a user enters a prompt in an LLM-based tool, the model often doesn't
> treat that prompt as a single, fixed request. Instead, it may expand the
> original prompt into multiple related sub-queries – a process known as
> **query fan-out**.

And immediately after its worked example:

> Each sub-query is then used to retrieve search results or other external
> sources so the model can gather broader context, verify facts, or access
> up-to-date information. Finally, those results are synthesized to produce a
> richer response.

The paper's example, verbatim: a prompt "best Italian restaurant in Chicago"
expanded into "Best Italian restaurants in Chicago reviews", "Top Italian
restaurants Chicago price", "Popular Italian restaurants Chicago menu".

The five-stage diagram on page 6 labels the pipeline: **1 User inputs a prompt,
2 Query fan-out, 3 Search and retrieval, 4 Source selection, 5 Synthesis &
answer.**

The paper's four operative definitions, quoted verbatim from page 4:

> **Fan-out** – an event when the system generates additional sub-query(-ies)
> for a prompt.
>
> **A fan-out query** – a single sub-query produced during fan-out.
>
> **Fan-out rate** – the share of prompts that triggered fan-out events.
>
> **Fan-out intensity** – the number of generated sub-queries.

The introduction (page 2) gives a looser gloss:

> the model often generates "fan-out queries" – additional search terms that
> expand the original prompt – and uses them to explore different angles of the
> topic across the web.

The blog article's gloss, which differs slightly in emphasis, describes fan-out
queries as additional search queries generated by the LLM to retrieve search
results or other external sources so the model can provide the user with a
comprehensive response.

Two distinctions the paper draws and then relies on throughout (page 27):

> **Search results** are all web search outputs the model retrieved when
> looking up information;
>
> **Sources** refer to the results the model actually used and cited in its
> final answer.

## 3. Every figure the paper reports

Figures are given exactly as printed. Where a figure is derived rather than
printed, it is labelled **Derived** and the arithmetic is shown.

### 3.1 Dataset and scope (pages 2 and 4)

| Item | Value as printed |
|---|---|
| LLM | ChatGPT |
| Location | United States |
| Language | English |
| Total number of prompts (random selection) | 100,000 |
| Total number of prompts that triggered fan-out | 47,484 |
| Total number of fan-out queries | 100,249 |
| Source of the sample | "randomly selected from DataForSEO's database powering the LLM Mentions API" |

The paper states its own scope limits on page 4:

> First, the dataset focuses only on ChatGPT, and patterns may differ across
> other LLMs. Second, the analysis is limited to English-language prompts and
> responses for the United States, restricting the generalizability of the
> findings to other linguistic or geographic areas. Despite that, this research
> provides one of the largest perspectives on ChatGPT's fan-out behavior
> currently available.

### 3.2 Fan-out rate and intensity (pages 3, 7, 8)

Headline figures from the "Main findings" page (page 3): **47%** of user prompts
trigger fan-out, **~2.1** average number of fan-out queries per prompt, **93%**
of user prompts split into just 2 fan-out queries.

Body text (page 7) states the rate more precisely: **47.5% of user prompts
(47,484)**. The chart on the same page shows **52,516 (52.5%)** prompts without
fan-out.

Fan-out count distribution, among the 47,484 prompts that fanned out:

| Fan-out count | Prompts | Share of the 47,484 |
|---|---|---|
| 1 | 12 | 0.03% |
| 2 | 44,334 | 93.4% |
| 3 | 1,397 | 2.94% |
| 4 | 1,467 | 3.09% |
| 5 | 170 | 0.36% |
| 6 | 85 | 0.18% |
| 7+ | 19 | 0.04% |
| All cases other than 2 | 3,150 | 6.6% |

Note on the 3 and 4 rows: text extraction placed 1,467 against 3 and 1,397
against 4. Rendering page 8 shows the opposite, and the table above follows the
rendered page. The paper's prose does not disambiguate them, saying only that
"deeper expansions into 3–4 queries account for only about 6% of all 47,484
cases".

The paper's other prose claims on this distribution (page 8), verbatim:

> Expansions beyond five are extremely rare (less than 0.6%), and the generation
> of a single additional query is nearly non-existent (only 12 such cases,
> 0.03%).

**Derived:** 170 + 85 + 19 = 274, which is 0.58% of 47,484. That figure includes
the 5-query bucket, so "beyond five" reads as "five and beyond". Buckets 6 and
7+ alone are 104, or 0.22%.

**Derived:** 100,249 / 47,484 = 2.111 fan-out queries per fanned-out prompt,
consistent with the printed "~2.1". Reconstructing the total from the
distribution gives (44,334 × 2) + (12 × 1) + (1,397 × 3) + (1,467 × 4) +
(170 × 5) + (85 × 6) + (19 × at least 7) = at least 100,232, which is consistent
with the printed 100,249 once the 7+ bucket is allowed queries above 7.

The paper's key insight for this section, verbatim:

> Fan-out is not exceptional behavior in ChatGPT; it's a routine research step
> before the model builds answers. But while **nearly half of the prompts
> trigger fan-out, most expansions stop at two sub-queries**, suggesting the
> model usually seeks just enough context to answer confidently.

### 3.3 Length of prompts versus fan-out queries (pages 9 to 12)

Character-length buckets. The fan-out column covers all 100,249 fan-out
queries. The prompt column covers only the 47,484 prompts that triggered at
least one fan-out.

| Length bucket (characters) | Fan-out queries | Share | Prompts |
|---|---|---|---|
| 1 to 30 | 4,305 | 4.29% | 6,734 |
| 31 to 60 | 29,044 | 28.97% | 39,855 |
| 61 to 90 | 51,055 | 50.93% | 886 |
| 91 to 120 | 14,402 | 14.37% | 9 |
| 121 to 150 | 1,279 | 1.28% | 0 |
| 151+ | 164 | 0.16% | 0 |

Prose claims, verbatim (page 9):

> most fan-out queries fall between 31 and 90 characters, representing 79.9% of
> the dataset, with a peak at 61–90 characters (50.9%).
>
> Very short and long fan-out queries are quite rare: only 4.3% are 30
> characters or fewer, and under 1.4% exceed 121 characters.

And page 10:

> While most prompts are between 31 and 60 characters, the majority of fan-out
> queries land in the 61–90 character range.
>
> In other words, ChatGPT seems to enlarge the original user input when
> generating fan-out queries.

**Derived:** the prompt column sums to exactly 47,484, confirming it counts only
fanned-out prompts. 28.97% + 50.93% = 79.90%, matching the printed 79.9%. The
"under 1.4% exceed 121 characters" claim is 1.28% + 0.16% = 1.44% if the two top
buckets are meant, so the printed 1.4% is a slight understatement of its own
table unless "exceed 121" is read as excluding part of the 121 to 150 bucket.

Word-length distribution of fan-out queries. The paper says this chart
represents 99.78% of the data.

| Words | Share | Words | Share |
|---|---|---|---|
| 1 | 0.01% | 13 | 9.97% |
| 2 | 0.10% | 14 | 8.08% |
| 3 | 0.49% | 15 | 6.09% |
| 4 | 1.51% | 16 | 4.21% |
| 5 | 2.91% | 17 | 2.75% |
| 6 | 4.17% | 18 | 1.68% |
| 7 | 5.48% | 19 | 1.05% |
| 8 | 7.10% | 20 | 0.65% |
| 9 | 8.86% | 21 | 0.39% |
| 10 | 10.71% | 22 | 0.23% |
| 11 | 11.64% | 23 | 0.14% |
| 12 | 11.55% | | |

**Derived:** the 9 to 14 range sums to 8.86 + 10.71 + 11.64 + 11.55 + 9.97 +
8.08 = 60.81%, matching the "9–14 words (60.8%)" figure on the Main findings
page. The whole table sums to 99.77%, matching the printed 99.78% within
rounding.

Tail of the word-length distribution, queries of 24 or more words, described as
"the remaining 0.22% of the dataset":

| Words | Count | Words | Count |
|---|---|---|---|
| 24 | 65 | 33 | 2 |
| 25 | 49 | 34 | 1 |
| 26 | 34 | 36 | 1 |
| 27 | 24 | 37 | 1 |
| 28 | 11 | 39 | 2 |
| 29 | 11 | 42 | 1 |
| 30 | 8 | 51 | 1 |
| 31 | 4 | 55 | 1 |
| 32 | 4 | 56 | 1 |

**Derived:** these sum to 221, which is 0.220% of 100,249, matching the printed
0.22%.

The paper's key insight, verbatim (page 12):

> ChatGPT doesn't fan out into broad terms or long conversational prompts.
> Instead, **the model tends to expand shorter user requests into naturally
> phrased search queries of 9 to 14 words**, or 31 to 90 characters. This makes
> the generated fan-out queries both detailed enough and compact enough for web
> search.

The paper's worked example of a typical fan-out query, verbatim: "what are some
good project management tools that small teams can use" (12 words).

### 3.4 AI search volume against fan-out rate (pages 13 and 14)

Method as stated: prompts were bucketed "into 10 deciles from lowest to highest
average search volume", then an average fan-out rate was calculated for each
group. The x-axis of the chart shows median AI search volume per decile at
350, 450, 550, 650, 800, 950, 1100, 1250, 1450 and 1750.

Reported result, verbatim:

> The results show a clear positive relationship between search volume and
> ChatGPT fan-out: as the AI search volume of prompts increases, the fan-out
> rate also rises. This pattern is reflected in the linear trendline across the
> decile averages (**R² = 0.849**).

> Low-volume prompts trigger fan-out about **44%** of the time.
>
> High-volume prompts trigger fan-out about **51–55%** of the time.
>
> This represents roughly an **11-percentage increase** between the lowest and
> highest search-volume groups. While this relationship does not establish
> causation, it indicates that query popularity is an important signal to
> consider when studying fan-out patterns in AI tools like ChatGPT.

Key insight, verbatim:

> About 85% of the variation in fan-out rate across the decile groups is
> explained by the linear relationship with AI search volume.

The metric itself is defined by the paper only as: "This metric is calculated
using our internal algorithm and represents the estimated number of times a
query is searched for within AI search environments." The help-centre page the
paper links to (read 2026-09-02) states that `ai_search_volume` is "the
estimated frequency with which a specific keyword is used in questions that
people may ask AI tools", produced by "our proprietary algorithm that considers
multiple signals, including data on the PAA section of Google search results".
It is a modelled estimate, not a measured count, and it is derived in part from
Google People Also Ask.

### 3.5 Fan-out by prompt intent (pages 15 and 16)

Classifier: "the Search Intent endpoint in DataForSEO Labs API". Four
categories, defined by the paper as: Informational, "seeking knowledge or
explanations"; Commercial, "researching products or services before purchase";
Transactional, "attempting to complete an action or purchase"; Navigational,
"trying to reach a specific site or brand".

Fan-out rate by intent, printed on the chart to two decimal places:

| Intent | Fan-out rate |
|---|---|
| Informational | 46.69% |
| Commercial | 50.33% |
| Transactional | 45.15% |
| Navigational | 53.31% |
| Baseline (whole dataset) | 47% |

The distribution chart on page 15 is titled "Distribution of prompts by search
intent" and is introduced with "The chart below shows the number of prompts
that triggered fan-out classified by intent category". Its four bars are
labelled:

| Intent | Count on the bar | Percentage on the bar |
|---|---|---|
| Informational | 64,482 | 64.48% |
| Commercial | 12,483 | 24.80% |
| Transactional | 4,533 | 10.04% |
| Navigational | 362 | 0.68% |

**These four rows are internally inconsistent and the paper's prose repeats the
error.** The counts sum to 81,860, not 100,000. The percentages do not match
their own counts for three of the four rows: 12,483 is 12.48% of 100,000, not
24.80%. The body text then states that "Commercial (12483) and transactional
(4533) queries together make up roughly one-third of the dataset", but
12,483 + 4,533 = 17,016, which is 17.0% of the dataset, not one third.

**Derived reconstruction.** Reading the percentages as total prompts and the
counts as fanned-out prompts makes every number in the paper reconcile:

- Total prompts by intent: 64,482 informational, 24,800 commercial, 10,040
  transactional, 680 navigational. Sum 100,002, which is 100,000 within
  rounding of the printed percentages.
- Fanned-out prompts by intent: 64,482 × 46.69% = 30,107; 24,800 × 50.33% =
  12,482; 10,040 × 45.15% = 4,533; 680 × 53.31% = 362. These sum to 47,484,
  exactly the paper's fan-out total.
- Under this reading, 24,800 + 10,040 = 34,840, which really is roughly one
  third of the dataset, and the paper's later statement (page 35) that
  commercial is "the second largest intent group (24.8K)" is correct.

So the informational bar shows a total-prompt count while the other three bars
show fanned-out counts, and all four percentages are total-prompt shares. This
reconstruction is arithmetic performed by this digest, not a statement by
DataForSEO. It is recorded because the printed chart cannot be quoted as it
stands without repeating a contradiction.

Prose claims, verbatim (page 16):

> Commercial prompts trigger fan-out slightly more often than informational
> ones (50% vs 47%) [...]
>
> Transactional prompts have the lowest fan-out rate (45%). This is likely
> because, in our classifier, transactional intent can mean completing a
> specific action, and asking ChatGPT to perform a certain task would require a
> direct response, rather than additional search.
>
> Navigational prompts show the highest rate (53%). [...] However, the sample in
> this category is insufficient to support strong conclusions.

Key insight, verbatim: "fan-out behavior does not vary dramatically by intent
types [...] while intent categories help explain the type of information users
are seeking, they do not fully explain the model's decision to perform a web
search."

### 3.6 Wh prompts versus non-Wh prompts (pages 17 and 18)

Split definition as printed: "Wh prompts – prompts starting with common
question words (who, what, when, where, why, how)"; "Non-Wh prompts – all other
prompts that do not contain question words".

| Group | Prompts | Share | Prompts with fan-out | Fan-out rate | Avg. fan-out queries when fan-out occurs |
|---|---|---|---|---|---|
| Wh | 73,737 | 73.74% | 34,878 | 47% | 2.12 |
| Non-Wh | 26,263 | 26.26% | 12,606 | 48% | 2.08 |

**Derived:** 34,878 + 12,606 = 47,484, matching the fan-out total. 34,878 /
73,737 = 47.30% and 12,606 / 26,263 = 48.00%, consistent with the printed rates.

Conclusion, verbatim: "Although Wh-questions dominate the dataset, they do not
trigger fan-out more often than other prompt types, and they do not appear to
influence the number of sub-queries ChatGPT generates."

### 3.7 Fan-out by question word (pages 19 to 21)

| Prompt type | Prompts | Fan-out rate | Avg fan-out query count per prompt (including prompts with no fan-out) |
|---|---|---|---|
| what | 50,152 | 44% | 0.94 |
| non-wh | 26,263 | 48% | 1 |
| how | 9,997 | 51% | 1.06 |
| why | 5,463 | 50% | 1.03 |
| who | 3,831 | 60% | 1.29 |
| which | 2,559 | 56% | 1.17 |
| where | 1,427 | 67% | 1.62 |
| when | 304 | excluded | excluded |
| whose | 4 | excluded | excluded |

**Derived:** the nine prompt counts sum to exactly 100,000. The average
fan-out counts, weighted by prompt count, sum to about 99,878 fan-out queries
across the seven reported groups, which is consistent with the 100,249 total
once "when" and "whose" are added back.

The paper's stated reason for excluding two groups, verbatim: "'when' appears
only 304 times, and 'whose' appears just four times. Such small groups can lead
to unstable or noisy rates, so we excluded them from further interpretation."

Key insight, verbatim:

> prompts starting with "where," "who," and "which" are significantly more
> likely to trigger fan-out in ChatGPT, suggesting that prompts focused on
> entities, locations, or comparisons may require broader information
> retrieval.

The word "significantly" appears with no statistical test anywhere in the paper.

### 3.8 Prompt words that amplify fan-out intensity (pages 22 and 23)

| # | Word | Used count | Fan-out count | Average fan-out intensity when the word is present | Fan-out intensity increase |
|---|---|---|---|---|---|
| 1 | dish | 130 | 364 | 2.8 | 33% |
| 2 | menu | 158 | 419 | 2.65 | 26% |
| 3 | kind | 174 | 452 | 2.6 | 23% |
| 4 | today | 309 | 761 | 2.46 | 17% |
| 5 | pizza | 176 | 428 | 2.43 | 15% |
| 6 | where | 978 | 2,365 | 2.42 | 15% |
| 7 | restaurant | 343 | 824 | 2.4 | 14% |
| 8 | food | 460 | 1,092 | 2.37 | 12% |
| 9 | at | 1,722 | 4,045 | 2.35 | 11% |
| 10 | hotel | 204 | 480 | 2.35 | 11% |
| 11 | eat | 262 | 614 | 2.34 | 11% |
| 12 | popular | 661 | 1,543 | 2.33 | 10% |
| 13 | known | 186 | 426 | 2.29 | 9% |
| 14 | game | 356 | 812 | 2.28 | 8% |
| 15 | place | 278 | 629 | 2.26 | 7% |
| 16 | city | 228 | 515 | 2.26 | 7% |
| 17 | largest | 257 | 579 | 2.25 | 7% |
| 18 | watch | 174 | 392 | 2.25 | 7% |
| 19 | church | 163 | 367 | 2.25 | 7% |
| 20 | code | 256 | 572 | 2.23 | 6% |

**Derived:** every row's "average fan-out intensity" equals its fan-out count
divided by its used count, to the printed precision. All twenty check out.

**The paper's own explanation of its last column is wrong.** Page 22 states,
verbatim:

> The last column reports the uplift results as a percentage. So if a word shows
> 33%, it means, on average, prompts that include that word trigger 33% more
> fan-out queries than the baseline (1 fan-out query).

If the baseline were 1 fan-out query, an average of 2.8 would be an increase of
180%, not 33%. **Derived:** the baseline that actually reproduces the column is
2.11, the average fan-out intensity across all fanned-out prompts. 2.8 / 2.11 =
1.33; 2.65 / 2.11 = 1.26; 2.23 / 2.11 = 1.06. Every row matches on that
baseline. The parenthetical "(1 fan-out query)" is an error, and page 34 repeats
it.

**Derived:** the "Used count" column is not defined by the paper. For "where"
it reads 978, while §3.7 records 1,427 prompts starting with "where" and a 67%
fan-out rate, which gives about 956 fanned-out "where"-initial prompts. The
column is therefore consistent with being a count of **fanned-out prompts
containing the word**, not of all prompts containing it. The paper does not say
so.

Key insight, verbatim:

> Fan-out is not evenly distributed across prompts. The ones requiring **local
> information, travel and food recommendations, or comparisons, are associated
> with 10–33% more fan-out queries**. These types of prompts encourage ChatGPT
> to broaden its retrieval before generating an answer.

The paper adds an explicit anti-gaming caveat, verbatim (page 22): "Importantly,
this result doesn't mean that simply adding a word like "where" to any prompt
will make the model generate more sub-queries. Instead, prompts with these words
represent the types of requests for which ChatGPT needs to gather more context
from the web."

### 3.9 Words ChatGPT adds when it rewrites (pages 24 to 26)

Method as stated: "we analyzed words that appear in the sub-queries generated by
ChatGPT but were not present in the original prompt". Shares are of all 100,249
fan-out queries.

| # | Word | Times added | Share | # | Word | Times added | Share |
|---|---|---|---|---|---|---|---|
| 1 | and | 8,549 | 8.53% | 16 | best | 2,727 | 2.72% |
| 2 | or | 7,833 | 7.81% | 17 | meaning | 2,628 | 2.62% |
| 3 | to | 6,209 | 6.19% | 18 | 2026 | 2,447 | 2.44% |
| 4 | what | 5,604 | 5.59% | 19 | list | 2,178 | 2.17% |
| 5 | in | 5,119 | 5.11% | 20 | top | 2,143 | 2.14% |
| 6 | of | 4,640 | 4.63% | 21 | history | 2,134 | 2.13% |
| 7 | for | 4,296 | 4.29% | 22 | is | 2,085 | 2.08% |
| 8 | vs | 3,974 | 3.96% | 23 | typical | 1,731 | 1.73% |
| 9 | which | 3,834 | 3.82% | 24 | reviews | 1,657 | 1.65% |
| 10 | us | 3,223 | 3.21% | 25 | news | 1,611 | 1.61% |
| 11 | it | 3,221 | 3.21% | 26 | does | 1,543 | 1.54% |
| 12 | cost | 3,138 | 3.13% | 27 | most | 1,529 | 1.53% |
| 13 | how | 2,953 | 2.95% | 28 | popular | 1,339 | 1.34% |
| 14 | are | 2,862 | 2.85% | 29 | restaurant | 1,338 | 1.33% |
| 15 | price | 2,819 | 2.81% | | | | |

The paper groups these into four patterns, verbatim: fan-out queries are "often
connective and combinatorial"; "another common pattern is the use of
comparisons"; "the model also tends to clarify the information request"; "in
many cases, ChatGPT also adds evaluation or discovery modifiers", "along with
commercial signals like "cost" and "price."" It also notes geographic and time
context: "US" (3.21%) and "2026" (2.44%).

Key insight, verbatim:

> The words ChatGPT adds most frequently during fan-out show that it's not
> simply paraphrasing the original request. Instead, it expands user prompts
> into better-specified search queries. Most commonly, the model introduces
> comparison structures, clarification terms, evaluation modifiers, and
> contextual constraints.

### 3.10 Word overlap between fan-out queries, results and sources (pages 27 and 28)

Method, verbatim:

> we first split each comparison pair (for example, fan-out query vs prompt)
> into individual words. Then, we calculated how many words from the fan-out
> query also appear in the comparison element.
>
> For instance, if a fan-out query contained 10 words and 5 of those words also
> appeared in the prompt, the word overlap score would be 50%.
>
> We applied this calculation to obtain a score for each fan-out query against
> each comparison element, and then computed the mean score across the dataset.
> Importantly, we ran case-insensitive analysis and normalized all words to
> lowercase beforehand.

| Comparison element | Mean word overlap |
|---|---|
| Prompt | 54% |
| Search result title | 53% |
| Search result description | 59% |
| Source title | **47% on the chart, 44% in the prose** |
| Source description | 8% |

**The source-title figure is contradictory within the paper.** The chart on page
28 is labelled 47%. The body text on the same page states "The average overlap
with source titles is 44%", and the Main findings page (page 3) also states
"44% for source titles". Two of the three statements say 44% and the chart says
47%. This digest records both and treats neither as settled.

Key insight, verbatim:

> **Fan-out queries** in ChatGPT act mainly as an information retrieval bridge.
> They **stay close to the original user prompts**, but are **also phrased in a
> way that helps the model discover the most relevant results** during web
> search. At the same time, **lower word overlap with the final sources** shows
> that ChatGPT chooses references based on content usefulness rather than exact
> wording match with the results' titles and descriptions.

### 3.11 Domains retrieved versus domains cited (pages 29 to 31)

Top 20 by appearances. The left column counts appearances in retrieved search
results; the right counts appearances as cited sources.

| # | Domain (search results) | Appearances | # | Domain (sources) | Appearances |
|---|---|---|---|---|---|
| 1 | yahoo.com | 13,903 | 1 | wikipedia.org | 17,073 |
| 2 | fandom.com | 6,897 | 2 | reddit.com | 7,972 |
| 3 | alibaba.com | 6,751 | 3 | alibaba.com | 2,771 |
| 4 | forbes.com | 4,633 | 4 | forbes.com | 1,559 |
| 5 | aol.com | 2,744 | 5 | yahoo.com | 1,339 |
| 6 | accio.com | 2,511 | 6 | fandom.com | 1,293 |
| 7 | cbsnews.com | 2,472 | 7 | healthline.com | 1,014 |
| 8 | nih.gov | 2,386 | 8 | legalclarity.org | 962 |
| 9 | facebook.com | 2,132 | 9 | britannica.com | 800 |
| 10 | pinterest.com | 2,106 | 10 | accio.com | 770 |
| 11 | indiatimes.com | 2,055 | 11 | biologyinsights.com | 618 |
| 12 | theguardian.com | 1,965 | 12 | enviroliteracy.org | 610 |
| 13 | espn.com | 1,907 | 13 | indeed.com | 589 |
| 14 | prnewswire.com | 1,870 | 14 | nih.gov | 552 |
| 15 | indeed.com | 1,748 | 15 | aol.com | 549 |
| 16 | apple.com | 1,671 | 16 | indiatimes.com | 549 |
| 17 | washingtonpost.com | 1,506 | 17 | people.com | 501 |
| 18 | si.com | 1,495 | 18 | flavor365.com | 485 |
| 19 | imdb.com | 1,487 | 19 | reuters.com | 438 |
| 20 | wordpress.com | 1,401 | 20 | clevelandclinic.org | 434 |

Rank gap table, page 30:

| Domain | Rank in search results | Rank in sources | Gap |
|---|---|---|---|
| wikipedia.org | #106 | #1 | up 105 |
| reddit.com | #39 | #2 | up 37 |
| alibaba.com | #3 | #3 | = |
| forbes.com | #4 | #4 | = |
| yahoo.com | #1 | #5 | down 4 |
| fandom.com | #2 | #6 | down 4 |
| healthline.com | #35 | #7 | up 28 |
| legalclarity.org | #24 | #8 | up 16 |
| britannica.com | #33 | #9 | up 24 |
| accio.com | #6 | #10 | down 4 |
| biologyinsights.com | #30 | #11 | up 19 |
| enviroliteracy.org | #37 | #12 | up 25 |
| indeed.com | #15 | #13 | up 2 |
| nih.gov | #8 | #14 | down 6 |
| aol.com | #5 | #15 | down 10 |
| indiatimes.com | #11 | #16 | down 5 |
| people.com | #137 | #17 | up 120 |
| flavor365.com | #32 | #18 | up 14 |
| reuters.com | #197 | #19 | up 178 |
| clevelandclinic.org | #66 | #20 | up 46 |

Key insight, verbatim:

> The top-cited domains in ChatGPT responses include wikipedia.org, reddit.com,
> alibaba.com, forbes.com, and yahoo.com. Domains like yahoo.com and fandom.com
> are heavily present in ChatGPT's retrieved results, but don't dominate as
> sources, while only a few, like alibaba.com and forbes.com, are consistently
> strong in both lists. This points to a **two-step model of AI visibility:
> being retrieved creates the opportunity to be cited, but does not ensure it.**

See §6.7 for why this table does not support that conclusion as cleanly as the
paper claims.

### 3.12 DataForSEO scale figures the paper cites about itself (page 5)

Stated as "what was processed in 2025 alone": 30PB data processed, 6PB delivered
via API, 530B pages crawled, 4.5T backlinks indexed, 3.5B SERPs collected, 75B
keywords collected, 117M LLM prompts collected. The paper also states DataForSEO
is "Trusted by over 10,000 customers globally". None of these figures is
independently verifiable from the paper and none bears on the findings.

## 4. What the paper says an operator should do, in its own words

All of the following is quoted from the "Key Implications for GEO & SEO" section
(pages 32 to 36) and the conclusion (page 37).

**On fan-out queries as the starting point.**

> nearly every second prompt (47% of 100K) triggers fan-out in ChatGPT, but the
> model typically generates only 2 sub-queries (for 93% of fan-out cases). This
> creates a narrow but critical window for AI discovery. If your content is not
> discoverable through the specific intermediate-level searches, it may never
> enter the model's citation pool.
>
> So, optimization strategies should prioritize identifying and incorporating
> relevant fan-out queries.

**On titles and descriptions.**

> For SEO and GEO, that means metadata like titles, headings, and descriptions
> still matter and should align with expanded variants generated by LLMs.

**On the dimensions the model adds.** The paper lists comparative framing (and,
or, vs), evaluation modifiers (best, top, reviews), new entities or
relationships (and, to, in, of), clarifying question words (what, which, how)
and contextual qualifiers such as time markers or location, then concludes:

> Accordingly, to perform better in AI retrieval, content should incorporate the
> dimensions listed above.

**On long-tail relevance.**

> ChatGPT's fan-out queries are commonly longer and more specific (9 to 14
> words, 31 to 90 characters) than the user input (31 to 60 characters).
>
> This means that pages targeting only the head term may fail to enter the
> model's retrieval pool.

**On high-demand topics.**

> First, high-demand topics may bring more retrieval opportunities as the model
> is more likely to collect and compare multiple sources. Second, visibility in
> high-volume categories will require being robust enough to stand out among the
> competition and win both retrieval and citation.
>
> This data will help you make informed decisions, such as targeting
> lower-competition queries or pursuing high-volume topics when you can compete.

**On food, travel and local discovery.**

> So, for businesses in hospitality and local commerce sectors, visibility
> requires fully covering the attributes LLMs need to compare options, such as
> menus, prices, reviews, location details, and availability.
>
> This way, you're addressing what users commonly search for in AI tools and
> aiming at a wider discovery window.

**On pairing definitional content with choice content.**

> From a practical standpoint, this means effective GEO requires pairing strong
> "what" content that clearly defines and explains a topic with layers that help
> users make a choice. To maximize visibility potential, focus on structured
> comparisons, context- and location-specific details, and explicit naming (to
> improve alignment with entity-focused retrieval).

**On citation as distinct from retrieval.**

> While brands do not need to replicate the format of encyclopedic or
> forum-based platforms, adopting the way they structure content and present
> information may increase the likelihood of citation.
>
> Off-page strategies also matter. Being present on trusted third-party
> platforms such as G2, Capterra, and Reddit can increase the chances of earning
> a mention and strengthen brand reputation.

**Conclusion.**

> To succeed in AI environments, optimization strategies should anticipate the
> model's fan-out queries, focus on trust signals, and prioritize helpful
> comparison content.
>
> For SEO teams, this opens a new strategic lens: keyword research should expand
> beyond direct user queries and include the fan-out searches AI systems may
> generate on users' behalf.

Two of these recommendations point at DataForSEO products by name: the AI Search
Volume endpoint for demand research, and the LLM Mentions API as the source of
the study data.

## 5. What this would change in AOOS

AOOS today files SEO findings from four kinds of stored row: Google Search
Console (queries, pages, impressions, clicks, position, URL inspection), GA4
(visits by landing page), DataForSEO (SERP positions for tracked keywords, Labs
keyword data, Backlinks, OnPage crawl, Content Analysis brand mentions), and its
own page audit and nightly live-site watch. Every rule fires on rows from those
four. Confirmed 2026-09-02: nothing in `src/` reads any LLM Mentions or AI
Optimization endpoint, and `docs/integrations/CATALOG.md` records no such
connector. The only LLM traffic in the codebase is AOOS's own model calls
through LiteLLM, which measure nothing about the website.

The backlog already names this gap twice, and this digest does not create a new
one: **IDEA-3 ("AI answer visibility")** and **IDEA-24 ("Ask every model")** in
`docs/context/BACKLOG.md` §G both describe reading whether the brand is named
and which sources are cited. What follows is what the paper adds to those items,
stated as measurements rather than as intentions.

### 5.1 Measurements that do not exist and would have to

1. **No prompt is stored anywhere.** AOOS's entire query universe is Search
   Console queries plus operator-approved keywords. Both are typed searches. The
   paper's unit of analysis, the prompt, has no row, no table and no schema in
   this repository.
2. **No fan-out query is captured.** Even given a prompt, AOOS has no record of
   the sub-queries an assistant generated from it. The paper's whole argument is
   that this intermediate layer is where discovery happens. AOOS cannot see it.
3. **No retrieval record.** AOOS never observes the result set an assistant
   retrieved. This is the specific reason it cannot distinguish the two states
   the paper insists are different: "not retrieved at all" and "retrieved and
   not cited". Those two states call for opposite remedies, and today AOOS
   would render both as silence.
4. **No citation record.** Nothing counts whether the site appears as a cited
   source in an answer, on any model, ever. There is no `llm_citation` row, no
   count, no date, and therefore no baseline and no trend.
5. **Nothing parses an AI answer out of the SERP rows AOOS already stores.**
   `src/lib/dataforseo/serp.server.ts` already posts with `POSTBACK_DATA =
   "advanced"` and reads `/serp/google/organic/task_get/advanced`, and
   `ingestSerpPostback` persists the whole `result[0].items` array into a
   `serp_organic` snapshot. So whatever the advanced organic response carries is
   already on disk. What does not exist is any reader: confirmed 2026-09-02, no
   file in `src/` matches `ai_overview` or any AI answer item type, so no rule,
   screen or finding looks at one. Whether the advanced **organic** endpoint
   returns AI Overview items at all was not re-verified for this digest, and
   would need a `DIGEST.md` entry before code depends on it. The related open
   item is COMP-4, referenced from IDEA-3.
6. **No length or shape profile of the keyword set AOOS targets.** The paper's
   strongest structural claim is that the queries actually issued against the
   web are 9 to 14 words and 61 to 90 characters, while the prompts behind them
   are 31 to 60 characters. AOOS stores approved keywords but computes nothing
   about their length distribution, so it cannot answer "is this tracked set
   entirely head terms?" That question is answerable today from rows already
   held, with no new provider call.
7. **No alignment score between page metadata and any query set.** The page
   audit reads titles and descriptions and checks them structurally. It never
   scores them against the queries the site is trying to be found for. The
   paper's 53% and 59% overlap figures describe exactly that kind of comparison,
   for the retrieval step.
8. **No attribute-coverage check for comparison content.** The paper's local
   and commercial recommendation is concrete: menus, prices, reviews, location
   details, availability. For a licensed moving broker the analogues are route
   coverage, price or quote basis, licence identifiers, reviews and availability.
   AOOS checks licence identifiers already (`broker-licence.ts`, CODE-86). It
   checks none of the others as a presence question.
9. **The prerequisite vocabulary cannot express the absence.** `Prerequisite` in
   `src/lib/rule-buckets.ts` enumerates the non-volume conditions a rule can
   name, and there is no `llm_mention_collection` or `ai_answer_collection`
   member. Under the "no lying controls" and "absence is stated in words" rules
   in `AGENTS.md`, an AI-visibility screen today could not correctly name why it
   is empty, because the vocabulary for that reason does not exist.
10. **No second-collection story.** Every AOOS rule that says something moved
    needs `second_collection`. An AI-citation reading is the same: one reading
    is a fact about one day, not a trend. The metering rule compounds this,
    since an LLM Mentions read is a paid DataForSEO call and would have to sit
    behind an operator click with its cost on the button.

### 5.2 What could be built from rows AOOS already holds

Two of the ten above need no new provider and no new spend, and are therefore
the honest first step:

- **A length and shape profile of the approved keyword set and of stored Search
  Console queries.** Character count and word count per query, as a
  distribution. This is a fact bucket rule in the `rule-buckets.ts` sense: it is
  arithmetic over stored strings, and no traffic volume makes it more or less
  answerable.
- **A comparison-dimension inventory of owned pages.** Whether a page names a
  price basis, a review, a location, an availability statement. The page audit
  already stores per-page observations; this is a new set of presence checks
  over them, not a new collection.

Neither of these measures AI visibility. They measure whether the site is
shaped the way the paper says retrieval favours. That distinction has to be
stated on screen, because an operator who reads a keyword-length finding as an
AI-citation finding has been misled.

### 5.3 What a real AI-visibility reading would need

If IDEA-3 or IDEA-24 is built, the paper says what the reading has to separate,
and this is the digest's main operational contribution:

- The prompt asked.
- The fan-out queries generated from it, if the provider exposes them.
- The domains retrieved.
- The domains cited.
- The date of the reading, and a second reading before any movement is claimed.

Collapsing retrieval and citation into one "mentioned yes or no" column would
throw away the one finding in this paper that is both novel and actionable. A
site that is retrieved and never cited has a content-quality problem. A site
that is never retrieved has a discovery problem. AOOS must be able to say which.

### 5.4 What this paper does not license AOOS to do

This section exists because the "no invented thresholds" rule in `AGENTS.md` is
the rule this kind of research most often gets used to break.

- **47% is not a threshold for any site.** It is a population fan-out rate over
  100,000 US English ChatGPT prompts. No AOOS rule may compare a tenant to it.
- **9 to 14 words and 31 to 90 characters are not content targets.** They
  describe the length of queries ChatGPT generated in that sample. Turning them
  into a rule that fires when a page title or a tracked keyword falls outside
  that range would be inventing a threshold out of a descriptive statistic.
- **The 10% to 33% intensity uplift words are not keywords to insert.** The
  paper itself says so, in the caveat quoted in §3.8. A rule that told an
  operator to add "where" or "dish" to a page would contradict its own source.
- **The 53%, 59% and 44%/47% overlap figures are not a scoring rubric.** They
  are means of an unweighted word-overlap measure over a corpus, computed
  without stated stopword handling, in a sample where the most frequently added
  words are "and", "or", "to", "in" and "of". Building a page-title score with a
  pass mark taken from those numbers would be exactly the failure mode the
  repository exists to prevent.
- **Nothing here justifies a confidence value.** The paper reports no confidence
  intervals, no significance tests and no per-site variance, so it cannot
  support a confidence figure in `confidence.ts` or a bucket assignment in
  `rule-buckets.ts`.

If any rule is written from this digest, it cites the paper by name, page and
retrieval date, or it carries a `Stated assumption:` comment naming what would
settle it. There is no third option.

## 6. What this digest does not establish

### 6.1 Scope, stated by the paper

One model (ChatGPT), one country (United States), one language (English). The
paper says this plainly on page 4 and the limitation is real: nothing here
describes Gemini, Claude, Perplexity, Copilot or Google AI Overviews, and
nothing describes non-US or non-English behaviour. AOOS's operator sells moving
services in the United States in English, which narrows but does not remove the
problem, because AOOS would still be extrapolating from ChatGPT to every other
assistant.

### 6.2 No collection date

**The paper never states when the prompts were collected.** There is no date
range, no month, no season. The only temporal anchors available are the PDF's
creation timestamp (2026-05-07), the upload path (`/2026/04/`) and the fact that
"2026" is the 18th most-added word in fan-out queries at 2.44%. LLM retrieval
behaviour changes with model releases, so a finding with no collection window
cannot be aged, refreshed or compared against a later reading. This is the
single largest methodological omission in the document.

### 6.3 The sample is not a random sample of ChatGPT usage

The paper says the prompts were "randomly selected from DataForSEO's database
powering the LLM Mentions API". That is random selection **from a database**,
not from ChatGPT traffic. What is in that database is whatever DataForSEO and
its customers put there, and the paper never characterises it: no description of
how prompts enter it, no comparison against any external distribution of real
ChatGPT usage, no discussion of customer-driven seeding.

Its own results are evidence of skew. In the retrieval leaderboard, alibaba.com
ranks #3 (6,751 appearances) and accio.com, a B2B sourcing tool, ranks #6
(2,511). Neither is plausible in a representative sample of consumer ChatGPT
prompts, and both are exactly what a database seeded with commercial and
procurement research would produce. The paper does not mention this. Every
percentage in the study inherits whatever that skew is.

### 6.4 Unsupported claim: prompt length does not influence fan-out

The Main findings page asserts, verbatim: "Longer prompts and question prompts
do not influence fan-out." The question-prompt half is supported, by the Wh
versus non-Wh section. **The prompt-length half is supported nowhere in the
document.** The length section (pages 9 to 12) compares prompt length against
fan-out query length, and its prompt column covers only the 47,484 prompts that
already fanned out. No comparison is made between the lengths of prompts that
fanned out and prompts that did not. The claim is stated once and never
evidenced.

### 6.5 The similarity metric is weak and its conclusion overreaches

Word overlap is computed as the share of the fan-out query's words that appear
in the comparison element, case-normalised. The paper states no stopword
removal, no stemming, no weighting and no length control. Its own §3.9 table
shows that the words ChatGPT most often adds are "and", "or", "to", "in", "of",
"for", "it", "are" and "is". A large and unquantified share of the reported 53%
to 59% overlap is therefore function words matching function words.

From that measure the paper concludes that "ChatGPT chooses references based on
content usefulness rather than exact wording match". Content usefulness was
never measured. What was measured is that word overlap is lower against source
pages than against result snippets. Several mechanical explanations are
untested, most obviously that the 8% source-description figure could be driven
by source pages with missing, truncated or non-English meta descriptions. The
paper neither tests nor mentions that possibility.

### 6.6 R² = 0.849 is computed on ten points, not 100,000

The regression is run across "the decile averages", so it has ten observations.
Aggregating 100,000 prompts into ten decile means removes nearly all
within-group variance and inflates R² substantially relative to the same
relationship measured on individual prompts. The paper's own wording is careful
("About 85% of the variation in fan-out rate **across the decile groups**"), but
the surrounding text and the Implications section then treat it as a general
result about topics.

The independent variable compounds this. AI search volume is not observed AI
usage. Per DataForSEO's own help centre (read 2026-09-02) it is a modelled
estimate produced by a proprietary algorithm using signals that include Google
People Also Ask data. The finding is therefore a correlation between one
DataForSEO-produced quantity and another DataForSEO-produced quantity, one of
which is partly derived from Google. The paper body does not disclose that the
metric is PAA-derived; only the linked help page does.

The paper does say once that "this relationship does not establish causation".
Page 34 then advises acting on it ("High-demand topics bring more retrieval
opportunities") and page 35 recommends buying the AI Search Volume endpoint on
the strength of it.

### 6.7 The retrieval-to-citation conclusion is contradicted by its own table

The paper's headline conclusion here is that "being retrieved creates the
opportunity to be cited, but does not ensure it". Its own numbers do not sit
comfortably with that:

- wikipedia.org ranks **#106 in retrieval and #1 in citation**, with 17,073
  citation appearances.
- reuters.com ranks **#197 in retrieval and #19 in citation**.
- people.com ranks **#137 in retrieval and #17 in citation**.
- The single most-cited domain (wikipedia.org, 17,073) has **more citation
  appearances than the most-retrieved domain has retrieval appearances**
  (yahoo.com, 13,903).

If sources are a subset of retrieved results, as the paper's own definitions
say, a domain cannot be cited far more often than its retrieval frequency
supports. Either the retrieval capture is incomplete, or citations can occur
without the domain appearing in the captured retrieval set, or the two
leaderboards are computed over different populations. The paper offers no
explanation and does not acknowledge the tension. This is the one anomaly most
worth resolving before AOOS builds anything on the retrieval-versus-citation
distinction, because that distinction is the paper's most useful idea and this
table is its only evidence for it.

### 6.8 Three arithmetic or labelling errors in the source

Recorded in full in §3 and listed here so they are not missed:

1. **Intent distribution chart, page 15.** Bar counts sum to 81,860 rather than
   100,000 and three of four percentages do not match their own counts. The body
   text repeats the error, calling 17,016 prompts "roughly one-third of the
   dataset". §3.5 shows the reading under which every figure reconciles.
2. **Fan-out intensity baseline, page 22 and repeated on page 34.** The paper
   states the uplift column is measured "than the baseline (1 fan-out query)".
   The column is only reproducible against a baseline of 2.11.
3. **Source-title overlap, page 28.** The chart says 47%; the body text on the
   same page and the Main findings page both say 44%.

None of these changes the paper's direction of travel. All three mean its
figures cannot be quoted without checking them, which is why every table in §3
was recomputed here.

### 6.9 Statistical practice

No confidence intervals, no significance tests, no error bars and no
sensitivity analysis appear anywhere in the 38 pages. The word "significantly"
is used of the where/who/which fan-out rates (page 21) with no test behind it.
Group sizes vary by three orders of magnitude (50,152 "what" prompts against 4
"whose" prompts) and the paper handles this by excluding the two smallest groups
by judgement rather than by a stated rule. The navigational intent group is
flagged by the paper itself as "insufficient to support strong conclusions",
which is the correct call and is the only such caveat in the document.

### 6.10 Recommendations asserted without evidence

Several of the operator recommendations in §4 are not supported by anything
measured in the paper:

- **"Being present on trusted third-party platforms such as G2, Capterra, and
  Reddit."** Reddit is in the data, at #2 in citations. G2 and Capterra appear
  nowhere in either leaderboard, in any table, or in any figure. They are
  asserted.
- **"Adopting the way they structure content and present information may
  increase the likelihood of citation."** The paper measured which domains were
  cited. It did not measure what about them caused the citation, and it did not
  test any structural property of any page.
- **"Content should incorporate the dimensions listed above"** (comparisons,
  evaluation modifiers, entities, question words, contextual qualifiers). The
  paper measured which words ChatGPT adds when rewriting a prompt. It ran no
  test of whether pages containing those dimensions are retrieved or cited more
  often. The inference from "the model adds these words to its queries" to
  "your pages should contain these dimensions" is plausible and entirely
  untested.
- **"Pages targeting only the head term may fail to enter the model's retrieval
  pool."** The paper shows fan-out queries are longer than prompts. It never
  observed a head-term page failing to be retrieved.

### 6.11 Not verified by this digest

The raw dataset the paper links to on Kaggle resolves, but it was not downloaded
and no figure in §3 has been checked against it. Every consistency check above
is internal to the PDF. The LLM Mentions API product page and the three
DataForSEO endpoint documents the paper links to were not read for this digest;
if AOOS ever implements a reading, those need their own entry in `DIGEST.md`
under the documentation-first rule, before code is written.

## 7. Revision history

| Version | Date | Change | Sources |
|---|---|---|---|
| 1.0.0 | 2026-09-02 | Initial digest of the DataForSEO fan-out research paper, read in full. All 39 pages text-extracted and every chart figure verified against a rendered page. Records the paper's definitions verbatim, all reported figures, its operator recommendations, the AOOS measurement gap, and three internal arithmetic contradictions plus one unsupported headline claim found in the source. No AOOS rule, threshold or confidence value is derived from it. | The PDF, the companion blog article, and the AI search volume help-centre page listed in §1 |

Correction protocol: this is a dated reading of a single vendor research paper
with no stated data-collection window. If it is ever used to justify a rule, the
rule cites the paper by page and this retrieval date, and the claim it rests on
is re-checked against §6 first.
