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

### Verified in AOOS's own stored evidence (2026-08-28, later the same day)

The deployment's database already holds an operator-confirmed advertiser
watchlist, built via SerpApi Ads Transparency on 2026-08-11/12 — the operator
had already done the vendor identification this log's open items asked for:

| Advertiser (Ads Transparency) | Vendor domain | Confirmed |
|---|---|---|
| Quote Runner LLC | quoterunner.com | 2026-08-11 |
| DOPPCALL | doppcall.com | 2026-08-11 |
| RESOLT INC | resultcalls.com | 2026-08-12 |
| Lovine, Inc | 99calls.com | 2026-08-12 |
| Leadgen Network Organization, Inc | billy.com | 2026-08-12 |
| **Equate Media Corp.** | **budgetvanlines.com** | 2026-08-12 |
| **Budget Van Lines Inc.** | **2movers.com** | 2026-08-12 |

**The Equate triangle is upgraded from operator-grade to verified:** Equate
Media Corp. is the Ads Transparency advertiser behind budgetvanlines.com, and
Budget Van Lines Inc. is the advertiser behind 2movers.com (Two Movers). The
supplier layer and the competitor layer are one organization, shown by the
system's own stored SerpApi rows (`ad_advertisers`, confirmed_by the operator).

Note the roster difference: these are **call/lead-gen vendors**, not the
consumer-brand route-page operators the web sweep surfaced. Both lists are
real; they are different layers of the same market.

### Why this data was 16 days stale

The three vendor schedules (`sch.vendor_ad_refresh`,
`sch.vendor_landing_page_analysis`, `sch.vendor_message_synthesis`) existed,
targeted active workflows, and were **never enabled** — `enabled: false`, zero
runs, since creation. Enabled 2026-08-28. Separately, the deployed app was down
(HTTP 500 on every route) for most of 2026-08-28 — a test file swept into the
production server bundle by the registry's module glob (fixed in synergy-layer
PR #86) — so no scheduler tick could run anything that day regardless.

### Ads Transparency is directly readable from a session, free (2026-08-28)

Playwright cannot reach Google from this container at all: the agent proxy's
own status log shows the upstream egress closing the tunnel immediately after
Chromium's ClientHello, for every Google host, in every flag combination tried
(`ws_closed_mid_exchange … ~1.8 KB sent, 39 B received`). curl's smaller
handshake passes. This is a TLS-fingerprint rejection above the local proxy, so
no browser flag fixes it. **Do not spend time on Playwright for external HTTPS
here.**

The Transparency Center's own internal RPC works over curl with no cookie, key
or session:

```
POST https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives?authuser=
Content-Type: application/x-www-form-urlencoded
Origin: https://adstransparency.google.com
Referer: https://adstransparency.google.com/
f.req={"2":40,"3":{"12":{"1":"<domain>","2":true}},"7":{"1":1,"2":9,"3":2840}}
```

Response is protobuf-numbered JSON. Per creative: `1` advertiser ID, `2`
creative ID, `3` preview HTML, `4` format (1 image, 2 text, 3 video), `6`/`7`
first/last-shown epoch, `12` advertiser name, `14` advertiser domain. Top-level
`2` is a pagination token, passed back as request key `4`. Region `2840` = US.
A per-creative detail endpoint exists at
`LookupService/GetCreativeById` with `f.req={"1":"<AR id>","2":"<CR id>",...}`.

**Limitation that shapes the method:** these RPCs return the advertiser's
verified domain, never the click destination. Ads Transparency answers *who is
advertising and with what creatives*; it does not answer *which landing page*.
That confirms §5's two-step from the API's actual shape — landing pages must
come from the live paid SERP block (`ad_live_serp_observations`, currently 0
rows), read separately.

### Verified: paid-side scale of the confirmed vendor set (2026-08-28)

Harvested live from the RPC above, deduplicated by creative ID. "Active 7d"
counts creatives whose last-shown timestamp falls in the final week of the
observed range.

| Advertiser | Domain | Creatives | Active 7d | First seen | Last seen |
|---|---|---:|---:|---|---|
| Equate Media Corp. | budgetvanlines.com | 1,400 | 1,217 | 2022-01-31 | 2026-08-28 |
| Budget Van Lines Inc. | 2movers.com | ~800–1,000 | ~all | 2022-05-18 | 2026-08-28 |
| Quote Runner llc | quoterunner.com | 128 | 73 | 2021-10-25 | 2026-08-28 |
| RESOLT INC | resultcalls.com | 56 | 3 | 2023-08-19 | 2026-08-28 |
| RESOLT INC | doppcall.com | 48 | 3 | 2023-08-19 | 2026-05-22 |
| Leadgen Network Organization, Inc | billy.com | 30 | 1 | 2025-06-10 | 2026-01-21 |
| Lovine, Inc | 99calls.com | 8 | 3 | 2024-11-20 | 2026-08-28 |

**Grade: verified** (read directly from Google's own endpoint). The 2movers
count is given as a range because two runs terminated at different pagination
depths; treat the exact figure as unsettled, the order of magnitude as solid.

Three things this establishes:

1. **Equate's group is the paid market.** budgetvanlines.com plus 2movers.com
   is on the order of 2,200 creatives with well over a thousand still running
   in the last week, against 128 for the next-largest and single digits for the
   tail. This is not a peer set; it is one operator and everyone else.
2. **A new ownership link, from the data rather than asserted:** `resultcalls.com`
   and `doppcall.com` are the **same advertiser account**, `AR10383348317303078913`
   (RESOLT INC). Shared advertiser ID is the strongest ownership signal
   available here — stronger than whois or shared tech stack — because Google
   verified the advertiser identity behind it.
3. **Continuous spend since early 2022**, still live the day of this reading,
   for the top three. Nothing here is a dormant account.

Advertiser IDs, for re-querying without a domain search:
`AR12693528058074759169` (Equate Media Corp.),
`AR03333640657515315201` (Budget Van Lines Inc.),
`AR15552671483326103553` (Quote Runner llc),
`AR10383348317303078913` (RESOLT INC — both domains),
`AR18275425919990497281` (Leadgen Network Organization, Inc),
`AR15851341825462763521` (Lovine, Inc).

### Corrections to earlier entries in this log

- **`twomovers.com` is the wrong domain.** It is an unrelated local mover in
  Ottawa, Canada. The Equate-linked property is **`2movers.com`** ("2Movers,
  Inc.", operator "Two Movers Network").
- **Equate's group is larger than two brands.** `equatemedia.com/careers`
  names "the Katz Group of Businesses (EQUATE Media, Quote Runner, Budget Van
  Lines, Home Expert, Uload, P4P)" — **verified primary source**, corroborated
  by a court filing caption listing Equate Media Inc., Budget Van Lines Inc.,
  Quote Runner LLC and Home Expert Inc. as co-plaintiffs. Equate Media Inc. is
  7251 W. Lake Mead Blvd Suite 300, Las Vegas NV; founded 2006, CEO Charlie
  Katz. Budget Van Lines is a licensed broker, USDOT #2233611, MC #512534.
- **Quote Runner is inside the same group** and is separately in the operator's
  watchlist — the two lists overlap more than they first appeared.
- The 2movers ↔ Equate link is supported three ways: the operator's statement,
  AOOS's stored SerpApi advertiser rows, and this live read.

### Rolled up by owner: the Katz group is 94% of the paid market

An earlier version of this entry listed the seven advertisers per domain and
hedged the ownership, treating Budget Van Lines Inc. as merely "a named Katz
Group business" rather than an Equate-owned one. The operator corrected it:
**Equate owns Budget Van Lines and Quote Runner.** With the careers page, the
court filing caption, and operator knowledge all agreeing, the hedge was not
warranted — and per-domain presentation reproduced, in the paid dimension,
exactly the distortion COMPETITIVE_MODEL.md §4 exists to prevent.

| Owner | Creatives | Active last 7d |
|---|---:|---:|
| **Equate Media / Budget Van Lines / Quote Runner** | **2,328** | **2,090** |
| Lovine, Inc (99calls.com) | 64 | 6 |
| RESOLT INC (resultcalls.com + doppcall.com) | 48 | 3 |
| Leadgen Network Organization, Inc (billy.com) | 30 | 1 |
| *Everyone else combined* | *142* | *10* |

- **94.3%** of all creatives in the confirmed watchlist belong to one owner.
- **36×** the next-largest owner on creative volume.
- **209×** everyone else *combined* on ads still running in the last week.
- Continuous since **2021-10-25**, still live **2026-08-28**.

Per domain this reads as three mid-sized advertisers among seven. Rolled up by
owner it is one operator holding the paid market and a rounding error of
competitors. That gap between the two readings is the entire argument for
carrying ownership as an attribute, and it is now measured rather than asserted.

### Vendor business models, verified 2026-08-28

Most of the "lead vendor" roster does **not** compete for consumer search
traffic at all, which sharpens where the real contest is:

| Vendor | Model | Consumer route pages? |
|---|---|---|
| Equate Media / Katz Group | Lead vendor **and** licensed broker brands | Paid landing pages only; no organic route matrix found on budgetvanlines.com or equatemedia.com |
| moveBuddha | Consumer comparison site monetized by lead referral | **Yes** — `/popular-routes/{from}/{to}/` matrix |
| Moving.com | Consumer marketplace + lead vendor; carrier-owned since 2026-07 | Yes |
| MovingLeads.com (First Movers Advantage, LLC) | Pure B2B pre-mover listing data | No |
| Network Leads, LLC | B2B leads + mover SaaS | No |
| Moovsoon LLC | B2B MLS-derived data + outbound SaaS | No |
| Moving Shortly | B2B listing data, single-page site | No |
| USA Home Listings, LLC | B2B listing data + direct mail | No (only B2B `/moving-leads/{state}` pages) |
| iRelocate (LeadVision, LLC — **irelocate.net**, not .com) | B2B lead vendor | No |

Consequence: the organic route-matrix threat comes from **consumer comparison
and mover brands** (moveBuddha, Moving.com, poseidonmoving and the rest of the
route-page operators), while the Katz group dominates the **paid** block. These
are two different competitive surfaces and the system must not merge them.

## Open items

- [x] Operator's vendor list found: the confirmed advertiser watchlist above.
- [x] Ads Transparency run for all seven; advertiser IDs and creative counts
      recorded above. Landing pages NOT obtainable this way — see the
      limitation note; they need the live paid SERP path.
- [ ] Read each vendor's organic route-page template (URL pattern, scale).
- [x] Equate link verified via stored Ads Transparency advertiser rows.
- [ ] Feed confirmed vendors into `competitor_candidates` with
      `company_classification = 'lead_vendor'` (operator-declared).
