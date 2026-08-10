# SerpApi Ads Transparency — AOOS Integration Plan (Phase 1)

- **Plan version:** 1.0.0
- **Depends on:** `docs/integrations/serpapi/DIGEST.md` v1.0.0
- **Phase 1 posture:** read-only, evidence-first. No ad generation, no deployment, no
  recommendations until advertiser resolution, creative ingestion, landing-page evidence,
  and live paid SERP corroboration have all proven real data quality.

## 1. Capability

`cap.serpapi_ads_transparency` — single credentialed gate over every SerpApi call.
Responsibilities: hold the API key reference, enforce the per-run request budget and the
hourly throughput ceiling, and centralize cache policy. Default `no_cache=false`;
forced refresh is operator gated because it always burns a credit.

State: `pending` until the key is present and a live auth probe succeeds.

## 2. Modules

| Module | Responsibility |
|---|---|
| `ads.advertiser_resolution` | `text=<domain>` search, group rows by `advertiser_id`, write one `advertiser_candidate` per distinct advertiser. Never auto-select when ambiguous. |
| `ads.creative_intelligence` | Paginate `ad_creatives[]` for a confirmed advertiser, normalize, checksum, cluster into creative families, fetch ad detail only for unseen `ad_creative_id`s. |
| `ads.landing_page_intelligence` | Observe each unique destination via existing Firecrawl / Web Research: redirect chain, final URL, title/H1, offer, CTA, phone vs form, form length, trust badges, disclosures, urgency, tracking params, shared infrastructure. Observations only, never copied content. |
| `ads.live_serp_observation` | `engine=google` ads block for approved keywords across location and device. Point-in-time, explicitly non-historical. |
| `ads.vendor_network_analysis` | Derived only, no external calls. Shared `target_domain`, shared `ad_funded_by`, shared phone numbers and form templates across advertisers. |

## 3. Workflows

- `wf.vendor_ad_discovery` — vendor domain to advertiser candidates to operator gate to
  first creative crawl.
- `wf.vendor_ad_refresh` — scheduled per confirmed advertiser; cache friendly; detail
  fetch only for new creative IDs; updates `last_detected_at` and retires absent ones.
- `wf.vendor_landing_page_analysis` — for each new or changed destination, fetch once,
  hash, diff against the prior snapshot.
- `wf.vendor_message_synthesis` — normalizes stored creative text into the evidence
  fields below. Every claim footnoted with `ad_creative_id` and source URL.
- `wf.live_paid_serp_observe` — keyword sweep storing paid SERP snapshots, linkable to
  advertisers but stored as a separate evidence type.

## 4. Normalized storage

- `ad_advertisers(id, tenant_id, advertiser_id unique, advertiser_name, ad_funded_by, is_verified, confirmed_by, confirmed_at, source_url)`
- `ad_advertiser_candidates(id, tenant_id, query_text, advertiser_id, advertiser_name, evidence jsonb, status pending|confirmed|rejected, reviewed_by, created_at)`
- `ad_creatives(id, tenant_id, advertiser_fk, ad_creative_id unique, format, target_domain, link, headline, long_headline, snippet, call_to_action, sitelinks jsonb, image_ref, video_ref, content_checksum, regions jsonb, first_shown, last_shown, total_days_shown, first_detected_at, last_detected_at, retired_at, raw_payload jsonb, source_url, retrieved_at)`
- `ad_creative_families(id, tenant_id, family_key, representative_creative_fk, member_creative_ids text[], similarity_method)`
- `ad_destination_pages(id, tenant_id, creative_fk, url, final_url, redirect_chain jsonb, dom_hash, observations jsonb, fetched_at)`
- `ad_live_serp_observations(id, tenant_id, keyword, location, device, gl, hl, observed_at, ads_payload jsonb, source_url)`

All tables get GRANTs plus tenant-scoped RLS in the same migration, matching existing
registry tables.

## 5. Creative evidence normalization

Each creative is normalized into: main subject, consumer problem, promise, offer,
audience, trust mechanism, urgency, differentiator, CTA, brand vs generic positioning,
funnel type. Near-duplicate variants collapse into a creative family so twenty copy
tweaks do not read as twenty strategies. Tracked over time: new families, retired
creatives, format mix, refresh frequency, repeated headlines and offers, long-running
vs short-lived concepts.

## 6. Cost model

One credit per successful request; cached hits free. Budget knobs enforced in the
capability before dispatch:

| Knob | Default |
|---|---|
| `max_list_pages` per advertiser per run | 3 (about 300 creatives at `num=100`) |
| `max_detail_calls_per_run` | 50, new creative IDs only |
| `max_serp_keywords_per_sweep` | 40 (the approved keyword set) |
| `no_cache` | false, operator gated to enable |

Initial watchlist is 11 vendors. A first full discovery pass is roughly 11 resolution
calls plus up to 33 list pages plus bounded detail calls, comfortably inside a Developer
tier month. Exact plan tier is an operator decision at credential time.

## 7. Fingerprints and dedup

- Primary identity is Google's `ad_creative_id`. Never re-derived.
- Secondary content checksum over `format` plus normalized headline, snippet, link and
  media reference, to catch re-uploads under a new creative ID. This drives family
  clustering.
- Advertiser identity is `advertiser_id` only. `target_domain` is a weak secondary
  signal for network analysis and never auto-merges advertiser records.
- Destination pages dedup on normalized final URL plus `dom_hash`.

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Domain maps to several advertisers | Operator gate on `ad_advertiser_candidates`; never auto-promote. |
| Treating durability as performance | Hard rule: no spend, impression, or conversion inference. Political bucket fields are out of scope for commercial vendors. |
| Credit burn from forced refresh or unbounded pagination | Budget knobs enforced in the capability; `no_cache` operator gated. |
| Storing competitor creative binaries | Phase 1 stores URLs and text only. |
| Confusing two evidence types | Transparency evidence and live paid SERP evidence are separate tables, linkable but never merged. |
| Copying competitor content | Landing-page module records observations and structure, not copied copy. |

## 9. Operator gates

1. Confirming which `advertiser_id` maps to each watchlist vendor when ambiguous.
2. Approving any forced `no_cache` refresh.
3. Approving any run over the configured budget.
4. Approving synthesis output before it leaves the research surface.
5. Choosing the SerpApi plan tier and supplying the credential.

## 10. Vendor watchlist

equatemedia.com, billy.com, moveadvisor.com, mymovingreviews.com, resultcalls.com,
doppcall.com, 99calls.com, quoterunner.com, movematcher.com, budgetvanlines.com,
2movers.com.
