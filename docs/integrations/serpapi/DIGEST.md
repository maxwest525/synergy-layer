# SerpApi — Google Ads Transparency Center — AOOS Documentation Digest

- **Provider:** SerpApi (`https://serpapi.com/search`)
- **Digest version:** 1.0.0
- **Retrieval date:** 2026-08-10
- **Capability:** `cap.serpapi_ads_transparency` — declared, not yet implemented
- **Status:** pending credential and operator approval. No integration code written yet.

Every field below is taken from a fetched official page. Anything not confirmed by a
fetched page is marked UNVERIFIED. No secrets are recorded in this file.

## 1. Authoritative sources reviewed

| Source | URL |
|---|---|
| Ads Transparency Center API | https://serpapi.com/google-ads-transparency-center-api |
| Ads Transparency Center Ad Details API | https://serpapi.com/google-ads-transparency-center-ad-details |
| Google Search ads block | https://serpapi.com/google-ads |
| Pricing and throughput | https://serpapi.com/pricing |
| Legal / terms | https://serpapi.com/legal |

## 2. Endpoints

| Purpose | Engine |
|---|---|
| List / search ads by advertiser or free text | `engine=google_ads_transparency_center` |
| Full detail for one creative | `engine=google_ads_transparency_center_ad_details` |
| Live paid SERP (ads block) | `engine=google` |

There is no separate "advertiser lookup" endpoint. Advertiser resolution is implicit:
a free-text search returns creative rows, each carrying its own `advertiser_id`.

## 3. Advertiser resolution semantics

- `advertiser_id` — Google's ID, format `AR` + 20 digits, e.g. `AR17828074650563772417`,
  visible in `adstransparency.google.com/advertiser/<ID>`. Accepts comma-separated IDs.
- `text` — free-text or domain search. **The API does not disambiguate.** A domain may
  return creatives from several distinct `advertiser_id` values. Grouping and candidate
  selection is the caller's responsibility.
- List rows expose `advertiser_id` and `advertiser` (name). There is no verification flag
  at list level.
- Detail responses expose `ad_funded_by` (the "Ad funded by" payer disclosure) and
  `is_verified` (boolean).

## 4. Creative listing payload (`ad_creatives[]`)

`advertiser_id`, `advertiser`, `ad_creative_id`, `format` (`text` | `image` | `video`),
`link`, `target_domain`, `image`, `width`, `height`, `total_days_shown`,
`first_shown` (Unix epoch), `last_shown` (Unix epoch), `details_link` (Google ATC URL),
`serpapi_details_link`.

Political ads only: `minimum_views_count`, `maximum_views_count`,
`minimum_budget_spent`, `maximum_budget_spent` (bucketed ranges, e.g. `"4500 USD"`).
UNVERIFIED: Google's bucket boundaries and methodology.

Pagination: `serpapi_pagination.next_page_token`, `serpapi_pagination.next`; request
params `num` (default 40, up to 100 observed) and `next_page_token`.

Filters: `region` (numeric geo code), `start_date` / `end_date` (`YYYYMMDD`),
`creative_format` (`text` | `image` | `video`), `platform`
(`PLAY` | `MAPS` | `SEARCH` | `SHOPPING` | `YOUTUBE`), `political_ads` (requires `region`).

## 5. Ad detail payload

Required params: `advertiser_id`, `creative_id` (format `CR` + digits). Optional: `region`.

`search_information.regions[]` carries `region`, `region_name`, `first_shown`,
`last_shown`, `times_shown`. Top level also returns `ad_funded_by` and
`more_ads_by_advertiser`.

`ad_creatives[]` adds: `call_to_action`, `title`, `headline`, `long_headline`, `snippet`,
`visible_link`, `link`, `image`, `advertiser_logo`, `advertiser_logo_alt`,
`sitelink_texts[]`, `sitelink_descriptions[]`, `video_link`, `raw_video_link`,
`video_duration`, `thumbnail`, `height`, `width`, `channel_name`, `channel_icon`,
`rating`, `reviews`, `reviews_link`, `address`, `is_verified`, `extensions[]`,
`carousel_data[]`, `images[]`.

## 6. Live paid SERP observation (`engine=google`)

`ads[]` fields: `position`, `block_position` (`top` | `bottom` | `middle` | `right`),
`title`, `link`, `displayed_link`, `tracking_link` (Google `aclk` redirect),
`description`, `source`, `extensions[]`, `sitelinks[]` (`title`, `link`, `snippets[]`).

Targeting params: `location`, `device` (`desktop` | `tablet` | `mobile`), `gl`, `hl`.

This is a point-in-time snapshot only. It carries no advertiser identity beyond
`source` / `displayed_link`, and no history.

## 7. Caching, async, throughput

- `no_cache` (default `false`). Cache is served only on an exact query + parameter match
  and expires after 1 hour. **Cached searches are free and do not consume quota.**
  Cannot be combined with `async`.
- `async` (default `false`): submit now, retrieve from the Searches Archive API. Not
  usable with `no_cache`; disabled on Ludicrous Speed accounts.
- `zero_trace` (Enterprise only): SerpApi does not retain the query or results.
- Pagination is token based.

## 8. Pricing and rate limits

| Plan | Searches / month | Throughput / hour |
|---|---|---|
| Free | 250 | 50 |
| Starter $25 | 1,000 | 200 |
| Developer $75 | 5,000 | 1,000 |
| Big Data $275 | 30,000 | 6,000 |
| Enterprise | custom | custom |

- One successful request costs one credit regardless of how many items it returns.
- Cached, errored, and failed searches do not consume quota.
- Throughput is a guaranteed per-hour ceiling; SerpApi advises spreading calls evenly.
- Legal: SerpApi publishes a US Legal Shield for lawful scraping/parsing use. No clause
  found forbidding downstream storage of results. UNVERIFIED: long-term archival of
  competitor creative image and video binaries should be reviewed before we store them;
  Phase 1 stores URLs and text, not binaries.

## 9. What this provider does NOT give us

No ad spend, no impressions for commercial ads, no clicks, no conversions, no bids, no
keyword targeting, no audience targeting, no campaign structure, no ROI. Political ads
expose coarse bucketed view and budget ranges only.

**AOOS rule:** Transparency evidence answers *what an advertiser has run*. It never
implies performance. Long-running creatives are a durability signal only.
