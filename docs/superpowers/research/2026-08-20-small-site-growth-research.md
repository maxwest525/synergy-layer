# Small-site growth research — discovery vs. defect

Date: 2026-08-20. Compiled for the rule-thresholds work. Source hierarchy per
`.claude/skills/seo-measurement/SKILL.md`: (1) Google's own documentation, (2) published
research with a method, (3) everything else is opinion, not citation. Every quote below is
verbatim from the cited page as fetched 2026-08-20; documentation moves — re-verify before
hard-coding.

Context this serves: a site at ~500 GSC impressions / 28 days across 48 pages. At that
volume nearly everything is a **discovery** problem, not a ranking problem. The app must
never say only "too low to measure" — it must say what gets a page to measurable, and it
must separate "not noticed yet" (growth action) from "actively hurting us" (defect).

---

## 1. What Google says drives discovery of new/unnoticed pages

### Links are the primary discovery mechanism

SEO starter guide — <https://developers.google.com/search/docs/fundamentals/seo-starter-guide>:

> "Google primarily finds pages through links from other pages it already crawled."

> "In fact, the vast majority of the new pages Google finds every day are through links,
> making links a crucial resource you need to consider to help your pages be discovered by
> Google."

> "In fact, the vast majority of sites listed in our results are found and added
> automatically as we crawl the web."

How Search Works — <https://developers.google.com/search/docs/fundamentals/how-search-works>:

> "Some pages are known because Google has already visited them. Other pages are discovered
> when Google extracts a link from a known page to a new page"

> "Still other pages are discovered when you submit a list of pages (a sitemap) for Google
> to crawl."

> "the vast majority of pages listed in our results aren't manually submitted for
> inclusion, but are found and added automatically when our web crawlers explore the web."

Implication for a 48-page site: an unnoticed page's first fix is a crawlable link from an
already-crawled page — internal linking is the one discovery lever fully under the
operator's control.

### Internal links and anchor text

Starter guide (same URL):

> "Links are a great way to connect your users and search engines to other parts of your
> site, or relevant pages on other sites."

Link best practices — <https://developers.google.com/search/docs/crawling-indexing/links-crawlable>:

> "Google uses links as a signal when determining the relevancy of pages and to find new
> pages to crawl."

> "Make your links crawlable so that Google can find other pages on your site via the links
> on your page."

> "Paying more attention to the anchor text used for internal links can help both people
> and Google make sense of your site more easily and find other pages on your site."

### Sitemaps

Starter guide: "you could also submit a sitemap—which is a file that contains all the URLs
on your site that you care about."

Ask Google to recrawl — <https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl>:

> "To request a crawl of individual URLs, use the URL Inspection tool."

> "If you have large numbers of URLs, submit a sitemap."

### Requesting indexing is not a guarantee, and it is slow

Same recrawl doc — these three quotes bound what the app may promise:

> "There's a quota for submitting individual URLs and requesting a recrawl multiple times
> for the same URL won't get it crawled any faster."

> "Requesting a crawl does not guarantee that inclusion in search results will happen
> instantly or even at all."

> "Crawling can take anywhere from a few days to a few weeks."

Starter guide, on change latency generally:

> "Every change you make will take some time to be reflected on Google's end. Some changes
> might take effect in a few hours, others could take several months."

### The two GSC states that mean "not noticed yet", verbatim

Page Indexing report — <https://support.google.com/webmasters/answer/7440203>:

> "Discovered - currently not indexed: The page was found by Google, but not crawled yet.
> Typically, Google wanted to crawl the URL but this was expected to overload the site;
> therefore Google rescheduled the crawl."

> "Crawled - currently not indexed: The page was crawled by Google but not indexed. It may
> or may not be indexed in the future; no need to resubmit this URL for crawling."

Note Google's own instruction in the second: *no need to resubmit*. An app that responds to
"Crawled - currently not indexed" by hammering the indexing API is contradicting the doc.

---

## 2. Things people believe move ranking that Google denies or qualifies

### Paid search → organic ranking: explicitly denied

Google Ads Help, "About measuring paid and organic search results" —
<https://support.google.com/google-ads/answer/3097241>:

> "Investment in paid search has no impact on your organic search ranking."

> "Google maintains a strict separation between our search business and our advertising
> business."

How Search Works (public site), ranking results —
<https://www.google.com/search/howsearchworks/how-search-works/ranking-results/>:

> "We never provide special treatment to advertisers in how our search algorithms rank
> their websites, and nobody can pay us to do so."

### Social media: not a documented ranking signal

Google's developer docs contain **no statement that social signals rank pages**. The
starter guide's promotion section leads with word of mouth, not social:

> "One of the most effective and lasting ways is word of mouth: that is, people familiar
> with your site tell their friends about it."

Google-rep statements (tier 3 — secondary reporting of Googlers, not documentation):
John Mueller 2016, "No, I'd use links to social media as a way to add value to users, not
in the hope that they improve rankings"; Gary Illyes 2017, social links count "as much as a
single drop in an ocean" of PageRank; consistent denials 2010–2024.
<https://www.seroundtable.com/google-social-signals-ranking-20803.html>,
<https://www.searchenginejournal.com/ranking-factors/social-signals-rankinng-factor/>.

App consequence: social is a legitimate **referral-traffic and discovery** channel (a
crawlable link anywhere Google crawls is a discovery path; traffic is traffic), but no rule
may claim social activity improves ranking. Traffic ≠ ranking.

### Word count

Starter guide:

> "The length of the content alone doesn't matter for ranking purposes (there's no magical
> word count target, minimum or maximum)."

### Meta keywords, heading order

Starter guide: "Google Search doesn't use the keywords meta tag." and, on headings, "from
Google Search perspective, it doesn't matter if you're using them out of order."

### Site/domain age

**No Google documentation statement found either way** — the denial exists only as
Google-rep statements (tier 3): John Mueller, 2017 and 2019 ("No, domain age helps
nothing"), via <https://www.seroundtable.com/google-domain-age-23697.html> and
<https://www.searchenginejournal.com/domain-age-impact/503596/>. Do not build a rule on
site age in either direction; note the correlational age data in §5, which measures page
age of winners, not an age signal.

---

## 3. Backlinks: current weight, and the bright line the app must never cross

### What the docs currently say links are

The link best practices doc (URL in §1) is the current wording:

> "Google uses links as a signal when determining the relevancy of pages and to find new
> pages to crawl."

"A signal" — not "an important signal." The starter guide's strong language ("crucial
resource") is attached to **discovery**, not ranking. The How Search Works public page
lists ranking dimensions as relevance, quality ("expertise, authoritativeness, and
trustworthiness"), and usability, without singling out links.

### The de-emphasis, 2023–2024 (tier 3 — Google reps via trade press, plus a documented doc diff)

- Gary Illyes, 2023 AMA: links are not a "top 3" ranking signal and haven't been "for some
  time." <https://searchengineland.com/links-google-search-ranking-factor-gary-illyes-432422>
- Gary Illyes, March 2024: "We need very few links to rank pages… Over the years, we've
  made links less important." <https://www.seroundtable.com/google-very-few-links-needed-rank-pages-37267.html>
- March 2024: Google removed "important" from its documentation's description of links as
  a ranking factor. <https://www.searchenginejournal.com/google-needs-very-few-links/514494/>

App consequence: backlink acquisition is defensible as a **discovery and referral** action
(tier 1 supports that directly); any copy claiming a specific ranking lift from links
overstates the current documentation.

### Link spam — what must never be recommended

Spam policies — <https://developers.google.com/search/docs/essentials/spam-policies>. Link
spam includes:

> "Exchanging money for links, or posts that contain links"

> "Exchanging goods or services for links"

> "Excessive link exchanges ('Link to me and I'll link to you') or partner pages
> exclusively for the sake of cross-linking"

Consequence clause, same doc:

> "Sites that violate our policies may rank lower in results or not appear in results at
> all."

Manual Actions report — <https://support.google.com/webmasters/answer/9044175> — lists the
matching manual actions: "Unnatural links to your site" ("Buying links or participating in
link schemes in order to manipulate ranking") and "Unnatural links from your site"
("Pattern of unnatural artificial, deceptive, or manipulative outbound links on your
site").

Hard rule for the app: never generate a recommendation involving payment, goods, services,
or reciprocity in exchange for links. Digital PR that earns an unpaid editorial link is
outside the prohibition; anything transactional is inside it.

---

## 4. "Actively hurting us" — what damages a site at any traffic level

Everything in this section is real at 500 impressions or 500,000; none of it needs traffic
statistics to detect. Each item: what Google says, doc URL, detection.

### 4.1 Manual actions

> "Google issues a manual action against a site when a human reviewer at Google has
> determined that pages on the site are not compliant with Google's spam policies."

> "If a site has a manual action, some or all of that site will not be shown in Google
> search results."

<https://support.google.com/webmasters/answer/9044175>
**Detect:** GSC Manual Actions report (also exposed via Search Console API). Recovery is a
reconsideration request; "Reconsideration reviews can take several days or weeks."

### 4.2 Security issues (hacked / social engineering / malware)

The Security Issues report covers "Hacked content… any content placed on your site without
your permission because of security vulnerabilities", "Malware and unwanted software", and
"Social engineering… content that tricks visitors into doing something dangerous."

> "Pages or sites affected by a security issue can appear with a warning label in search
> results or an interstitial warning page in the browser when a user tries to visit them."

<https://support.google.com/webmasters/answer/9044101>
**Detect:** GSC Security Issues report. Hacked content is also a spam policy: "Any content
placed on a site without permission, due to vulnerabilities in a site's security"
(spam-policies doc).

### 4.3 noindex where it shouldn't be

> "Google will drop that page entirely from Google Search results, regardless of whether
> other sites link to it."

<https://developers.google.com/search/docs/crawling-indexing/block-indexing>
**Detect:** crawl check for the meta tag / `X-Robots-Tag` header on pages meant to rank;
GSC Page Indexing report reason "URL marked 'noindex'" ("When Google tried to index the
page it encountered a 'noindex' directive and therefore did not index it"); URL Inspection
tool per page.

### 4.4 The robots.txt × noindex trap

> "For the `noindex` rule to be effective, the page or resource **must not** be blocked by
> a robots.txt file… If the page is blocked by a robots.txt file or the crawler can't
> access the page, the crawler will never see the `noindex` rule, and the page can still
> appear in search results."

Same URL as 4.3. Two distinct defects: robots.txt blocking a page meant to rank (How
Search Works lists "robots.txt rules preventing Googlebot's access to the page" among
crawl blockers), and robots.txt blocking a page you're trying to noindex (the noindex
becomes invisible).
**Detect:** crawl check of robots.txt against the URL list; GSC Page Indexing reason
"Blocked by robots.txt"; URL Inspection.

### 4.5 Soft 404s

> "The page request returns what we think is a soft 404 response. This means that it
> returns a user-friendly 'not found' message but not a 404 HTTP response code."
> — <https://support.google.com/webmasters/answer/7440203>

> "If the content suggests an error for Google Search, an empty page or an error message,
> Search Console will show a `soft 404` error"
> — <https://developers.google.com/search/docs/crawling-indexing/http-network-errors>

**Detect:** GSC Page Indexing reason "Soft 404"; crawl check for 200-status pages with
empty/error-like content.

### 4.6 Server and client errors degrading crawl

http-network-errors doc (URL above):

> "`5xx` and `429` server errors prompt Google's crawlers to temporarily slow down with
> crawling."

> "For Google Search, already indexed URLs are preserved in the index, but eventually
> dropped."

And for 4xx: "URLs that are already indexed and return a `4xx` status code are removed
from the index." with crawl frequency that "gradually decreases."
**Detect:** crawl check (status codes); GSC Crawl Stats / Page Indexing.

### 4.7 Doorway pages and scaled content abuse

Spam policies doc: doorway example — "Having multiple domain names or pages targeted at
specific regions or cities that funnel users to one page"; scaled content abuse — "Using
generative AI tools or other similar tools to generate many pages without adding value for
users." Both carry the "may rank lower in results or not appear in results at all"
consequence and are manual-action triggers.
**Detect:** no dedicated GSC report until a manual action lands — this is a **preventive
crawl/content check** (near-duplicate templated pages differing only by city/keyword).
Directly relevant to any app that generates pages at scale.

### 4.8 Intrusive interstitials

> intrusive dialogs and interstitials "make it hard for Google and other search engines to
> understand your content, which may lead to poor search performance."

Guidance: "Don't obscure the entire page with interstitials", "use banners that take up
only a small fraction of the screen"; legally mandated interstitials (consent, age gates)
are exempted.
<https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials>
**Detect:** rendered crawl check (viewport-coverage of overlays at load). No GSC report.

### 4.9 Cloaking

Spam policies: "Presenting different content to users and search engines with the intent
to manipulate search rankings and mislead users."
**Detect:** compare Googlebot-fetched HTML (URL Inspection) with user-agent fetch.

---

## 5. Published research with a method

Bar: stated sample size and method. Vendor-published but method-disclosed studies are
flagged as such — they sit between tier 2 and tier 3; treat their numbers as priors, not
thresholds.

### 5.1 Time-to-rank for new pages — Ahrefs 2017 and 2025 (vendor, method disclosed)

**2017 study** — <https://ahrefs.com/blog/how-long-does-it-take-to-rank/>: 2 million pages
first seen by the Ahrefs crawler one year prior, position history tracked. Finding: only
**5.7%** ranked in the top 10 within 1 year for at least one keyword; of those that did,
most took ~61–182 days.

**2025 study** (published 2025-05-15) —
<https://ahrefs.com/blog/how-long-does-it-take-to-rank-in-google-and-how-old-are-top-ranking-pages/>:
1M random URLs (Sept 2023) + 2M random URLs (created Oct 2023), plus 1.3M random US
keywords for the age analysis. Findings:

> "Only 1.74% of newly published pages rank in the top 10 within a year"

> "40.82% of pages that ranked in the top 10 did so within 1 month"

> "72.9% of pages in Google's top 10 are more than 3 years old" / "The average #1 ranking
> page is 5 years old"

Method caveats to carry with any use: "first seen by Ahrefs crawler" is a proxy for
publish date; random web pages include vast junk, so 1.74% is a floor, not an expectation
for deliberate content; correlational (old pages ranking ≠ age as a signal — survivorship).
What it does defensibly support: **months-scale patience windows** and Google's own
"several months" latency quote. A page not ranking at 8 weeks is *normal*, not failed —
consistent with the SKILL.md rule that a two-week window must report "not yet", never
"failure".

### 5.2 Social referral traffic as a discovery path — no defensible research found

No study with a stated method and sample was found separating social-driven *referral
traffic* from subsequent *organic ranking* change for small sites. Everything located was
vendor content marketing asserting correlation. Google's docs support the narrow claim
only (crawlable links anywhere are a discovery path; ads/social are not ranking inputs —
§1, §2). Treat any stronger claim as unverified.

### 5.3 Digital-PR / backlink-acquisition outcomes — no defensible research found

No controlled or method-stated study on digital-PR campaign outcomes (links earned →
measured organic change, with sample sizes) was located that isn't a vendor case study
with survivorship bias. The app should describe backlink acquisition as
documentation-supported for **discovery** (§1) and decline to promise ranking outcomes.

---

## Unverified / tier-3 claims used above (kept out of rules unless re-sourced)

- Social signals not a ranking factor — Google reps via trade press, not docs (§2).
- Domain age helps nothing — Mueller tweets via trade press, not docs (§2).
- Links "not top 3" / "we need very few links" — Illyes remarks via trade press; the
  March 2024 doc-wording change is real but the significance is interpretation (§3).
- Ahrefs percentages — vendor-published; method disclosed but proxies and survivorship
  apply (§5.1).
- "The 2017 5.7% figure is outdated because ranking got harder" — Ahrefs' own framing of
  its two snapshots; the datasets differ in construction, so the trend is suggestive, not
  measured.

---

## Taxonomy: not noticed vs. hurting us

| Not noticed (discovery problem — growth action) | Hurting us (defect — fix immediately) |
|---|---|
| No internal links pointing at the page → add crawlable links from crawled pages ("Google primarily finds pages through links from other pages it already crawled" — seo-starter-guide) | Manual action pending → fix all affected pages, request reconsideration ("some or all of that site will not be shown" — support/9044175) |
| Page missing from sitemap → include and submit ("submit a list of pages (a sitemap) for Google to crawl" — how-search-works) | Security issue flagged (hacked/social engineering/malware) → clean and request review ("can appear with a warning label… or an interstitial warning" — support/9044101) |
| "Discovered - currently not indexed" → wait / improve internal linking; crawl was rescheduled (support/7440203) | Stray noindex on a page meant to rank → remove ("Google will drop that page entirely" — block-indexing) |
| "Crawled - currently not indexed" → improve the page; do NOT resubmit ("no need to resubmit this URL" — support/7440203) | robots.txt blocking a ranking page, or blocking a page carrying noindex → fix rules ("the crawler will never see the noindex rule" — block-indexing) |
| Not yet requested → URL Inspection request, once ("requesting a recrawl multiple times… won't get it crawled any faster" — ask-google-to-recrawl) | Soft 404 on a real page → return real content or a real 404 ("user-friendly 'not found' message but not a 404 HTTP response code" — support/7440203) |
| Inside normal latency window → wait; months-scale is normal ("a few days to a few weeks" to crawl; changes "could take several months" — Google; 40.82% of eventual top-10 pages took ≤1 month, most take longer — Ahrefs 2025) | Recurring 5xx/429 → fix server; crawl slows and indexed URLs are "eventually dropped" (http-network-errors) |
| Zero external links anywhere → earn unpaid editorial links; social/other sites as crawl paths, never as a "ranking" claim ("vast majority of the new pages Google finds every day are through links" — seo-starter-guide) | Mass templated near-duplicate pages (doorway/scaled-content pattern) → consolidate before it draws a manual action ("funnel users to one page"; "many pages without adding value" — spam-policies) |
| Missing row in GSC → unknown, not zero ("Search Console stores top data rows and not all data rows" — support/96568, via SKILL.md) | Full-page interstitial → shrink to banner ("may lead to poor search performance" — avoid-intrusive-interstitials) |
| — | Any paid/reciprocal link acquisition in a recommendation → never emit ("Exchanging money for links…" — spam-policies; "Buying links or participating in link schemes" — support/9044175) |
