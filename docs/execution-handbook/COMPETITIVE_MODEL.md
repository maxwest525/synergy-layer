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

## 4. One company can be many domains

**Two Movers and Budget Van Lines are both owned by Equate Media.**

This is the structural failure in any per-domain analysis. Computed per domain,
those two read as separate mid-sized players at roughly 8% SERP share each,
each possibly below a significance threshold, each consuming a shortlist slot.
The truth is one adversary at 16% share occupying two positions on the page.

Requirements that follow:

1. **The competitive unit is the owning organization, not the domain.** Share,
   significance and shortlisting roll up to the parent entity where one is
   known, and fall back to the domain where none is.
2. **Ownership is operator-declared.** Same rule as classification: evidence may
   *suggest* a link, it never asserts one.
3. **Ownership evidence comes from data already purchased.** Two DataForSEO
   Domain Analytics endpoints AOOS already calls are exactly the fingerprinting
   tools: `whois/overview` (registrant organization, registrar, nameservers)
   and `technologies/domain_technologies` (shared stack). Shared referring-domain
   patterns from the Backlinks family are a third signal. None is proof; all
   three together are a suggestion worth an operator's attention.
4. **A rolled-up figure must say it is rolled up.** An operator reading "16%"
   must be able to see it is two domains, which two, and who linked them.

---

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
- Computing competitive share per domain where an owning organization is known.
- Bounding competitor discovery to the approved keyword list.
- Presenting an ads-transparency result as evidence of organic ranking.
- Routing competitor evidence into page-wording generation as its only consumer.
  Evidence about who competes must reach the competitive analysis first.

That last one is not hypothetical. Ads Transparency data was wired into
`page-wording-proposals` with `role: "corroboration"` and reached the competitor
engine nowhere: evidence about who was advertising against TruMove was used to
help word a headline. Operator classification had the same fate — written by the
operator, read only by the dropdown that displays it.
