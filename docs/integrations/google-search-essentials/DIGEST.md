# Google Search Essentials, Search Console tooling, and structured data

Skim-level digest. Purpose is to decide what AOOS should actually do with
Search Console, not to wire every documented feature.

Sources read 2026-08-19:

- Spam policies for Google web search — support.google.com/webmasters/answer/9128668
- Get started with Search Console (role tracks) — support.google.com/webmasters/answer/9128669
- SEO Starter Guide — developers.google.com/search/docs/fundamentals/seo-starter-guide
- Rich Results Test — search.google.com/test/rich-results
- Key Search Console tools and reports — support.google.com/webmasters/answer/9133276
- Structured data gallery — developers.google.com/search/docs/appearance/structured-data/search-gallery
- Schema.org vocabulary

## The three layers Google actually describes

Google's own material splits into three layers, and AOOS currently touches
only the thinnest one.

**Layer 1 — Essentials (pass/fail eligibility).** Technical requirements
(Googlebot can fetch it, HTTP 200, indexable, no robots block), spam policies
(cloaking, scaled content abuse, doorway pages, thin affiliate, keyword
stuffing, link spam, site reputation abuse), and key best practices. This is
binary: fail it and nothing else matters. It is checkable per URL from data
we already store.

**Layer 2 — Strategy (the starter guide).** How Google finds and understands
pages: unique descriptive titles, meta descriptions that earn the click,
heading hierarchy, descriptive link text, image alt text, internal linking,
site structure and URL readability, avoiding duplicate content, helpful
people-first content. This is where the actual work lives, and every one of
these is a concrete page-level change our execution loop can already commit.

**Layer 3 — Enhancements (structured data).** JSON-LD from the Schema.org
vocabulary makes a page eligible for rich results. Eligibility is never
guaranteed; valid markup only qualifies the page. Google validates through
the Rich Results Test and reports aggregate state in the Rich result status
reports, and per URL in URL Inspection.

## Which structured data types matter for a moving company

The gallery is large; almost none of it applies to us. Relevant set:

- `LocalBusiness` / `MovingCompany` — name, address, phone, hours, service
  area, geo. The single highest-value markup for a mover.
- `Organization` — logo, sameAs profiles, contact points. Feeds knowledge panel.
- `BreadcrumbList` — on every service and location page.
- `FAQPage` — service pages that already answer questions in prose.
- `Service` — per relocation service offered.
- `Review` / `AggregateRating` — only with genuine first-party reviews, and
  self-serving review markup is a policy violation, so this stays gated.
- `Article` — blog posts only.

Everything else in the gallery (Product, Recipe, Job, Event, Course, Vehicle,
Software) is out of scope and should not be proposed.

## Search Console surfaces, mapped to what we already have

| Google surface | API reachable | AOOS state |
| --- | --- | --- |
| Performance report | `searchAnalytics.query` | wired, snapshotting daily |
| URL Inspection | `urlInspection.index.inspect` | wired, manual only on /search |
| Sitemaps | `sitemaps.list` / `.get` | wired, read only |
| Page Indexing report | no API | not reachable, must be inferred from per-URL inspection |
| Rich result status reports | no API | not reachable, must be inferred from per-URL inspection `richResultsVerdict` |
| Core Web Vitals report | no API | PageSpeed API is the substitute, currently quota blocked |
| Removals, Manual actions, Security | no API | operator must read these in Search Console directly |
| Rich Results Test | no public API | validation must be done locally against Schema.org, then confirmed by URL Inspection |

The honest conclusion: several reports the operator sees in the Search Console
UI have no API at all. AOOS reconstructs them URL by URL through URL Inspection,
which is rate limited, so it must be run against a prioritized page list rather
than the whole site.

## Where AOOS is falling short

1. **URL Inspection is manual and unused.** It already returns
   `coverageState`, `robotsTxtState`, `indexingState`, `pageFetchState`,
   `googleCanonical` vs `userCanonical`, `mobileUsabilityVerdict`, and
   `richResultsVerdict`. Nothing consumes those fields. Canonical mismatch and
   non-indexed verdicts are the highest-signal facts available to us and they
   are being stored and ignored.
2. **No Essentials compliance check exists.** We have no rule set that turns
   Layer 1 into pass/fail per page.
3. **No structured data awareness at all.** We never fetch a page's JSON-LD,
   never compare it to the relevant type set, and never propose markup, even
   though `site.structured_data` is already an allowed change kind.
4. **Layer 2 is reduced to title and H1.** Meta description, heading order,
   alt text, internal links, and link text are all documented, all fixable,
   all uncovered.
5. **No knowledge base entry.** These docs are not ingested into the knowledge
   store, so the proposal engine cannot cite them as authority for a change.

## Recommended sequencing

1. Consume the URL Inspection fields we already store: a per-page index health
   view driven by verdict, coverage state, and canonical mismatch.
2. Ingest Layers 1 and 2 as knowledge records so every proposal cites the
   specific Google rule it satisfies.
3. Add a structured data reader (Crawl4AI or Firecrawl fetch, parse JSON-LD),
   diff against the relevant type set, propose missing markup through the
   existing approval-gated `site.structured_data` change kind.
4. Widen page-level proposals beyond title and H1 to the rest of Layer 2.

Nothing here is implemented yet. No code was changed for this digest.
