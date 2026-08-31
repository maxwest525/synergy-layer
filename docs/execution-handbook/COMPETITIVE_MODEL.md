---
id: 20260828-competitive-model
title: Competitive Model
tags: [governance, seo, competitors, scope]
created: 2026-08-28
updated: 2026-08-28
related:
  [
    20260814-execution-handbook-index,
    20260814-source-of-truth,
    20260814-evidence-policy,
    20260814-detection-rules,
  ]
summary:
  Who TruMove competes with in search, why per-domain analysis misreads it, and
  the scope decisions that follow.
---

# Competitive model

Who TruMove competes with in search, why the obvious answer is wrong, and what
the system is therefore required to do.

Established with the operator 2026-08-28. This file is doctrine: a rule here
outranks an implementation's convenience. Where code disagrees with this file,
the code is wrong.

---

## 1. What TruMove is

**A nationwide long-distance moving broker.** Not a local business.

This single fact removes a whole category of work that generic SEO practice
would otherwise insist on:

- **Local SEO is out of scope.** Google Business Profile, local pack, review
  platforms, "near me" optimization, citation building, service-area pages
  built around a city radius — none of it applies. A long-distance move is
  chosen nationally, not by proximity.
- Provider capabilities serving local search are therefore **declined, not
  missing**. DataForSEO's Business Data family (14 endpoints), its Local SERP
  endpoints, and OpenSEO's three local tools are out of scope by decision.
  An audit that reports them as gaps is reporting a gap that does not exist.

A prior audit ranked "local SEO: zero coverage" as a leading finding. That was
wrong, and it was wrong in the expensive direction: it would have sent a session
building a capability the business cannot use.

---

## 2. The market has four layers, and they are not four competitors

| Layer | What they do | Compete with TruMove for customers? | Compete in search? |
|---|---|---|---|
| **Lead vendors** | Generate moving leads and sell them to brokers and carriers | No — often upstream suppliers | **Yes, hardest** |
| **Brokers** | Sell and coordinate moves without owning trucks. TruMove is one. | Yes | Partly |
| **Carriers** | Own the trucks, perform the move | Rarely — they buy leads downstream | Mostly no |
| **Publishers / directories** | Rank and refer, sell placement | No | Occupy the SERP |

The critical asymmetry: **business competition and search competition are
different questions with different answers.** A lead vendor may simultaneously
be a supplier to TruMove and its most dangerous organic rival. A carrier may be
a peer in the industry and irrelevant in the SERP.

Any model that collapses these into one axis is wrong. The system therefore
carries **two independent classifications** per domain and must never derive one
from the other:

- `domain_class` — SERP-derived, heuristic: does this domain rank alongside us.
- `company_classification` — operator-declared: what this business actually is
  (`carrier` · `broker` · `lead_vendor` · `publisher_directory` · `other`).

A ranking rival is never promoted to a business classification by inference.

---

## 3. Lead vendors are the true search competitors

The operator's position, and the model the system adopts:

Lead vendors build landing pages for the sole purpose of capturing high-intent
search traffic and reselling the lead. They carry no operational burden — no
trucks, no crews, no claims, no service-area constraints — so every dollar goes
into content and links. They run paid and organic together on the same terms.
For a query like "long distance movers <state> to <state>", the pages ranking
are disproportionately theirs.

This is why "who outranks us" answered from SERP position alone produces a list
that looks like competitors and is really a list of lead vendors, directories,
and one or two genuine brokers, undifferentiated.

**Refinement the system must preserve, so this does not become its own dogma:**
lead-vendor status is a *weighting*, not an exclusion. Some brokers compete
fully. Some carriers hold direct-to-consumer brands that rank. The
classification adjusts how a domain is weighed; it never decides membership on
its own.

---

## 4. The competitive unit is the ranking page

**The competitor is the landing page, not the company and not the domain.**

Google ranks pages. A SERP position belongs to a URL. TruMove does not outrank
Equate Media; it outranks a specific page, for a specific query, and the work
that changes that outcome is page against page. Any analysis whose unit is the
company answers a question nobody can act on.

This is most obvious with lead vendors, whose whole method is the template: one
operator spins up hundreds of near-identical state-to-state landing pages. On
"movers CA to TX" you face one of those pages. On "movers NY to FL" you face a
different one -- possibly a different domain, possibly the same owner. Rolling
those into a single company-level share figure destroys the only detail that
tells you what to do.

So the model is **page → domain → owning organization**, with the page as the
unit of analysis and the two above it as attributes carried along:

1. **Observation, comparison and action all happen at page level.** What is on
   their page that is not on ours, for the query where they beat us.
2. **Domain and owner are grouping attributes, not units.** They earn their
   keep in one specific way: recognising a template. Forty ranking pages sharing
   an owner and a structure is one playbook, not forty problems. That is pattern
   intelligence about *how* a competitor operates, and it is secondary to the
   page-level comparison, never a substitute for it.
3. **Ownership is operator-declared.** Evidence may suggest a link, never assert
   one. `whois/overview` (registrant organization, registrar, nameservers) and
   `technologies/domain_technologies` (shared stack) -- both already called by
   AOOS -- plus shared referring-domain patterns are suggestions worth an
   operator's attention, and nothing more.
4. **Coverage is the metric that matters, not sampling.** A pass that observes
   one page per domain is not page-level analysis wearing a different name. If a
   competitor ranks against the approved keyword set on forty pages, forty pages
   is the work.

**The ownership candidate queue, added 2026-08-31.** Point 3 above is now backed
by a concrete table, `domain_ownership_candidates`
(`supabase/migrations/20260831120000_domain_ownership_candidates.sql`), built to
the same pending/confirmed/rejected shape `ad_advertiser_candidates` already
uses for advertiser identity claims:

- Two rules populate it, both in `src/lib/dataforseo/discovery-rule-checks.ts`
  and `discovery-findings.server.ts`:
  `same_registration_details_across_two_known_domains` (an exact match on
  `whois/overview`'s registrar, creation timestamp, or expiration timestamp
  between two domains this tenant already tracks or has reviewed as a
  competitor) and `identical_technology_stack_across_two_known_domains` (an
  exact match on `domain_technologies`'s stored stack between the same set of
  domains).
- **A row is a candidate, never a fact.** `rule`, `domain_a`, `domain_b`,
  `matched_fields` (which field or fields matched, the shared value, and how
  many known domains share it -- no similarity score, no cut-off: either a
  field is exactly equal on two present values, or it is not a match at all)
  and `evidence` (snapshot ids, collection dates, and -- for the technology
  match -- whether both reads happened on the same day) sit beside
  `review_state`, defaulting to `pending`.
- **Only an explicit operator confirmation action may set `review_state` to
  `confirmed`.** No rule, writer, or scheduled job in this codebase writes
  `confirmed` or touches `company_classification` from a match here. A
  `rejected` row stays as a record that the operator looked and said no, the
  same way a rejected `competitor_candidates` row does.
- **What is still missing**, tracked as `CODE-25` in `docs/context/BACKLOG.md`:
  no operator control triggers the whois read
  (`collectWhoisOverviewForKnownDomains` exists and is tested, but nothing
  calls it), and no page yet reviews a pending row and writes the confirm or
  reject decision. Until both exist, the two rules above are correctly silent
  for a whois match (their `whois_collection` prerequisite in
  `rule-buckets.ts` is unmet) and functionally inert for a technology match
  once the collector is finally pointed at more than the owned property.

**Corrections this section records**, both found in the code on 2026-08-28:

- `competitor-intelligence.server.ts` profiles by domain and treats URLs as a
  subordinate field capped at five. Its `serpShare` is computed per domain.
- `competitor-pages.server.ts` does hold a genuine page-level observation model
  -- page type, intent match, heading structure, schema, CTAs, quote forms,
  review signals, FAQ blocks, topical coverage against a moving-industry
  vocabulary, and repeated tactics across domains. It is capped at **one page
  per shortlisted domain**, gated behind a domain-level shortlist of six, wired
  to `requireFirecrawl()` so it throws wherever Firecrawl is the unavailable
  renderer rather than falling back to Crawl4AI, and writes to
  `knowledge_entries` rather than to any finding an operator would see.

An earlier draft of this section named the owning organization as the
competitive unit. That was wrong, and it was wrong in a way worth keeping on the
record: the ownership insight is real, and it still does not make the company
the thing you compete with.

## 5. How competitors are discovered

Discovery has three inputs. The system is required to use all three, because
each is blind where the others see.

**a. Operator knowledge — the strongest input.**
The operator names the lead vendors he knows from working the industry. Under
the project's evidence rules, operator-verified research outranks heuristic
inference, so a declared competitor is treated as fact and needs no
corroboration to enter the set.

**b. Ads transparency — who is buying the terms.**
Ads Transparency Center (via SerpApi, already registered as
`cap.serpapi_ads_transparency`) reveals which advertisers run ads against the
approved keyword set and what landing pages those ads point at.

> **Ads transparency finds paid, not organic.** A vendor's paid landing pages
> are frequently not its ranking pages. Transparency answers *who* and *what
> they are willing to pay for*. It is a discovery seed, and the organic footprint
> must then be read separately. Treating a transparency result as an organic
> finding is a category error.

**c. Keyword-overlap discovery — who is actually ranking.**
`dataforseo_labs/competitors_domain` and `domain_intersection` (both already
called by AOOS) and OpenSEO's `find_serp_competitors` surface domains whose
keyword footprint overlaps TruMove's — including competitors nobody thought to
name.

**The failure this replaces:** discovery previously ran only over domains
appearing in SERPs for keywords the operator had *already approved*. A rival
dominating a term nobody had thought of was structurally invisible. Discovery
must not be bounded by the existing keyword list.

---

## 6. Standing scope decisions

Recorded here so they are not re-proposed. Each is a decision, not an
unfinished task.

| Decision | Reason |
|---|---|
| **Local SEO is out of scope** | Nationwide long-distance mover. See §1. |
| **Google data does not route through OpenSEO** | OpenSEO exposes two Google tools; AOOS reads Search Console directly and holds three GA4 APIs. Routing through the wrapper narrows both surfaces and meters free data. See `docs/integrations/openseo/DIGEST.md`. |
| **OpenSEO is a DataForSEO front end** | It is not a crawler. Crawl4AI and Firecrawl are the crawlers. |
| **Google Ads, Adloop, OpenAI Ads, Bing, Meta are the paid track** | Separate concern from organic. Ads Transparency is used here only as competitor discovery evidence, not as paid-campaign management. |
| **Any Google integration must use an OAuth web client** | The operator's GCP organization enforces `iam.disableServiceAccountKeyCreation`; service-account JSON keys do not work on this account. |

---

## 7. What this file forbids

- Reporting local-search capability as a gap.
- Inferring a business classification from SERP position.
- Inferring corporate ownership without operator confirmation.
- Treating the company or the domain as the competitive unit. The ranking page
  is the unit; domain and owner are attributes carried along with it.
- Sampling one page per domain and calling the result page-level analysis.
- Bounding competitor discovery to the approved keyword list.
- Presenting an ads-transparency result as evidence of organic ranking.
- Routing competitor evidence into page-wording generation as its only consumer.
  Evidence about who competes must reach the competitive analysis first.

That last one is not hypothetical. Ads Transparency data was wired into
`page-wording-proposals` with `role: "corroboration"` and reached the competitor
engine nowhere: evidence about who was advertising against TruMove was used to
help word a headline. Operator classification had the same fate — written by the
operator, read only by the dropdown that displays it. Page observations have a
third variant of it: `competitor-pages.server.ts` files real findings about
competitor landing pages into `knowledge_entries`, where no operator surface
reads them.

The pattern across all three is one thing: evidence is collected competently and
then routed somewhere it cannot act. Wiring an analysis to a consumer is not a
finishing touch on this project. It is the part that keeps being skipped.
