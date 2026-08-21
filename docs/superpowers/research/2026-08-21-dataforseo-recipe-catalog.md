# DataForSEO recipe catalog — bridging templates to AOOS

Sources:
- https://dataforseo.com/templates/ (58 templates, paginated/JS — full listing not scrapable via static fetch)
- https://dataforseo.com/templates/find-competitor-keyword-gaps-and-log-opportunities-to-notion-with-dataforseo-n8n/
- https://dataforseo.com/templates/ai-search-visibility/
- https://dataforseo.com/templates/find-low-competition-keyword-opportunities-with-dataforseo/
- https://dataforseo.com/apis/dataforseo-labs-api
- Repo: src/lib/dataforseo/*.server.ts, src/registry/modules/dataforseo.ts, src/lib/keywords.functions.ts, src/lib/finding-router.ts

## 1. Templates found (relevant subset)

| Template | Chains | Output |
|---|---|---|
| Find low-competition keyword opportunities | keywords_for_site or ranked_keywords → bulk_keyword_difficulty | Keyword list scored by difficulty/volume/trend |
| Find competitor keyword gaps → Notion | ranked_keywords(competitor) × ranked_keywords(own) diff, enriched w/ volume + suggestions | Gap list → content plan |
| Get new ranked keywords in Google AIO (AI Overview) | DataForSEO Labs (ranked keywords, AIO-filtered) | New AI-Overview-eligible keywords, alerted |
| Scrape/pull references from Google AI Mode / AI Overview (4 near-duplicate templates) | SERP API (AI Mode / AIO endpoints) | List of cited source domains/URLs per query — tells you what content format AI cites |
| Check bulk domain ranks | Bulk Ranks endpoint | Domain authority across up to 1000 domains |
| Pull bulk domain backlink profiles | Backlinks API (bulk) | Backlink profile overview across many domains |

Full 58-template index wasn't retrievable (page paginates client-side); the above covers every category the brief asked for except "question mining" — no dedicated People-Also-Ask/question template turned up in search or the AI Search Visibility category page; question data would have to come from SERP `people_also_ask` items already inside the organic SERP payload the repo already fetches (see §3), not a new endpoint.

## 2. DataForSEO Labs API endpoints (docs page gave pricing tiers, not per-endpoint detail)

General Labs pricing tier: $0.012/task + $0.00012/item (~$132 per 1M rows) live mode, ~2s turnaround. Historical Rank is a separate premium tier ($0.12/task, ~$127/1K domains).

| Endpoint | Returns | Repo status |
|---|---|---|
| keywords_for_site | Keywords a domain already ranks for | **Wired** (keywords.server.ts) |
| keyword_suggestions | Expansions of seed queries | **Wired** (keywords.server.ts) |
| ranked_keywords | Full ranked keyword landscape for a domain | **Wired** (labs.server.ts) — used for owned domain only per registry note |
| competitors_domain | Domains overlapping keyword footprint | **Wired but retired** — registry note: "Intersection-based competitor discovery is deliberately retired: it returns social and directory domains for thin-footprint sites" |
| domain_intersection | Shared-keyword sets between two domains (competitor gap) | Not wired |
| keyword_ideas | Broader keyword ideation from a seed/category | Not wired |
| bulk_keyword_difficulty | Difficulty score across a keyword list | Not wired |
| search_intent | Informational/commercial/transactional classification | Not wired |
| AI Optimization / LLM Mentions API | Brand-mention monitoring in LLM answers | Not wired; separate product line from Labs |

## 3. What's already wired in the repo (confirmed by grep, not template mining)

- `src/lib/dataforseo/keywords.server.ts` — `/dataforseo_labs/google/keywords_for_site/live`, `/dataforseo_labs/google/keyword_suggestions/live`
- `src/lib/dataforseo/labs.server.ts` — `/dataforseo_labs/google/competitors_domain/live`, `/dataforseo_labs/google/ranked_keywords/live`
- `src/lib/dataforseo/serp.server.ts` — `/serp/google/organic/task_post`, `/task_get/regular`, `/live/regular` (organic SERP, standard queue + live)
- `src/lib/dataforseo/backlinks.server.ts` — `/backlinks/summary`, `/referring_domains`, `/backlinks`, `/anchors`, `/domain_pages`, `/history` (all `/live`), owned-property scope only
- Budget gate: `src/lib/dataforseo/budget.server.ts`, $300/mo caps on Labs and SERP capabilities (`src/registry/modules/dataforseo.ts`)

**Where results land today:** `keyword_candidates` table (pending/approved/rejected) via `src/lib/keywords.functions.ts`, gated by operator approval (`decideKeywordCandidates`) before becoming `tracked_keywords`. SERP results land as immutable snapshots consumed by `serp.competitors` / `serp.competitor_intelligence` (competitor derivation, heuristic, $0 additional cost).

**Confirmed dead end:** grepped `src/lib/finding-router.ts` (the recommendations/findings engine) — zero references to `keyword_candidates`, `tracked_keywords`, or any Labs/backlinks table. Keyword and backlink data is collected, stored, and approved, but nothing downstream turns it into a recommendation, suggestion, or change request. This is the exact gap the operator flagged.

## 4. Ranked bridge list

See reply to team-lead for the ranked, cost-annotated list. Full detail above.
