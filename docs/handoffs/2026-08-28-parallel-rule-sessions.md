# Parallel session prompts: wire the collected evidence nobody reads

Generated 2026-08-28 from a 32-agent design-and-verify pass. 28 finding rules were
proposed against the provider data AOOS already collects; each was then
adversarially checked against Google's primary documentation and this repo's
house rules. **18 survived, 10 were killed.**

The kills are the reason this document is worth trusting. Rules died for reading
snapshot kinds no collector writes (`labs_competitors_domain`), for inventing
thresholds, for rendering absence as a clean reading, and in one case for being
an idea from this project's own doctrine that the evidence did not support. None
of the killed rules appear below.

Every rule below carries its grounding and the corrections the review demanded.
**The corrections are not suggestions.** Several are substantial — "delete the
`returned_row_count` fallback and make the unknown speak" changes what the rule
reports.

## How to run these

Four sessions, in parallel, on **separate branches**. Each owns its own new
files; none touches another's. The one shared file they all needed —
`src/lib/finding-router.ts`, mapping all 18 rule ids to categories — is already
committed, so there is nothing to conflict over.

A smaller model is fine for these: the design work and the grounding are done,
and what is left is careful implementation against a written spec. Give the
session the shared section, then its own section.

## Read these first, every session

1. `AGENTS.md` — the working contract for this repo.
2. `.claude/skills/seo-measurement/SKILL.md` — how a rule earns a number.
3. `docs/execution-handbook/COMPETITIVE_MODEL.md` — who TruMove competes with and what is out of scope.
4. `docs/execution-handbook/EVIDENCE_POLICY.md` and `DETECTION_RULES.md`.

## House rules these sessions exist to honour

- **No invented thresholds.** Every number traces to Google's own documentation, or it is a plain factual count with no threshold at all. If you cannot cite it, do not assert it.
- **Absence is never zero.** A missing reading is "not measured", never "0" and never "clean". If a snapshot does not exist, the rule stays silent and the screen says what is missing, in words.
- **Never assert causation** the evidence cannot carry — especially ranking causation.
- **Never infer ownership or a business classification.** Evidence may *suggest*; only the operator declares. Rules marked DECISION file a candidate for the operator to confirm or reject; they never state the link as fact.
- **Plain words on screen.** No jargon in an operator-facing sentence. Say "pages Google will not list", not "non-indexable URIs".
- **Read stored data defensively.** Provider row shapes in this repo are documentation-derived and unverified against a live crawl (`onpage.test.ts:100` says so explicitly). If a field is absent or the wrong type, drop that evidence line and say so — do not substitute a zero.

## What is already done for you

- **`src/lib/finding-router.ts` already maps all 18 rule ids to their categories.** Do not edit that file; your rule ids are in it. If you need to change a mapping, say so in your PR body instead of editing it, so four parallel sessions do not conflict.
- `health` is a real category that no finding has ever produced. The OnPage session fills it.

## The shape to copy

`src/lib/pagespeed-rule-checks.ts` (pure, no I/O, fully unit-tested) plus `src/lib/pagespeed-rules.server.ts` (reads snapshots, writes `recommendations`). Mirror that split exactly:

- **A pure checks module** — takes already-read rows, returns findings. No Supabase, no fetch. This is where your tests live and they need no mocks.
- **A `.server.ts` writer** — reads the snapshots, calls the pure checks, writes `recommendations` with `metadata.rule` set to the rule id.

Also read `src/lib/search-console-rules.server.ts` for how an existing writer stores findings, and `src/lib/finding-copy.ts` for how a missing field is worded rather than zeroed.

## Definition of done

- Pure checks module + `.server.ts` writer + a registry module in `src/registry/modules/`.
- Unit tests for every rule: one that fires, one that stays silent on absent data, one that handles a malformed provider row without inventing a value.
- `npm run lint` 0 errors, `npm run typecheck` clean, `npm test` all passing, `npm run build` succeeds.
- Commit on a new branch, push, open a **draft** PR.

## Do not

- Do not edit `src/lib/finding-router.ts` (already done, shared).
- Do not edit files another session owns — the file list at the top of your prompt is yours alone.
- Do not implement a rule the review killed. Ten were killed for reading data the collector never stores or inventing thresholds; they are not in your prompt.


---

# Session A — OnPage site-audit findings

**Branch:** `claude/rules-onpage`
**Files you own:** `src/lib/onpage-rule-checks.ts` (new), `src/lib/onpage-rules.server.ts` (new), `src/registry/modules/site-audit.ts` (new)

Eight OnPage snapshot kinds are collected and read by nothing: `onpage_pages`, `onpage_duplicate_title`, `onpage_duplicate_description`, `onpage_redirect_chains`, `onpage_non_indexable`, `onpage_summary`, `onpage_task`, `onpage_duplicate_content`. Nine endpoints are called; the crawl runs; nothing turns any of it into a finding an operator sees.

**Write findings with `source_module: "site-audit"`, NOT `"dataforseo"`.** A test in `connections.registry.test.ts` asserts that exactly one file writes with `source_module: "dataforseo"` (`dataforseo/targeting-rules.server.ts`). Using "dataforseo" will break it. `"site-audit"` already maps to the `health` category in the router.

This is the biggest of the four: 8 rules. If it is too much for one session, do the five non-DECISION rules first and leave the three crawl-meta ones (`crawl_hit_its_page_cap`, `crawl_result_truncated`, `crawl_started_never_collected`) to a follow-up PR.

## Your rules

#### `non_indexable_pages_found` → category `health`

- **Reads:** dataforseo_snapshots where kind = 'onpage_non_indexable': totals.totalCount, falling back to returned_row_count; payload.rows[].url only for the evidence line
- **Condition:** For the newest onpage_non_indexable snapshot for the target: count = totals.totalCount when it is a number, else returned_row_count. Fire when count >= 1. When no such snapshot exists the rule stays silent and the screen names the missing crawl in words; it never reports a count of 0.
- **Says to the operator:** "12 of the pages the site check read are set up so Google will not list them. Some of those are probably meant to be hidden; this is the list, not a verdict on it."
- **Grounding:** Google, robots meta tag doc, already quoted and verified in this repo at page-checks.ts:236 — noindex means "Do not show this page, media, or resource in search results." https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag . The number itself is a plain factual count with no threshold, and the seo-measurement skill's own line applies: indexation is binary, per page, needs no statistics, works at any traffic.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Three changes, all using data the snapshot already holds.

1. Read payload.rows[].reason and stop applying the noindex quote to the whole set. The provider's five reason values split into two groups with different documented consequences: meta_tag and http_header carry the noindex directive the cited doc covers ("Do not show this page, media, or resource in search results", https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag, already quoted at page-checks.ts:236); robots_txt does not, because Google's robots.txt doc says "A page that's disallowed in robots.txt can still be indexed if linked to from other sites" and "it is not a mechanism for keeping a web page out of Google" (https://developers.google.com/search/docs/crawling-indexing/robots/intro). Cite that second URL beside the robots_txt branch. attribute and too_many_redirects belong in neither group and are reported as-is.

2. Rewrite the operator sentence so each group says only what its own source supports. For example: "The site check read 100 pages and found 12 it cannot index. 8 carry a noindex tag, so Google will not list them. 3 are blocked in robots.txt, which stops Google reading them but does not keep the address out of search results. 1 has too many redirects to follow. Some of these are probably meant to be hidden; this is the list, not a verdict on it." Keep the closing caveat, which is the best line in the proposal. Keep firing on the whole set at count >= 1, so no threshold is introduced.

3. Close the null-total branch. Fall back to returned_row_count only when payload.rows is a non-empty array, and when it is, say the number is a floor rather than a total. When totals.totalCount is not a number and rows are empty or absent, the reading is unknown: name it on screen in words ("the site check ran but did not report how many pages it could not index") instead of going silent, which currently reads as zero. This restores the invariant the collector states at onpage.server.ts:100-102.

Housekeeping required by AGENTS.md: register the rule in src/lib/rule-buckets.ts with bucket "fact" (a per-page indexation state needs no volume) and the crawl prerequisite in alsoNeeds, since the rule cannot answer before a crawl has been collected; page_audit is the closest existing Prerequisite value, so either reuse it or add one and update rule-buckets.test.ts. Note in the module comment that MAX_CRAWL_PAGES and RESULT_ROW_LIMIT are both 100 (onpage.server.ts:18, 21), so the count is bounded by the sample the crawl paid for, which is why the sentence must keep the words "the pages the site check read" rather than implying the whole site.

#### `crawl_pages_error_status` → category `health`

- **Reads:** dataforseo_snapshots where kind = 'onpage_pages': payload.rows[].status_code (and rows[].url for the evidence line)
- **Condition:** Over the newest onpage_pages snapshot for the target, count rows whose status_code is a number >= 400. Fire when that count >= 1. A row whose status_code is missing or not a number is skipped, never counted as healthy, and the finding says how many rows it could not read.
- **Says to the operator:** "3 addresses the site check followed answer with an error instead of a page. Google drops addresses that keep answering that way, so anyone linking to them, and Google itself, lands on nothing."
- **Grounding:** Google, HTTP status codes doc, fetched 2026-08-28: "Google doesn't index URLs that return a 4xx status code, and URLs that are already indexed and return a 4xx status code are removed from the index", and for 5xx "already indexed URLs are preserved in the index, but eventually dropped". https://developers.google.com/search/docs/crawling-indexing/http-network-errors . 400 is not a tuned number: it is the RFC 9110 class boundary (4xx Client Error, 5xx Server Error).

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

1. Do not assert Google has acted. DataForSEO's crawler is not Googlebot: a 403 from bot protection or a 429 from the site's rate limiter under a 100-page sweep is an artifact of this crawl, not what Googlebot received. Say what the check received and name what would confirm it: "Three addresses answered the site check with an error instead of a page. Google removes addresses that answer that way from its results, so this is worth confirming against Google's own view of those addresses before treating them as gone."

2. Split 429 and 5xx from the hard 4xx. Google's doc says "All 4xx errors, except 429, are treated the same: Google crawlers inform the next processing system that the content doesn't exist", while "5xx and 429 server errors prompt Google's crawlers to temporarily slow down with crawling. For Google Search, already indexed URLs are preserved in the index, but eventually dropped." One sentence for each group; the current single sentence blurs immediate removal with eventual dropping. Put both verbatim sentences and the URL in a comment beside the 400 boundary, noting 400 is RFC 9110's class boundary rather than a tuned number.

3. Close the status_code 0 hole. DataForSEO writes 0 when the fetch never completed, and 0 is a number below 400, so it currently passes silently as not-an-error and never reaches the "could not read" count, breaking the rule's own promise. Treat any value below 100 (not a valid HTTP status) as unreadable, in the same bucket as missing and non-numeric.

4. State the crawl scope. MAX_CRAWL_PAGES and RESULT_ROW_LIMIT are both 100 (onpage.server.ts:18-21) and the snapshot already carries possibly_truncated (transport.server.ts:309, 421). When possibly_truncated is true the copy must say the check stopped at the first hundred addresses, so the count is never read as a site total.

5. Register it, per AGENTS.md. Add to src/lib/rule-buckets.ts as bucket "fact", needsPerTarget null, with the developer-facing why. It also needs a new entry in the Prerequisite union and PrerequisiteState (rule-buckets.ts:23-45) for "a crawl has been collected" — none of the six existing prerequisites covers it, and without one the empty state blames volume for a screen that is actually empty because no crawl has run, which is the exact failure the comment at line 17-22 warns about. Add the matching finding-copy.ts entry in the same change.

6. For a 410 or a 401 the finding should file an operator decision, not a fault: a deliberately retired or gated address answering that way is the intended outcome, so ask whether the address should exist rather than assert it needs fixing.

#### `redirect_chain_present` → category `health`

- **Reads:** dataforseo_snapshots where kind = 'onpage_redirect_chains': totals.totalCount, falling back to returned_row_count; the hop array inside payload.rows only when it is readable
- **Condition:** For the newest onpage_redirect_chains snapshot: count = totals.totalCount when numeric, else returned_row_count. Fire when count >= 1. The finding names the longest chain only when a stored row exposes a readable array of hops; when it does not, it reports the count alone rather than guessing a length.
- **Says to the operator:** "7 addresses on the site send Google somewhere else before a page answers. Google reads the page it ends at, not the address you published, so publish the one that answers."
- **Grounding:** Google, HTTP status codes doc, fetched 2026-08-28: "Any content Google receives from the redirecting URL is ignored, and the final target URL's content is processed instead", and "By default, Google's crawlers follow up to 10 redirect hops." https://developers.google.com/search/docs/crawling-indexing/http-network-errors . The base rule carries no threshold — it is a count. Google's own 10 is used only to sharpen the wording when a stored row proves more than 10 hops; the redirects doc (301-redirects) was checked the same day and says nothing about chains, so no chain-length defect is claimed beyond Google's own number.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Delete the returned_row_count fallback and make the unknown speak. Five changes:

1. Read the count only from totals.totalCount. When it is not numeric, the count is unknown, not zero. Do not substitute returned_row_count as the count - the collector nulls the total on purpose, and this fallback is the one thing in the rule that turns that null into "nothing wrong with the site".

2. Render three states, never two. Fire the finding when totalCount >= 1. Say nothing when totalCount is 0, because that is a measured zero. When totalCount is not numeric, or no onpage_redirect_chains snapshot exists for the tenant, render a named absence in words on screen - "The crawl has not reported on redirects yet" for a missing snapshot, and "The last crawl did not report how many addresses redirect" for a snapshot whose total came back empty. Absence is stated, never left as silence that reads as a clean site.

3. Gate on crawlProgress, which is stored in the same totals object. A snapshot written while the crawl was still running carries a partial count, so a count from a snapshot whose crawlProgress is not finished is reported as a partial reading in words, not as the site's figure.

4. Speak possibly_truncated. When the snapshot is flagged truncated, the on-screen number is a floor: "at least 100 addresses", not "100 addresses". Also make the sentence agree at one: "1 address on the site sends Google somewhere else before a page answers."

5. Before the word "addresses" goes on screen, add the /on_page/redirect_chains response shape to docs/integrations/dataforseo/DIGEST.md - what one item is (one redirecting URL, or one hop) and what the hop array is called. The digest currently only lists the endpoint name, so the noun in the copy is an assumption about the provider's row semantics, and AGENTS.md is documentation-first about exactly this. If an item turns out to be a hop rather than a starting address, the count is a hop count and the sentence has to say so.

Then register the rule in src/lib/rule-buckets.ts as bucket "fact" (binary, needs no volume) with the crawl as a non-volume prerequisite in alsoNeeds, adding that member to the Prerequisite union - the union and the finding-copy map are exhaustive by type on purpose, so tsc will demand both. Keep the developer-facing why out of the operator copy, and grade this as a fact rather than an error: Google's redirects doc names four legitimate reasons a site holds redirects, so the finding tells the operator which address to publish, never that the redirect is a fault.

#### `duplicate_titles_across_pages` → category `pages`

- **Reads:** dataforseo_snapshots where kind = 'onpage_duplicate_title': totals.totalCount, falling back to returned_row_count
- **Condition:** For the newest onpage_duplicate_title snapshot: count = totals.totalCount when numeric, else returned_row_count. Fire when count >= 1.
- **Says to the operator:** "4 sets of pages here carry the same tab title. Google decides for itself what to show when a title does not fit the page, and identical titles are the case where it most often rewrites yours."
- **Grounding:** Google, title link doc: "If we've detected an issue on the page, we may try to generate an improved title link from anchors, on-page text, or other sources", and "we can't manually change title links for individual sites" — quoted in .claude/skills/seo-measurement/SKILL.md and already cited at page-checks.ts:94. https://developers.google.com/search/docs/appearance/title-link . The count has no threshold. Per the same skill, titles affect appearance rather than ranking, so the sentence claims click-through, never rank. Routing note: site-audit defaults to health, so this rule needs its own CATEGORY_BY_RULE entry in finding-router.ts to reach pages, where the existing title_duplicate check from the page audit already lives.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

1. Fix the read. Drop the `totals.totalCount` clause: for kind `onpage_duplicate_title` it is always null. Read `returned_row_count`, which is `items.length` for this endpoint. Before writing the sentence, confirm the item shape and record it in docs/integrations/dataforseo/DIGEST.md: the provider groups by `accumulator` (the shared tag value) with a `pages` array per group, so a row is a set of pages, not a page. If the operator should be told how many pages are affected rather than how many sets, extend `parseResultItems` to carry `total_pages_count` for this kind and cite that instead. Do not keep reading `total_items_count` for duplicate_tags.

2. Do not let a 0 read as a clean bill. A detail snapshot is only written after the crawl reports finished, so 0 rows on a readable result is a measured zero, but a result the parser could not read also lands as 0 rows with a null total and is indistinguishable. Gate the rule on a readable snapshot, and where the pages screen would otherwise imply "no duplicate titles", have it name the absence in words instead.

3. Rewrite the operator sentence to what the doc actually says, and scope it to what was crawled. `MAX_CRAWL_PAGES` is 100 and the comment calls it a sample, so "here" must not read as the whole site. Suggested: "4 sets of pages in the last crawl share one tab title. Google's own guidance is to avoid repeating the same title text across pages, and when it decides a title does not describe the page it may build its own from headings, on-page text or links instead of showing yours." Delete "most often" outright, and delete "does not fit the page".

4. Fix the wiring notes. Add `onpage: "pages"` to CATEGORY_BY_MODULE in finding-router.ts rather than a CATEGORY_BY_RULE entry, per that file's own comment that a whole module belongs in the module table. Register the rule in src/lib/rule-buckets.ts as bucket `fact` with `needsPerTarget: null` and empty `alsoNeeds` (a crawl answers it at any traffic level), and add its operator copy in finding-copy.ts, both of which AGENTS.md requires and the proposal omits.

5. Say what it duplicates. page-checks.ts:915 already raises `title_duplicate` from the page audit into the same `pages` category, with the same fix path (`wording` in audit-fixes.ts:38). Two cards making the same claim from two different crawls is a worse screen than one. Either fold this into the existing check as a second evidence source, or state in the rule's developer-facing `why` which crawl owns the claim when both have data.

#### `duplicate_descriptions_across_pages` → category `pages`

- **Reads:** dataforseo_snapshots where kind = 'onpage_duplicate_description': totals.totalCount, falling back to returned_row_count
- **Condition:** For the newest onpage_duplicate_description snapshot: count = totals.totalCount when numeric, else returned_row_count. Fire when count >= 1.
- **Says to the operator:** "6 sets of pages here share the same description, so the line under them in the results does not tell a searcher which one to open."
- **Grounding:** Google, snippet doc, already the cited source for this repo's description checks at page-checks.ts:135-156. https://developers.google.com/search/docs/appearance/snippet . Plain factual count, no threshold. Appearance only — the seo-measurement skill is explicit that a description rule is a click-through rule and its severity must say so. Same CATEGORY_BY_RULE override as the title rule.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Keep the rule, with four changes. 1. Stop treating a missing total as a clean site. Use totals.totalCount when it is numeric; fall back to returned_row_count only when that is 1 or more, as a lower bound. When the newest onpage_duplicate_description snapshot has a non-numeric totalCount and no rows, or when no such snapshot exists at all, render a named absence in words ("the site crawl has not returned a description check yet") rather than passing silently. Where totalCount was absent or the snapshot's possibly_truncated is true, say "at least 6" rather than "6". 2. Reword the operator sentence so it does not assert Google is showing the description: "6 sets of pages here share the same search description. Where Google uses that description under a result, it does not tell a searcher which page to open." Cite the snippet doc sentence that actually grounds it, "Identical or similar descriptions on every page of a site aren't helpful when individual pages appear in search results", which is stronger than the Stated assumption comment currently sitting above description_duplicate at page-checks.ts:165-166, and keep the severity saying click-through and appearance, never ranking. 3. Register the rule in src/lib/rule-buckets.ts as bucket "fact" with needsPerTarget null, and add an OnPage crawl prerequisite to the Prerequisite union and PrerequisiteState so an empty screen names the missing crawl instead of implying missing traffic. 4. Say in the copy that the count is sets of pages sharing one description, and dedupe against the existing page-audit description_duplicate check so the two collectors do not report the same problem with two different units. One caveat to carry into the change: src/lib/dataforseo/onpage.test.ts:100-103 records a stated assumption that the OnPage result shape came from provider documentation and has not been verified against a live crawl, so diff the first real snapshot against the fixtures and confirm total_items_count counts groups before trusting the number on screen.

#### `crawl_hit_its_page_cap` → category `health`  **files an operator DECISION, not a finding**

- **Reads:** dataforseo_snapshots: totals.crawlStatus.pages_crawled on the 'onpage_summary' row, against totals.maxCrawlPages on the 'onpage_task' row with the same provider_task_id
- **Condition:** Join the summary snapshot to its task snapshot on provider_task_id (safe for exactly these two kinds). Fire when crawlStatus.pages_crawled is a number and is >= the task snapshot's stored maxCrawlPages. When crawlStatus or pages_crawled is absent the rule stays silent rather than assuming the crawl was complete.
- **Says to the operator:** "The site check stopped after the first 100 pages it found. Everything past that has not been looked at, so a clean result here is not a clean result for the whole site."
- **Grounding:** Factual comparison, no threshold: both numbers are written by this repo (MAX_CRAWL_PAGES via ONPAGE_CONFIG, stored at onpage.server.ts:182), and the rule references the stored value rather than copying 100. It exists to serve the first invariant — unread pages must not read as fine pages.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

1. Do not put 100 in the operator sentence. Render the cap from the joined task snapshot's stored totals.maxCrawlPages, so the sentence stays true if the cap is ever raised for an approved site.

2. Do not assert that unseen pages exist. At pages_crawled == cap the evidence cannot separate a truncated crawl from a site of exactly that size. Reword to the fact plus the uncertainty, e.g.: "The site check reached its limit of {cap} pages and stopped there. If the site has more pages than that, none of them were looked at, so a clean result here is only a clean result for the pages that were checked."

3. Extend the silence guard to both sides. Fire only when crawlStatus.pages_crawled is a number AND the joined task snapshot's totals.maxCrawlPages is a number. Never fall back to the MAX_CRAWL_PAGES constant when the task row or its total is missing: that substitutes today's cap for the cap this crawl actually ran under, and it is the same class of error as reading an absence as a value. When the task row or its total is missing, say which fact is missing rather than firing or silently producing nothing.

4. Register it in src/lib/rule-buckets.ts as bucket "fact", needsPerTarget null, with a developer-facing why. It is answerable at any traffic level because it counts crawled pages and needs no impressions. If the screen it appears on can render before any crawl has been collected, give it a prerequisite so the empty state names the missing crawl instead of the rule quietly returning nothing.

5. Carry a "Stated assumption:" comment beside the crawlStatus read, pointing at onpage.test.ts:100. The crawl_status shape is taken from provider documentation and has not been diffed against a live crawl; name the first real snapshot as what settles it, and keep the silence-on-absence guard until then.

#### `crawl_result_truncated` → category `health`  **files an operator DECISION, not a finding**

- **Reads:** dataforseo_snapshots: possibly_truncated, returned_row_count and totals.totalCount on any onpage_* result kind
- **Condition:** Fire for a result snapshot when possibly_truncated is true, or when totals.totalCount is a number strictly greater than returned_row_count. Names which list is short and, when totalCount is a number, by how much.
- **Says to the operator:** "The list of pages Google is told not to index came back full at the limit this system reads, so there are more of them than the ones shown here."
- **Grounding:** Factual, no threshold: possibly_truncated is a column this repo computes at transport.server.ts:394 from its own RESULT_ROW_LIMIT, and totalCount is the provider's own total. This is the rule that stops every count above from being read as the whole truth, and it is why totalCount is stored as null rather than 0 when the provider omits it.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Split the condition by what the evidence can carry, and never let the flag alone assert that more rows exist.

1. Fire condition. When `totals.totalCount` is a number, decide on that alone: fire only if `totalCount > returned_row_count`, and state the exact shortfall ("the site has N of these; this reading holds the first M"). If `totalCount` is a number and is not greater than `returned_row_count`, do not fire even when `possibly_truncated` is true, because the provider's own total settles that the list is complete. Only when `totalCount` is null may `possibly_truncated` fire on its own, and then the copy may say only that the read stopped at the limit and it cannot be told from this reading whether more exist.

2. Two copy shapes, not one. With a total, e.g. "This crawl found 340 pages it could not treat as indexable and this reading holds the first 100." Without a total, e.g. "The list of pages this crawl could not treat as indexable came back full at the limit this system reads, so it may not be all of them, and this reading cannot say how many there are." Drop "Google is told not to index" everywhere: the list includes pages blocked by robots.txt and pages pointing a canonical elsewhere, and Google's documentation is explicit that a robots.txt block does not keep a page out of the index.

3. One entry per kind in the exhaustive finding-copy map, naming the list in the operator's words: all pages, duplicate titles, duplicate descriptions, redirect chains, non-indexable pages, duplicate content. Exclude `onpage_task` and `onpage_summary` explicitly in the reads line: neither passes `possiblyTruncated` or a `totalCount` to persistSnapshot (onpage.server.ts:388-404), so the stored `false` there is a default, not a reading.

4. Read `possibly_truncated` as stored. Do not re-derive it by comparing `returned_row_count` to a hand-written 100 (AGENTS.md: no threshold value copied by hand). If the row cap is ever needed on screen, reference `RESULT_ROW_LIMIT` (src/lib/dataforseo/onpage.server.ts:21).

5. Fix the citation to: computed at src/lib/dataforseo/onpage.server.ts:309 from `RESULT_ROW_LIMIT`, persisted at src/lib/dataforseo/transport.server.ts:430; `totalCount` parsed at onpage.server.ts:105-112 and deliberately null when absent.

6. Register in src/lib/rule-buckets.ts as bucket `fact`, `needsPerTarget: null`, `alsoNeeds: []` — it reads this system's own stored counters and answers at any traffic level — with a `why` recording that the rule reports the completeness of a reading, never a defect in the site.

#### `crawl_started_never_collected` → category `health`  **files an operator DECISION, not a finding**

- **Reads:** dataforseo_snapshots: provider_task_id and reporting_date on kind = 'onpage_task' rows with no kind = 'onpage_summary' row carrying the same provider_task_id
- **Condition:** Fire for each task snapshot whose provider_task_id appears in no summary snapshot — the same pairing outstandingCrawls already uses as its state machine. The wording escalates when reporting_date is more than 30 days old.
- **Says to the operator:** "A site check was started on 12 August and its results were never read back. DataForSEO keeps a finished crawl for 30 days; past that the pages have to be crawled, and paid for, again."
- **Grounding:** No invented number: 30 days is the provider's documented Standard-mode result retention, recorded in docs/integrations/dataforseo/DIGEST.md:72 ("Result retention: Standard 30 days"). Everything else is a row existing or not existing. This is the one rule in the set that could defensibly route to connections instead of health — it is about unfinished plumbing, not about the site — and that choice belongs in a CATEGORY_BY_RULE entry rather than in the writer.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Fire only past the retention boundary, and only on rows that name a task. (1) Condition becomes: an onpage_task row whose provider_task_id is non-null, is matched by no onpage_summary row for the same tenant, and whose reporting_date is more than the retention window old. Drop the two-tier escalation - before 30 days the honest words are "not read back yet", which is not a finding, and workflow-runner.server.ts:767-772 guarantees one such row exists at all times. (2) Exclude null provider_task_id rows, as outstandingCrawls does (onpage.server.ts:210-212); startCrawl stores `posted?.id ?? null`, so a null there is a failed post, a different fact needing different copy. (3) Scope both reads by tenant_id, matching outstandingCrawls. (4) Collapse to one finding per target: a daily workflow writes one task row a day, so a per-task rule yields dozens of cards for one broken pipe. Name the oldest date and how many crawls are affected. (5) Do not hand-copy 30 - AGENTS.md forbids it. Add `resultRetentionDays: 30` to ONPAGE_CONFIG (onpage.server.ts:23-28) citing DIGEST.md:72, and have both the rule and the startCrawl comment reference it. Note the digest line says "Standard 30 days" without naming OnPage; OnPage posts with mode "standard" (:157), so either add the OnPage-specific retention sentence to the digest on its next re-read or carry a `Stated assumption:` comment naming that as what would settle it. (6) Retention runs from crawl completion, not from the post date the rule reads, so it fires slightly early - the safe direction, but the sentence must not equate the two. Suggested copy: "A site check started on 12 August was never read back. DataForSEO keeps a finished crawl for about 30 days, so its pages are gone: getting that audit now means crawling the site, and paying for it, again." (7) forceStopCrawl (:432-455) writes no summary snapshot, so a crawl the operator deliberately stopped stays outstanding forever and will fire this rule at day 31 with copy implying a silent failure. Before shipping, confirm a stopped crawl still reaches crawl_progress "finished" and is harvested, or record the stop so the rule can exclude it. (8) The CATEGORY_BY_RULE entry is mandatory, not optional: finding-router.ts has no "onpage" module entry, so categoryForFinding falls through to "pages" (:126). Route it to connections - unfinished plumbing, not a fact about the site - and register it in src/lib/rule-buckets.ts as bucket `fact` with no alsoNeeds.



---

# Session B — Backlink findings

**Branch:** `claude/rules-backlinks`
**Files you own:** `src/lib/backlink-rule-checks.ts` (new), `src/lib/backlink-rules.server.ts` (new), `src/registry/modules/backlink-findings.ts` (new)

Six Backlinks endpoints are called and only one feeds a rule (`referring_domain_movement`, in `dataforseo/targeting-rules.server.ts` — do not touch that file). The other five store snapshots nothing reads.

Two of your three rules are about a page of *ours* that other sites link to, which is why they route to `pages` rather than `competition`.

**Critical:** the review killed two backlink rules (`net_link_loss_last_month`, `referring_domain_year_movement`) because `collectBacklinkHistory` does not store per-month rows in the shape they assumed. Before writing any read, open `src/lib/dataforseo/backlinks.server.ts` and confirm the exact stored shape. Do not trust a field name you have not seen written.

## Your rules

#### `inbound_link_to_error_page` → category `pages`

- **Reads:** backlinks_domain_pages payload.rows[].status_code and .page and .page_summary.referring_domains; backlinks_summary totals.broken_pages for the site total; backlinks_backlinks payload.rows[] where url_to matches the page, for domain_from/url_from as evidence
- **Condition:** On the newest backlinks_domain_pages snapshot, one observation per row where typeof status_code === "number" && status_code >= 400 && (page_summary.referring_domains ?? 0) > 0. A null or absent status_code raises nothing: not crawled is unknown, never treated as healthy. No count threshold, because one linked page answering an error is the entire fact. Target is the page address.
- **Says to the operator:** "Other sites link to /old-pricing, and that address answers with a 404 error, so anyone following those links lands on nothing. 3 sites link to it today, and across the whole profile 7 linked pages answer with an error, of which this list names the 4 that are in the stored sample."
- **Grounding:** Google, HTTP status codes and network errors: "Google doesn't use the content from URLs that return 4xx status codes" and "the indexing pipeline removes the URL from the index if it was previously indexed" (https://developers.google.com/search/docs/crawling-indexing/http-network-errors, fetched 2026-08-28). Factual status code, no threshold. The stated reason is the visitor arriving at nothing and the URL leaving the index, never a ranking claim.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

1. Split the reason by band, or narrow the condition. Google's cited page groups 429 with server errors, and says 5xx/429 cause a temporary crawl slowdown with recovery, not removal. So either fire only on `status_code >= 400 && status_code < 500 && status_code !== 429` (where the quoted "the indexing pipeline removes the URL from the index" actually holds), or keep `>= 400` to stay aligned with `broken_pages` and carry two reasons: index removal for 4xx-except-429, and for 429/5xx only "the server was failing when we last fetched it", with no index claim attached.

2. Date and attribute the reading. Use the row's `fetch_time` in the sentence: "when our link crawler last fetched it on 14 August it answered with a 404", not the present tense. Do not claim it for Google or for a live visitor. For 401 and 403, either exclude them or word them as "refused our crawler", since bot protection commonly returns those to crawlers and 200 to people.

3. Never print a coalesced count. Keep `?? 0` only as a silent gate; if `page_summary.referring_domains` is absent, raise nothing rather than printing "0 sites". If `totals.broken_pages` is absent from the newest summary snapshot, drop the site-total clause and say in words that the site-wide count has not been read yet. Name the collection date of each snapshot when the two clauses come from different collections.

4. Register it in src/lib/rule-buckets.ts as bucket "fact", needsPerTarget: null, alsoNeeds: [] — not "backlink_collection", whose copy is "two stored backlink readings, so there is movement to compare". This rule reads one snapshot and would be wrongly held silent until a second collection.

5. Copy: "across the whole profile" reads as jargon; use "across your whole site". Target stays the value of `page`.

6. Separately (not this rule's fault): fix backlink-evidence.server.ts:205, which reads `row["url"] ?? row["page_address"]` (neither field exists on this endpoint) and flat `row["referring_domains"]` (it lives under `page_summary`). Do not copy that field-name pattern into the new rule.

#### `linked_page_never_audited` → category `pages`

- **Reads:** backlinks_domain_pages payload.rows[].page, compared with page_metadata_observations.url (the table detectKeywordsWithoutPage already reads)
- **Condition:** Fires only when page_metadata_observations holds at least one row for the tenant, the same guard detectKeywordsWithoutPage uses at targeting-rules.ts:84, because with nothing read every linked page would look unaudited and that is a statement about the audit rather than the site. Then one observation per linked page whose normalized address matches no stored observation url. No threshold.
- **Says to the operator:** "Other sites link to /guides/moving-checklist, and the audit has never read that page, so nothing is stored about what is on it."
- **Grounding:** Factual set difference between two stored tables, no threshold. Google on discovery: "Other pages are discovered when Google extracts a link from a known page to a new page" (https://developers.google.com/search/docs/fundamentals/how-search-works), the same sentence rule-buckets.ts already cites for approved_keyword_no_page.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Keep the rule, fix the comparison set so the sentence it prints is true.

1. Do not reuse readPageText. Add a dedicated read of page_metadata_observations selecting url, final_url and error, scoped to tenant_id AND the selected property, with NO .is("error", null) filter and with .order("observed_at", { ascending: false }) so any limit takes the newest rows rather than an arbitrary slice; dedupe to the latest row per url the way readPageAudit already does with selectLatestObservations.

2. Split three states, never two. A linked page whose latest observation has error !== null has already been read and already carries its own named absence — it must not fire this rule. Only a linked page matching no observation row at all fires. If a distinct finding for attempted-but-unreadable linked pages is wanted, it is a separate rule with its own sentence quoting the stored reason.

3. Match on both url and final_url after normalizing scheme, lower-casing host, stripping the fragment and any trailing slash. Without final_url, every redirect the audit followed reads as unaudited.

4. Fire only on rows the backlink index recorded as reachable HTML (status_code 200, media_type text/html on the item) — both are factual item fields, not thresholds. A linked PDF or a dead URL is a real thing but "nothing is stored about what is on it" misdescribes it.

5. Name the audit's own boundary in the copy, since AUDIT_PAGE_LIMIT caps a run at 100 URLs drawn from the sitemap and Search Console: "Other sites link to /guides/moving-checklist. The page audit has not read it, because it is not in your sitemap and Search Console has not reported it." Cap the emitted observations and say how many were found rather than inserting one recommendation per unmatched page, since the backlinks side returns up to 100 rows and the snapshot already records possiblyTruncated.

6. Register it in rule-buckets.ts as bucket "fact", needsPerTarget null. alsoNeeds needs care: "page_audit" is right, but "backlink_collection" resolves to facts.backlinkSnapshots >= 2 (getting-found.ts:348), which is the two-reading prerequisite that referring_domain_movement needs and this rule does not — gating on it would misname why the screen is empty, the exact failure the Prerequisite doc comment warns about. Either add a one-snapshot prerequisite to the Prerequisite union and PrerequisiteState, or list only "page_audit" and let the empty backlinks table produce nothing. Write the `why` as what it is — a set difference between two stored tables that needs no threshold and cannot fire before either table holds rows — and drop the borrowed Google discovery quote, which grounds a different claim.

7. Test the two states the fix exists for: a linked page with a stored error row raises nothing, and a linked page matching a stored final_url raises nothing.

#### `link_profile_coverage_partial` → category `competition`  **files an operator DECISION, not a finding**

- **Reads:** backlinks_summary totals.referring_domains, compared with the newest backlinks_referring_domains snapshot's returned_row_count
- **Condition:** Both snapshots exist, summary totals.referring_domains is a number, and it exceeds the stored referring-domain row count (200 at BACKLINKS_CONFIG.referringDomainLimit). Does not read possibly_truncated, which is stored true on every summary and history snapshot because those calls send no limit (backlinks.server.ts:91).
- **Says to the operator:** "412 sites link here in total, and the stored list holds the 200 highest rated of them, so the check of which sites came and went covers those 200 and not the rest."
- **Grounding:** Factual comparison of two stored counts, no threshold. It exists because referring_domain_movement diffs two rank-ordered top-200 lists, so a site dropping out of the top 200 reads as lost when it may still link; the project invariant is that a partial read is stated in words rather than rendered as a complete one.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Fire on the truncation fact, not on the difference between two endpoints. Gate on the referring-domains snapshot itself being at the cap: returned_row_count >= BACKLINKS_CONFIG.referringDomainLimit, which is exactly the test that sets possibly_truncated on that snapshot (backlinks.server.ts:91) and is meaningful there because that call sends a limit, unlike summary and history. Check both snapshots the diff compares, not only the newest, since detectReferringDomainMovement reads two (targeting-rules.server.ts:73-96). Take the total from the same call rather than a different one: totals.totalCount on the referring-domains snapshot (backlinks.server.ts:146), falling back to backlinks_summary totals.referring_domains, and when neither is a number say the list is capped without naming a total instead of printing a zero. Do not write 200 into the copy; render the stored row count and reference BACKLINKS_CONFIG.referringDomainLimit, per the no-threshold-copied-by-hand rule. Reword so the count is attributed rather than voiced as ground truth and so "highest rated" names who does the rating, for example: "The link data we buy counts 412 sites linking here, and the stored list holds the 200 that source scores highest, so the check of which sites came and went covers those 200 and not the rest." Land the sentence on the referring_domain_movement finding's own description and evidence rather than filing a separate recommendation: persist() fingerprints on checksum([tenantId, rule, target]) with target set to the reporting date (targeting-rules.server.ts:105, targeting-rules.ts:135), so a standalone caveat refiles on every collection date; if it must stay its own rule, fingerprint it on the property target so it files once. If kept as its own rule, register it: RULE_ASSIGNMENTS in rule-buckets.ts with bucket "fact", needsPerTarget null, alsoNeeds ["backlink_collection"], plus entries in the exhaustive maps (the SearchRule union and ALL_SEARCH_RULES and WRITERS in finding-copy.ts, and the category map in finding-router.ts), and confidence 1 as a fact read straight off stored rows.



---

# Session C — Umami visitor findings

**Branch:** `claude/rules-umami`
**Files you own:** `src/lib/umami-rule-checks.ts` (new), `src/lib/umami-rules.server.ts` (new), `src/registry/modules/umami-findings.ts` (new)

`cap.umami` is `integration_state: real` and `umami_snapshots` rows exist, but no rule reads them, so the `visitors` category has no Umami finding.

Mirror the GA4 rule engine (`src/lib/ga4*`) rather than inventing a shape — it is already working in the same category.

**Analytics findings must not assert SEO causation.** A traffic drop is a traffic drop; it is not evidence about rankings. The review killed `umami_page_traffic_shift` for inventing a per-page threshold, and killed `umami_recording_stopped` — read those kills in the handoff before you start, because the surviving three are narrow versions of the same ideas and it is easy to widen them back into the killed ones.

## Your rules

#### `umami_tracking_silent` → category `visitors`

- **Reads:** umami_snapshots.totals (metric='stats') + umami_snapshots.returned_row_count + measurement_runs.status via run_id
- **Condition:** On the newest metric='stats' row per website_id: run.status === 'succeeded' AND returned_row_count > 0 AND Object.keys(totals).length > 0 AND every stat in totals has value === 0. No threshold: the trigger is exactly zero. The two guards are what separate a measured zero from an unread window; without them a failed read would render as no traffic, which the digest forbids. Fires once per website per window; issue_fingerprint over [website_id, rule, 'site'].
- **Says to the operator:** "Your Umami instance answered for TruMove and recorded nothing at all in the 28 days to 18 August: no pageviews, no visitors, no visits. The read itself succeeded and Umami returned its counters, so this is Umami reporting nothing arrived rather than a reading we could not take. Nothing here can tell a tracking script that is not running from a month with no visitors; checking the script is present on the site settles which it is."
- **Grounding:** factual count, no threshold. The run-status and returned_row_count guards implement the Umami digest's stated rule verbatim: "A 401 means expired or rotated credentials, not zero traffic. Missing data is recorded as a failure, never as zero" (docs/integrations/umami/DIGEST.md, Limits and risks). Bucket fact, on the same reasoning rule-buckets.ts already records for event_disappeared: whether something was recorded at all is a wiring question, not a statistics one, so no volume makes it more or less answerable. Confidence should mirror event_disappeared's stated-assumption comment and stay capped below 1, because Umami cannot distinguish an absent script from an absent visitor.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

1. The two guards are one guard; say so. For metric='stats' the collector sets returned_row_count = Object.keys(stats).length (observe.server.ts, the `rows` array), so `returned_row_count > 0` and `Object.keys(totals).length > 0` are the same test written twice. Only `run.status === 'succeeded'` is independent. Keep both expressions if you want belt and braces, but the `why` must not claim two guards separate a measured zero from an unread window. Add `run_id is not null` explicitly: the column is nullable and `on delete set null`, and a null run_id must block the finding rather than pass as unknown.

2. Do not mirror event_disappeared's 0.9. That rule earns 0.9 from a two-window contrast: the event cleared minPriorEventCount in the prior window and vanished in the current one, so "it used to work" is itself measured and the only unmodelled alternative is a rename. This rule has no prior window, and "the script is not running" and "nobody visited" are fully coextensive explanations of the same zero, not a corner case. Score the fact you actually measured. The finding's claim is "Umami recorded zero", so either carry that as the claim with the certainty a count deserves, or keep the wiring reading and drop the value into the medium band. Do not reach for MAX_CONFIDENCE (0.9, confidence.ts). Put a `Stated assumption:` comment beside the literal naming what would settle it: a fetch of the site confirming the Umami script tag is present.

3. Rename the rule. `umami_tracking_silent` states the wiring conclusion the copy is careful not to draw. Use something that states the measurement, e.g. `umami_zero_recorded`. Ids are developer-facing, but the id is what the `why` and the bucket map get reasoned about later, and an id that asserts the conclusion is how the conclusion gets asserted.

4. Fix the copy to name only the counters that came back. fetchUmamiStats drops any entry it cannot parse, so totals can hold fewer than five keys; "no pageviews, no visitors, no visits" asserts three readings when only one may have been stored, which is the project's first invariant broken inside a rule built to protect it. Build that clause from Object.keys(totals). Keep the second and third sentences verbatim; they are the best part of the rule.

5. Registration. Bucket `fact` is right, but write its own `why` (whether the instance recorded anything is a row lookup, answerable at any volume, no threshold makes it more honest) rather than reusing event_disappeared's. `alsoNeeds` has no honest member today: `analytics` is built as `facts.sessions !== null` from GA4 (src/lib/getting-found.ts:343), so it would misname the prerequisite. Either register `alsoNeeds: []` with the `why` stating the stored stats snapshot is the rule's entire target set (zero_impression_page's construction), or widen `Prerequisite` with a self-hosted-analytics member and fill PREREQUISITE_COPY and PREREQUISITE_STATE_KEY in the same change, since both are exhaustive `Record<Prerequisite, …>` and tsc will fail otherwise.

6. Scope and fingerprint. The unique index is (tenant_id, website_id, metric, period_start, period_end), so "newest stats row per website_id" must be per (tenant_id, website_id). The proposed fingerprint [website_id, rule, 'site'] drops the tenant; follow one of the two house schemes: checksum([tenantId, rule, target]) (dataforseo/targeting-rules.server.ts) or checksum([module, rule, target]) with `.eq("tenant_id", tenantId)` on the open-recommendation lookup (pagespeed-rules.server.ts). Also drop "per window" from the description: the fingerprint carries no window and dedup is on open state, so it fires once per website and stays open until resolved. That is the behaviour you want, but not what the sentence says.

7. Guard the word "your". pickWebsite falls back to websites[0] when no stored asset hostname matches the Umami domain, so website_name is not guaranteed to name a site the tenant owns. The digest's single-tenant note makes this benign today, but either fire only when the snapshot's website matched an owned asset, or record that match in provenance so the copy can say "your" honestly.

#### `umami_site_traffic_shift` → category `visitors`

- **Reads:** umami_snapshots.totals.visitors.value and totals.pageviews.value (metric='stats'), across two rows, with period_start/period_end doing the pairing
- **Condition:** Pairing: current = newest metric='stats' row for the website; prior = newest row for the same website where prior.period_end <= current.period_start (strictly non-overlapping) AND the two window lengths differ by under one day. Then: before = prior.totals.visitors.value, after = current.totals.visitors.value; fire when before >= MIN_BASELINE (confidence.ts) AND confidenceInCountChange(before, after).band !== 'low'. One rule covers both directions, the way site_clicks_shift does; direction comes from the sign. Pageviews travel in evidence, never as a second finding.
- **Says to the operator:** "Visitors your own analytics counted fell from 412 to 260 between the 28 days to 20 July and the 28 days to 17 August, about 2.4 times the ordinary swing at this volume, so it is unlikely to be noise. The two periods do not overlap, so this is a real change between them rather than the same weeks counted twice. These are Umami's cookieless counts of how many people arrived; they do not say why, and they are not Google Analytics numbers."
- **Grounding:** No new number: the floor is MIN_BASELINE and the noise judgement is confidenceInCountChange, both already in /home/user/synergy-layer/src/lib/confidence.ts with their basis written down (standard error on a count of n is about sqrt(n), inflated by the stated DISPERSION). The non-overlap guard is the seo-measurement skill's own instruction, "Do not diff overlapping windows"; this is where the Umami shape can beat GA4's rather than copy it, because ga4-rule-checks.ts has to damp its thresholds for rolling 28-day windows that share 21 days, while umami_snapshots stores explicit period bounds so a clean pair can simply be required. Cost, stated rather than hidden: with daily 28-day collection this cannot fire until roughly 56 days of collection exist, which is what the umami_second_window prerequisite is for. Bucket pooled, matching site_visibility_shift and site_clicks_shift: a site-wide total is the pooled answer.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Seven fixes, all concrete.

1. The prerequisite it names does not exist. There is no `umami_second_window` in /home/user/synergy-layer/src/lib/rule-buckets.ts. `Prerequisite` is a closed union of six members and is consumed by two exhaustive maps (PREREQUISITE_COPY and PREREQUISITE_STATE_KEY), so adding a member forces an entry in both or tsc fails. Do add it rather than reusing `second_collection`: that one is wired to `facts.comparison.status === "ready"` at your-pages.ts:452, getting-found.ts:341 and site-health.ts:458, which is the Search Console comparison. Reusing it would tell the operator a Umami rule is unblocked because Search Console has two windows. The new state field must be sourced from umami_snapshots itself: two metric='stats' rows for the same website_id whose windows do not overlap.

2. Registration will fail the existing test unless the family is added. rule-buckets.test.ts builds EXPECTED_RULE_IDS from SEO_RULES, ALL_SEARCH_RULES, GA4_RULES_COVERED and PAGESPEED_RULES_COVERED, and then asserts "has no assignments outside the expected set". A umami rule id in RULE_ASSIGNMENTS breaks that test. Add a `Record<UmamiCheckRule, true>` alongside the GA4 one, the same compile-time exhaustiveness trick, and export a `UmamiCheckRule` type from the new module.

3. The cost is misstated in the safe direction but still wrong. It is not "roughly 56 days of collection". The first run already stores a 28-day lookback, so a daily 28-day cadence produces a strictly non-overlapping pair on about day 29 of collection, which is 56 days of coverage. State the real number, because that copy reaches the operator through unmetPrerequisites.

4. State the harder prerequisite, which the proposal omits entirely. Per docs/context/CURRENT_BUILD.md §0d and its capability table, as of 2026-08-28 exactly four umami_snapshots rows exist, all from one run on 2026-08-18, and that run returned zero pageviews, visitors, visits and bounces as a real provider result. Every daily firing since has failed, and the promotion migration is still a file awaiting application. So the rule is inert today for two reasons, not one: no second window, and no volume to clear MIN_BASELINE. Say both.

5. The illustrative number is wrong and must never be hand-written anyway. countChangeZ(412, 260) is 4.8, not 2.4, and 4.8 lands in the high band whose stored wording is "very unlikely to be noise", not "unlikely to be noise". Render the multiple and the noise clause from `confidence.reason` exactly as site_clicks_shift does, per the "No threshold value copied by hand" rule in AGENTS.md.

6. Name the window-length tolerance as a constant with a `Stated assumption:` comment saying what would settle it. On a 28-day window a one-day tolerance is at most a 3.6% difference in exposure, roughly 15 visitors at a baseline of 412, against a noise floor of about sqrt(412 x 3) which is 35, so the guard is defensible; write that reasoning down rather than leaving the number bare. Consider requiring exact equality instead, since the scheduled path always passes the 28-day default and only operator refreshes vary.

7. Two copy corrections. First, `visitors` is a de-duplicated unique count over the window, while confidence.ts derives its floor from counts being arrivals. The model applies exactly to `pageviews` and `visits` and only approximately to `visitors`. Either headline `visits`, or keep `visitors` and state beside the call that deduplication lowers variance below Poisson, so DISPERSION = 3 is conservative here and under-fires rather than over-fires. Second, when `after` is zero or near zero against a healthy prior, do not assert that visitors fell. A healthy Umami instance with the tracking script removed returns an honest zero that the collector cannot distinguish from a real collapse, so that case must say both are possible. Also drop "so this is a real change between them"; non-overlap establishes that the windows are independent, not that the change is real, and the confidence clause already carries that claim. Finally, when the gap between the paired windows exceeds one window length, because collection lapsed, say so in the sentence, so a seasonal comparison is not read as a change.

#### `umami_referrer_source_stopped` → category `visitors`

- **Reads:** umami_snapshots.payload.rows[].label and .count (metric='referrers'), plus returned_row_count on the current row
- **Condition:** Same non-overlapping, same-length pairing, on metric='referrers'. Fire for a label where before >= MIN_BASELINE AND the label is absent from the current list AND current.returned_row_count < the fetch limit, so the current list is complete rather than cut off at 25. A referrer that merely fell is not a finding here; that is the pooled question umami_site_traffic_shift already answers.
- **Says to the operator:** "Visits arriving from example.com stopped: 46 in the 28 days to 20 July and none in the 28 days to 17 August, and this window's referrer list is short enough to be the whole list rather than the top of a longer one. Umami records the site a visit came from and nothing more, so this says those visits stopped, not why they stopped or what it means for how you are found."
- **Grounding:** Floor from MIN_BASELINE in confidence.ts; the completeness guard is the same top-25 truncation reasoning as umami_page_traffic_shift. Bucket beyond_current_volume with needsPerTarget = MIN_BASELINE, and this is the honest call rather than the flattering one: unlike event_disappeared, a referrer going quiet is behaviour, not wiring, so it is a count-shaped question about one source, and pooling referrers cannot recover a single source any more than pooling pages recovers a censored query. Registered so the screen can say what volume would make it answerable; expected to stay silent at this property. Causation guard, load-bearing here because several referrers are search engines: a referrer is the site a visit came from, so this rule may never be worded as a change in rankings, visibility or how the site is found. Umami has no search dimension at all.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Six changes before this rule ships.

1. Exclude the empty referrer bucket, which is the likeliest label to clear MIN_BASELINE. client.server.ts:205 maps any non-string x to the literal string "(none)", and an empty-string x survives as "". Neither is a site a visit came from. Firing on either would put a stored placeholder on an operator screen (AGENTS.md copy style bans stored enum values and fingerprints on screen), and would turn "direct traffic fell" into a fabricated referrer finding. Skip labels that are empty or "(none)"; that traffic belongs to the pooled site-traffic question.

2. Export the slice size and reference it. The 25 is currently an unexported default parameter (client.server.ts:195, limit = 25), so any rule using it hand-copies the number, which AGENTS.md forbids ("No threshold value copied by hand... A copied number drifts, and has"). Export it as a named constant from client.server.ts and have both the collector and the rule read that one object.

3. Record the provider-side limit in the digest before trusting the guard. fetchUmamiMetrics sends no limit query parameter, so returned_row_count < 25 proves only that our slice was not binding; it says nothing about what Umami's metrics endpoint returns by default. docs/integrations/umami/DIGEST.md documents the endpoint but records no row limit. Per the documentation-first rule in AGENTS.md, add the verified default to the digest and make the guard compare against the smaller of the API limit and our slice size.

4. Register alsoNeeds: ["second_collection", "analytics"] in src/lib/rule-buckets.ts. The rule diffs two windows, and there is currently exactly one stored Umami run (CURRENT_BUILD.md §0d: four rows from one run, on 2026-08-18). Without the prerequisite the empty screen would name volume as the blocker when the real blocker is that no second collection exists.

5. Add a site-wide collapse guard and a per-run cap. If the whole current referrer list is empty, or site visits collapsed across the board, that is one event (tracking removed, site down), not N independent referrer findings. Mirror the existing shape: detectDisappearedEvents caps at GA4_RULE_THRESHOLDS.disappearedEvent.maxFindingsPerRun (src/lib/ga4-rule-checks.ts:167). Suppress the per-referrer findings in that case and let the pooled site-traffic rule answer instead.

6. Reword the completeness clause out of implementation terms, and land the two cited rules first. Replace "this window's referrer list is short enough to be the whole list rather than the top of a longer one" with something like "this window's list of sources is complete, so this is a recorded zero and not a source pushed off the end of a longer list" — the fetch limit is developer-facing and must not reach the screen. And since neither umami_page_traffic_shift nor umami_site_traffic_shift exists yet, either merge them first or rewrite the RuleAssignment.why to argue the truncation and pooling reasoning on its own rather than by citing rules a reader cannot open.



---

# Session D — Competitor discovery and ownership candidates

**Branch:** `claude/rules-discovery`
**Files you own:** `src/lib/dataforseo/discovery-rule-checks.ts` (new), `src/lib/dataforseo/discovery-findings.server.ts` (new), `src/registry/modules/competitor-discovery.ts` (new)

Labs (7 endpoints), Domain Analytics (whois + technologies) and Content Analysis all store snapshots nothing reads.

**The two ownership rules are the most sensitive work in this batch.** `docs/execution-handbook/COMPETITIVE_MODEL.md` §4 is binding: ownership is operator-declared. Shared whois registration details or an identical technology stack may *suggest* two domains share an owner; they never assert it. Both rules file a **candidate for the operator to confirm or reject**, with the evidence shown, and the word "suggests" doing real work in the sentence. If your implementation ever writes an ownership link without an operator action, it is wrong.

Context for why this matters: the operator's own market has one owner running four consumer brands under three differently-named advertiser accounts (`docs/context/COMPETITOR_RESEARCH_LOG.md`). Per-domain analysis understates that group by roughly half. Ownership detection is genuinely valuable here — which is exactly why it must not guess.

**Do not** write `source_module: "dataforseo"` (see session A's note); use `"competitor-discovery"` and add it to `CATEGORY_BY_MODULE` in your PR body as a note, not an edit.

## Your rules

#### `overlap_list_reached_the_row_limit` → category `competition`

- **Reads:** dataforseo_snapshots.possibly_truncated, .returned_row_count and .request_params.limit for kind 'labs_competitors_domain'
- **Condition:** The most recent overlap snapshot carries possibly_truncated true. Rendered on the same card as the discovery result rather than as a standalone alert.
- **Says to the operator:** "This look up returned as many rows as it asks for, so the overlapping companies listed are the first the provider had, not all of them. Read it as a sample."
- **Grounding:** factual flag already written by persistSnapshot, no threshold. It exists so a partial read is never presented as a complete one; the row count in the sentence reads LABS_CONFIG.competitorLimit rather than a copied 25.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Four changes before it ships:

1. Read the cap from the snapshot, not from the live config. The claimed grounding says the number reads LABS_CONFIG.competitorLimit. Use the stored request_params.limit on the row instead (which the rule already reads). LABS_CONFIG.competitorLimit is a request parameter, not a threshold object, and if it is ever changed the sentence would misdescribe every snapshot collected under the old value. Referencing the stored value satisfies the "no threshold copied by hand" rule and is the only value that is true of that particular read.

2. Keep the "possibly". The flag is `rows.length >= limit`, which cannot distinguish a cut-off list from a domain that happens to have exactly 25 overlapping sites. The proposed sentence asserts truncation as fact ("are the first the provider had, not all of them"). Soften to a possibility: "may not be all of them".

3. Say sites, not companies. competitors_domain returns domains that share ranking keywords, which routinely include directories, marketplaces, review sites and Wikipedia. Calling them "companies" hands the operator a business classification the row does not carry, and this repo classifies separately (company-classification.server.ts) after an operator decision.

4. Do not let the sentence's number contradict the card's. discoverCompetitors (labs.server.ts:130-132) filters the seed domain out of the rows before writing candidates, so a capped read of 25 rows commonly lists 24 sites. Either omit the number, or say explicitly that it is the number asked of the provider and that your own domain is not listed.

Suggested sentence, with {n} from the snapshot's stored limit: "This lookup asked for at most {n} sites and {n} came back, so the list may be the first ones the provider had rather than every overlapping site. Your own site is not listed. Read it as a sample."

Also, two things to carry with it: gate the rule on the stored limit being a positive number (labsCall's `?? 0` fallback would make possibly_truncated true for a zero-row read if a caller ever omitted limit; competitors_domain always sets it today, so this is a guard, not a live bug), and register the rule in src/lib/rule-buckets.ts as bucket "fact", needsPerTarget null, alsoNeeds [], per AGENTS.md, with a Vitest file beside the module stating the prose claim.

#### `same_registration_details_across_two_known_domains` → category `competition`  **files an operator DECISION, not a finding**

- **Reads:** dataforseo_snapshots kind 'whois_overview': payload.rows[].domain, .registrar, .created_datetime, .expiration_datetime, restricted to domains already present in competitor_candidates.domain or tracked_competitors.domain
- **Condition:** Two known domains hold an exactly equal value on one of registrar, created_datetime or expiration_datetime. One link candidate per pair per matching field, in pending, carrying the matched field, the shared value, the snapshot it came from, and how many stored domains share that same value. No score, no combination rule, no cut off. This rule writes nothing to company_classification and nothing to any ownership field; only the operator's confirmation writes the link.
- **Says to the operator:** "Two companies you know about were registered on the same day through the same registrar. Nine of the 71 domains stored here use that registrar, so it may mean nothing at all. This is not evidence that they are the same company. Say whether they are linked, and nothing changes until you do."
- **Grounding:** factual equality, no threshold. COMPETITIVE_MODEL.md section 4.3 (whois is a suggestion worth an operator's attention and nothing more) and section 7 (inferring corporate ownership without operator confirmation is forbidden). The cohort count sits in the sentence so the operator judges how distinguishing the match is, instead of code deciding that with an invented cut off. The pending, confirmed, rejected shape copies ad_advertiser_candidates, the existing identity-claim queue.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Four changes, none of which introduces a threshold.

1. One candidate per pair, not per pair per field. Nine domains sharing a registrar already produce 36 pairs; multiplying that by three fields files the same pair three times saying three different things. File one row per pair carrying the list of fields that matched, each with its shared value and its cohort count.

2. Write the sentence from the fields that actually matched, and say domains. Only claim same-day when created_datetime matched, only claim same registrar when registrar matched. Since equality is on the full stored timestamp, not the calendar day, word it as the recorded date and time. For a registrar-only match: "Two domains you already track were registered through the same company, GoDaddy.com, LLC. Nine of the 71 domains stored here use it, so it may mean nothing at all. This is not evidence that the two are owned by the same company. Say whether they are linked, and nothing changes until you do."

3. Match only on a value that is present. A domain with no stored registrar or no stored registration date is not a match with another domain missing the same field; it is a named absence. Two blanks must never file a candidate. When a domain in the tracked set has no whois row at all, say that no registration record has been collected for it, never that no link was found.

4. Wire the producer and the registries. Add an operator-triggered whois read that filters the registered-domain index down to the tracked and candidate domains (the digest's §7 filter syntax has `in`, and filtering is free), because nothing calls collectWhoisOverview today and the rule reads an empty table until something does. Register the rule in src/lib/rule-buckets.ts as bucket `fact` with needsPerTarget null, and add a new Prerequisite member for the whois read to the union at rule-buckets.ts so alsoNeeds can name it; the closed type is the forcing function AGENTS.md asks you not to widen away. Add its operator copy to the finding-copy map. Record the new candidate table, its lifecycle and the fact that only operator confirmation writes the link in docs/execution-handbook/COMPETITIVE_MODEL.md in the same change, per the "check the governing contract" rule.

#### `identical_technology_stack_across_two_known_domains` → category `competition`  **files an operator DECISION, not a finding**

- **Reads:** dataforseo_snapshots kind 'domain_technologies': payload.rows[0].technologies, .domain, .last_visited, plus totals.lastVisited
- **Condition:** Two known domains whose stored technologies object is exactly equal under checksum() from transport.server.ts. One link candidate per pair, pending, carrying both crawl dates and how many stored domains share the same fingerprint. No similarity score is computed, because any partial-match cut off would be invented. Today only the owned property has a stored stack, so until the collector is pointed at competitor domains on an operator click the surface says that read has not run.
- **Says to the operator:** "These two sites run exactly the same set of technologies, as the provider last looked at them on 20 August and 14 August. Shared tooling is common and proves nothing on its own. Say whether these are one operation."
- **Grounding:** factual equality, no threshold; reuses the existing checksum helper rather than adding a hash. The crawl dates are carried because EVIDENCE_POLICY.md requires collection time and freshness on every evidence object. Same doctrine as the whois pair: a suggestion an operator confirms, never an assertion.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

1. Guard the comparison on a non-empty stack before any pair is formed. Require both technologies objects to be present and to contain at least one named technology; an empty or missing stack is a named absence in words ("the provider recorded no technologies for this site when it last looked on 20 August"), never half of a matched pair. Without this, checksum({}) === checksum({}) fires the finding on two domains the provider read nothing for, and a missing technologies key throws inside checksum() rather than rendering an absence.

2. Carry the number of shared technologies alongside the equality, so an operator can tell a twelve-technology match from a one-technology WordPress match. Both are "exactly equal" and they are not equally interesting.

3. Keep the word "fingerprint" off the screen. AGENTS.md copy style bans fingerprints in operator-readable text, so render the shared count as plain words ("four other stored sites run this same set"), not as a fingerprint tally.

4. Register the rule as AGENTS.md requires: bucket 'fact' in src/lib/rule-buckets.ts with needsPerTarget null, since exact equality needs no traffic. None of the six existing Prerequisite members covers "a stored technologies read exists for two or more domains", so add a new member (e.g. technology_collection) with its matching PrerequisiteState field. The Prerequisite union is closed and the bucket, finding-copy and fix-target maps are exhaustive by type, so the rule also needs its finding-copy.ts entry and finding-fix-target.ts target or tsc fails.

5. State a freshness state, not just the two crawl dates. EVIDENCE_POLICY.md:47 requires freshness state as well as collection time, and two stacks read six days apart are being compared as if simultaneous.

6. Fix the module name: 'labs-domain-content' matches no file in the repo. The evidence this rule reads is written by src/lib/dataforseo/domain-analytics.server.ts, so place and name the rule with the domain-analytics evidence rather than with Labs.

#### `rival_page_mentions_your_brand` → category `competition`

- **Reads:** dataforseo_snapshots kind 'content_analysis_mentions': payload.rows[].url, .domain, .content_info.title, .content_info.date_published; joined on normalised domain to competitor_candidates.domain and tracked_competitors.domain
- **Condition:** A stored mention whose domain equals a domain already known as a competitor. One finding per mention URL, deduplicated on the same stored fingerprint scheme the other rule families use. Rows with no URL are counted by countUnparsedMentionItems and named as unread, never dropped to zero.
- **Says to the operator:** "A page on a site that ranks alongside you mentions your name: 'Who to hire', published 1 August. The match is on your brand word appearing in the page text, so read it before treating it as a comparison of you."
- **Grounding:** factual match of two stored row sets, no threshold. The brand term is the domain label with its ending removed (workflow-runner.server.ts), so it is a string match and not a verified brand reference, and the sentence says so. Sentiment is not read: the vendor publishes no combined score and content-analysis.server.ts deliberately refuses to invent one.

**Required corrections from the adversarial review — apply ALL of these, they are not optional:**

Five changes, then it can ship.

1. Narrow the join. Match tracked_competitors only where active is true, and competitor_candidates only where review_state is not 'rejected' and domain_class = 'competitor'. A rejected candidate is a filed operator decision that this domain is not one to watch, and a 'surface' row is wikipedia/reddit/indeed/uhaul by the list at competitors.server.ts:63-79. Normalise both sides with the same lowercase-and-strip-leading-www that normaliseDomain (competitors.server.ts:81) already applies; export that function and call it rather than copying the regex.

2. Handle the null date and null title the way finding-copy.ts already states: when a field is missing or the wrong type, drop the evidence clause entirely rather than fill it with a guess, an "unknown" or a zero. The claim still stands on the URL alone. Never render "published " with nothing after it, and never substitute the collection date for the publication date.

3. Give the empty state words. When the tenant has no content_analysis_mentions snapshot, say the mention read has not run yet and that it is a metered call on an operator click. When the newest snapshot has possibly_truncated set (items.length hit CONTENT_ANALYSIS_CONFIG.mentionLimit, 100), say the reading stopped at the first hundred pages, so no-match cannot be reported as none. Keep the unparsed count named as unread pages, as specified.

4. Fix the brand term in the same change, since the rule's whole claim is "your brand word". Strip a leading www. before the TLD removal at workflow-runner.server.ts:807, and refuse to fire on a snapshot whose stored target is not a plausible brand label rather than reporting matches on "www".

5. Register it. rule-buckets.ts entry with bucket "fact" and needsPerTarget null (a stored row matching a stored row needs no volume), plus alsoNeeds naming the two non-volume prerequisites that actually bind: a brand-mention collection and a reviewed competitor set. Neither exists in the Prerequisite union, so add both members — an empty screen that explains only volume misnames why it is empty. Add the matching finding-copy and fix-target entries the exhaustive records force.

Keep the on-screen wording in the "ranks alongside you" register. Do not relabel it competitor or rival on screen, and do not let the finding carry company_classification: COMPETITIVE_MODEL.md sections 2 and 7 keep the SERP-derived class and the operator-declared class apart, and the mention itself is evidence about a page, not about a company.


---

# Still open from earlier, not in the four sessions above

These are the leftovers. They are listed here so a session picking up this
document does not have to reconstruct them, and so they are not quietly lost
between batches.

## Route keywords — blocked on the operator, and the highest-leverage item here

`tracked_keywords` holds **40 terms and every one is a synonym of "best long
distance movers"**. A regex for `\s+to\s+` matches nothing: there is not one
route query in the set. Meanwhile the competitors winning organically win by
owning a route matrix — moveBuddha's `/popular-routes/{from}/{to}/`, up to
~2,450 cells — and `trumoveinc.com`'s sitemap is 30 URLs with no route pages at
all.

So the system measures a contest TruMove is not in, on the one query shape where
listicle publishers are strongest and a broker is weakest.

**Needs from the operator:** the top lanes by volume. Then add them as tracked
keywords and run `dfs-serp-observe`, which is *already unblocked* —
`cap.dataforseo_serp` is `integration_state: real`, no SerpApi gate involved —
and which returns who ranks per route and with which page. That is the organic
landing-page data, and it does not cost a SerpApi credit.

## Connect keywords to page content

Cannibalisation and keyword-in-page checks. No page-content join exists today,
so a keyword and the page meant to win it are never compared.

## A governed insertion change kind

`PAGE_CHECK_FIX.h2_missing` stays `null` and should. The wording lane now owns
`subheading`, so *rewriting* one is drafted, applied and proven live — but
`h2_missing` fires when a page has **no** H2, and the executor's only mechanic is
exact string replacement (`implementation_method = github_exact_replacement`).
There is no `before` text to match and nothing the rendered proof could have
expected.

Closing it needs a different change kind: an anchor to insert relative to, an
executor path that inserts rather than replaces, and a proof that reads the new
heading's position rather than a replaced string. Until that exists, wiring
`h2_missing` to the wording lane would offer a draft the executor cannot write.

## Migration 20260828160000

Committed and CI-green, not yet applied to the AOOS database (project
`4aa4b3cf-b3ab-4721-aff6-e0d55ce13276`). Until it is applied, the page wording
lane still refuses any change set that is not exactly two entries. Deploy-safe
in either order.

## Ads landing pages

Google's Ads Transparency RPC returns the advertiser's verified domain and never
the click destination — confirmed by reading the API, see
`docs/context/COMPETITOR_RESEARCH_LOG.md`. Landing pages come only from the live
paid SERP block (`ad_live_serp_observations`, currently **0 rows**), which needs
the SerpApi gate cleared: the free account check on `/ads` promotes
`cap.serpapi_ads_transparency` at no credit cost, and the metered rules follow.
