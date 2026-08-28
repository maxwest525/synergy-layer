# Competitor research log

Live record of competitor research: who was found, how, and what was verified.
Started 2026-08-28 at the operator's direction ("you better be recording all of
this"). Doctrine — the rules this research operates under — lives in
[`docs/execution-handbook/COMPETITIVE_MODEL.md`](../execution-handbook/COMPETITIVE_MODEL.md).
This file is the evidence side: append-only, dated, sourced. Nothing here is a
recommendation.

Evidence grades used below, matching the Evidence Policy:
**verified** (primary source read directly) · **reported** (secondary source,
not independently confirmed) · **operator** (operator knowledge; treated as
fact under the evidence rules).

---

## 2026-08-28 — Session findings

### The operator's method, verbatim intent

1. Identify the moving lead vendors (operator will contribute his own list).
2. Run each vendor through **Ads Transparency** to see what ads they run and
   what landing pages the ads point at.
3. **SERP against the keywords and the actual pages generating leads** — the
   organic footprint is read separately from the paid one, page by page.

The competitor is the landing page, not the company (COMPETITIVE_MODEL.md §4).

### Verified: the route-matrix template pattern

Two web searches for different route queries ("long distance movers California
to Texas", "long distance movers New York to Florida") returned templated
route pages, same slug pattern, different states:

| Domain | CA→TX page | NY→FL page |
|---|---|---|
| movebuddha.com | `/popular-routes/ca/tx/` | `/popular-routes/fl/ny/` |
| poseidonmoving.com | `/california-texas-movers/` | `/new-york-florida-movers/` |

Both domains surfaced on **both** routes — the signature of a full route
matrix: `{from}×{to}` pages generated from a template, up to ~2,450 cells.
Other route-page operators observed on one route each: allied.com,
roadwaymoving.com, chipmanrelo.com, nor-calmoving.com, moveneatly.com,
move-and-care.com, whiteglovemoving.us, longislandmovingandstorage.com,
ssrelocation.com, greekmoving.com, freightwaves.com/checkpoint,
northamerican.com, mypieceofcakemove.com. **Grade: verified** (URLs read from
live search results, 2026-08-28).

Consequence for the build: the fight is per-route, page against page. A
domain-level view collapses ~2,450 cells into one number and destroys the
actionable detail. This is why `competitor-pages.server.ts`'s one-page-per-domain
cap is a fatal limit, not a performance setting.

### Verified: a lead vendor operating a broker brand

- **Equate Media** (equatemedia.com/moving) markets moving leads: "highly
  qualified long distance moving leads … over 2 million leads generated."
  **Grade: verified.**
- **Budget Van Lines** (budgetvanlines.com) describes itself as "the nation's
  largest household goods moving broker." **Grade: verified.**
- **Operator statement:** Two Movers and Budget Van Lines are both owned by
  Equate Media. **Grade: operator.** Web search did not independently confirm
  the Two Movers link; do not present it as third-party verified.

Structural significance: the supplier layer and the competitor layer can be the
same company. A vendor TruMove might buy leads from can simultaneously operate
a broker brand competing for the same customer.

### Reported: lead-vendor roster (starting list, unverified)

From industry directories (moversboost.com lists 58 providers;
connect.moversville.com maintains a provider directory). Each name below is
**reported** until its domain, ads, and organic footprint are read directly:

Equate Media · Moving.com · MoveAdvisor · Moovsoon · Moving Shortly ·
iRelocate · Network Leads · Moves 4 U · Leads AI · USA Home Listings ·
Buy Moving Leads · MovingLeads.com

The operator will supply his own list from industry knowledge; that list
outranks this one.

### Sources

- https://www.equatemedia.com/moving
- https://www.budgetvanlines.com/
- https://www.movebuddha.com/popular-routes/ca/tx/ and `/popular-routes/fl/ny/`
- https://poseidonmoving.com/california-texas-movers/ and `/new-york-florida-movers/`
- https://moversboost.com/moving-leads-providers-list/ (58-provider directory)
- https://connect.moversville.com/moving-leads/ and `/providers/biz/equate-media/`

---

## Execution constraints recorded 2026-08-28

Where research can actually run, so no session re-derives this:

- **The Claude Code container holds no provider credentials.** Its `.env` has
  only Supabase publishable values. DataForSEO, SerpApi, Crawl4AI and Firecrawl
  keys live in the Lovable deployment's secret store and never reach this box.
  Metered SERP calls therefore run inside AOOS, not from a session container.
- **The container CAN drive a real browser.** Chromium is pre-installed at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` with Playwright
  configured — public, login-free surfaces (Ads Transparency Center, live
  SERPs, vendor landing pages) are directly readable from a session.
- **Ads Transparency in-product** is registered as `cap.serpapi_ads_transparency`
  (SerpApi, metered, runs in the deployment). Browser-driven reading from a
  session is the free path; the SerpApi path is the governed, stored-evidence
  path. Findings that should persist belong in the deployment path.

## Open items

- [ ] Operator to contribute his known lead-vendor list (grade: operator).
- [ ] Run each vendor through Ads Transparency; record advertiser IDs, ad
      counts, and landing-page URLs per vendor.
- [ ] Read each vendor's organic route-page template (URL pattern, scale).
- [ ] Verify the Two Movers ↔ Equate Media ownership link independently.
- [ ] Feed confirmed vendors into `competitor_candidates` with
      `company_classification = 'lead_vendor'` (operator-declared).
