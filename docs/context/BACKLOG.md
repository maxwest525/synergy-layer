# The backlog — one list, with IDs, that closes in the same change as the work

Seven handoff documents describe unfinished work. Not one of them uses a format
a machine or a hurried human can reconcile: the open items are paragraphs, some
already done, some superseded, some quietly wrong. Asked on 2026-08-29 for "the
trail of unfinished work", the honest answer was that no such list existed —
only seven prose files that each knew part of it.

This is that list. It is the only place an open item is tracked. A handoff
records *what happened in a session*; this file records *what is still owed*.

## How to use it

- Every item has a **stable ID**. Reference it in a commit message, a PR title,
  or a session prompt.
- When you close one, **mark it closed here in the same change**, with the
  commit or PR that did it. An item that goes quiet is treated as still open.
- When you find new work, add it here rather than at the bottom of a handoff.

## How an item is graded

| Grade | Means |
| --- | --- |
| **Verified** | Checked against this repository or the live database on the date shown. |
| **Carried** | Stated in an earlier handoff and **not re-checked here**. A lead, not a fact — confirm before acting. |
| **Operator** | Nothing to build. A decision or a click is what is missing. |

Grades are not severity. A Carried item can matter more than a Verified one;
the grade says only how much you should trust the sentence.

---

## A. Waiting on the operator

Nothing in this section is blocked on code.

| ID | Item | Why it is here |
| --- | --- | --- |
| **OP-1** | **Google Ads: wire it or delete it.** The whole integration is an OAuth refresh plus `listAccessibleCustomers`. No reporting call, no spend read, no surface. `GOOGLE_ADS_CUSTOMER_ID` is required and read by nothing. | Placing four secrets currently buys one green row. Leaving it as-is costs setup time and returns nothing. Also a calendar item: the v25 pin expires on Google's three-a-year schedule. |
| **OP-2** | **n8n: wire it or delete it.** | Same shape as OP-1. |
| **OP-3** | **Runtime agents: build or remove.** Raised again 2026-08-29 as item 4 of eleven. Read **CODE-14** and **CODE-15** before deciding: two agents are declared and cannot run, and one endpoint runs a model well and cannot be triggered. | The standing recommendation is **not to pick an orchestrator yet** (Anthropic managed agents / Langflow / n8n / raw ADK). The bottleneck measured repeatedly is agents starved of inputs, not agents lacking a scheduler — see §F. Choose the orchestrator after the inputs land, or the choice is made on no evidence. |
| **OP-4** | **SerpAPI free-gate revalidation on `/ads`** (account reads zero credits). | Blocks every paid-SERP rule, including the only path to competitor **landing pages** — Ads Transparency returns the advertiser's verified domain and never the click destination. |
| **OP-5** | **The six-domain competitor shortlist in `/competitors`.** | Needs the operator's own list, per `docs/execution-handbook/COMPETITIVE_MODEL.md`. |
| **OP-6** | **The two unbuilt category pages.** | |
| **OP-7** | **Routes beyond California → Texas.** | Ten `route:ca-tx` keywords are live. The route matrix is how the organic winners win; one route is the seed, not the set. |
| **OP-8** | **Migrating off Lovable: intention with no plan.** `CATALOG.md` mentions it in passing; there is no target, no timeline, no owner. | The tie-downs are known. The one that fails *silently* is CODE-9. |
| **OP-9** | **Publish the website.** brittmove PR #4 (prerender) is merged to `main` and **not live**: Lovable's build image cannot run Chromium, and its agent committed a change that skips the prerender instead of failing. | Until this is resolved every page still serves a 38-character shell with one sitewide title. The likely real fix is `react-dom/server` SSG, which needs no browser — see CODE-10. |

---

## B. Open work in this repository, verified 2026-08-29

| ID | Item | Evidence | Grade |
| --- | --- | --- | --- |
| **CODE-1** | **18 of 26 rules offer no fix and say nothing about why.** 4 rules have a governed lane (`weak_ctr_page`, `query_coverage_gap`, `striking_distance_query`, `possible_query_overlap`); 4 more have a written reason for having none. The remaining 18 fall through to the generic "no governed fix for this finding yet" sentence. | `src/lib/finding-fix-target.ts` vs `src/lib/rule-buckets.ts`. The 18: `page_lcp_poor`, `page_cls_poor`, `zero_click_page`, `high_impression_low_ctr`, `declining_clicks`, `declining_impressions`, `significant_period_change`, `site_visibility_shift`, `site_clicks_shift`, `declining_position`, `research_page_traction`, `page_traffic_loss`, `page_traffic_gain`, `zero_engagement_page`, `event_disappeared`, `approved_keyword_unobserved`, `approved_keyword_no_page`, `referring_domain_movement`. | Verified |
| **CODE-2** | **Gemini bypasses the LiteLLM gateway and has no spend ceiling.** `GEMINI_API_ORIGIN` is still hardcoded; page-wording drafting and every embedding call Google directly. No `assertBudget` anywhere in that path. | `src/lib/gemini.server.ts:19`, `src/lib/knowledge/embeddings.server.ts`. DataForSEO's `dataforseo/budget.server.ts` is the pattern to copy. | Verified |
| **CODE-3** | **`h2_missing` reports with nowhere to go.** `PAGE_CHECK_FIX.h2_missing` is deliberately `null`: the executor only does exact string replacement, and a missing H2 has no `before` text to match. Closing it needs a governed **insertion** change kind. | `src/lib/audit-fixes.ts`. | Verified |
| **CODE-4** | **The redraft verb exists for one lane and one state.** `canRegenerateSource` returns true only for a `page_wording` change still `proposed`. The page-metadata lane has no redraft path at all. | `src/lib/suggestion-queue.ts`. Honest as written — the button would always fail elsewhere — but it is still a gap, not a design. | Verified |
| **CODE-5** | **Keyword rules never touch page text.** No join exists from a tracked keyword to the wording of the page meant to serve it, so cannibalisation cannot be detected from stored evidence. | Nothing reads both. | Verified |
| **CODE-6** | **Umami, backlinks and SerpAPI ads collect and are read by no rule module.** 18 rules survived an adversarial design pass on 2026-08-28 and **none are built**. | `docs/handoffs/2026-08-28-parallel-rule-sessions.md` carries all 18 with their grounding and four ready-to-hand-out session prompts. This is the single largest shovel-ready block in the backlog. | Verified |
| **CODE-7** | **`markChangeRequestApplied` is a browser-reachable server function with no caller.** One reference in the whole tree: its own export. It sounds like it belongs to the approval path, which is why it is worth checking rather than deleting on sight. | `src/lib/change-requests.functions.ts:89`. | Verified |
| **CODE-8** | **A new handbook file is silently not governed knowledge.** `EXECUTION_HANDBOOK_FILES` is an explicit allowlist of 17 basenames, and nothing compares it to what is actually in `docs/execution-handbook/`. The two agree today; nothing keeps them agreeing. | `src/lib/knowledge/sources.ts:12`. No test reads the directory. This already cost a CI cycle on 2026-08-28 when `COMPETITIVE_MODEL.md` was written, linked from the index, and not ingested. A ~15-line test that lists the directory and asserts set equality closes it permanently. | Verified |
| **CODE-9** | **The cron target hostname is hardcoded in three migrations, four call sites.** Every scheduled job posts to `https://trumove-resource-center.lovable.app/api/public/hooks/…`. AOOS's actual address is `https://trumove.marky.systems`. | `20260811235930`, `20260817175328`, `20260818042307`. If that hostname stops resolving — a rename, a plan change, OP-8 — pg_cron keeps firing and every nightly job silently does nothing. **This is the tie-down that fails without telling anyone.** | Verified |
| **CODE-14** | **The two declared agents are rows describing something that does not exist, and they contradict the live model convention.** `growth.analyst` and `content.strategist` are `AgentDefinition` literals in registry modules, synced to the `agents` table and rendered at `/agents`. `runAgent()` is six lines whose whole body throws, and `assertRunnableGraph` refuses any graph holding an agent node — so both declared workflows (`growth.weekly_scan`, `content.brief_pipeline`) are unrunnable by construction. Separately, both declarations hardcode the model slug `google/gemini-3.5-flash`, while `src/lib/ai/models.ts` resolves a **role** (`auto`/`reasoning`/`fast`) precisely so no slug is pinned, and says why in a comment. | `src/registry/modules/growth-operations.ts:42`, `content-operations.ts:35`, `src/lib/agent-runtime.server.ts:17`, `src/lib/workflow-runner.server.ts:28`, `src/lib/ai/models.ts`. Resolving this is **OP-3**: either build the runtime, or delete the declarations and the two workflows that depend on them. Leaving two agent cards on a page for agents that throw is the connector problem in a new costume. | Verified |
| **CODE-15** | **`/api/agent-chat` is a working agent nobody can schedule.** It has evidence tools, the house rules in its system prompt, a 50-step cap and gateway routing by role — everything the declared agents lack. What it has no way to be is *started by anything except a person typing*, and its output goes to a chat pane rather than to the findings queue. | `src/routes/api/agent-chat.ts`. This is the shortest path to a runtime agent and it does not need an orchestrator chosen first: it needs a trigger, a destination for output, and resumable approval. Weigh it against OP-3 before picking Langflow, n8n or managed agents. | Verified |

### Website repository (`maxwest525/brittmove-829a7519`)

| ID | Item | Evidence | Grade |
| --- | --- | --- | --- |
| **CODE-10** | **The prerender is merged and not running.** See OP-9. Replacing the headless-browser prerender with `react-dom/server` SSG removes the Chromium dependency Lovable's builder cannot satisfy. | `scripts/prerender.mjs`, brittmove PR #4. | Verified |
| **CODE-11** | **Nine pages serve the generic sitewide title.** All four service pages, all three blog posts, `/inventory-builder`, `/live-walkthrough`. They never set their own. | Invisible while every response was a shell; visible the moment CODE-10 lands. | Verified 2026-08-28 |
| **CODE-12** | **Unknown URLs return 200, not 404.** A soft 404 across the whole site. Per-route files now exist, which is the precondition; the host still has to stop serving the shell for everything else. | | Verified 2026-08-28 |
| **CODE-13** | **`/plan-variants` and `/showcase` render 783 characters with no H1**, against 5,000–12,000 elsewhere, while listed as indexable. | | Verified 2026-08-28 |

---

## C. Carried forward — stated in a handoff, not re-verified here

Confirm before acting on any of these.

| ID | Item | Source |
| --- | --- | --- |
| **CARRY-1** | **Zero `onpage_*` snapshots exist.** The OnPage crawl has never stored anything, so no OnPage rule can be built on stored evidence. | Measured 2026-08-28 |
| **CARRY-2** | **`ad_live_serp_observations` holds 0 rows**, which is why competitor landing pages are unknown. Unblocked by OP-4. | Measured 2026-08-28 |
| **CARRY-3** | **Three vendor schedules were built, seeded and never enabled.** | Audit train, 2026-08-28 |
| **CARRY-4** | **63 of 84 items in the fartbrain "Mark" folder are not in `kb.research`.** 21 are in. | 2026-08-29 |
| **CARRY-5** | **`synced_to_amos = true` on all 84 of those items, with nothing on the receiving end.** A flag asserting a sync that does not exist is worse than no flag. | 2026-08-29 |
| **CARRY-6** | **The self-hosted Firecrawl path is correct in code and never exercised.** `runPageAudit` prefers Crawl4AI and has never been observed failing over, so no stored evidence records a scrape against `fire.marky.systems`. Cheapest close: run one audit with Crawl4AI deliberately unconfigured and read `rendered_by`. | 2026-08-25 remediation plan, Part 2 |
| **CARRY-7** | **UI pieces not yet worked in**, including a premade LangGraph-style visual. Explicitly backlogged by the operator on 2026-08-29, not dropped. | 2026-08-29 |
| **CARRY-8** | **The handbook and the existing documents have never been reviewed as a set.** 17 handbook files are governed knowledge; nothing checks them for contradiction, staleness, or overlap. Related: the open design question of what a core knowledge base should contain and how it stays fresh rather than ossifying. | 2026-08-29, items 9 and 10 |
| **CARRY-9** | **Routing and paths across the app need a pass.** The operator could not find things he was told were built — the next-action engine sat on one page filed under "Evidence" with nothing linking to it. One mount was fixed; the survey was not done. | 2026-08-29, item 8 |
| **CARRY-10** | **Seven survey prompts are written; none have been run.** The workspace holds 102 Lovable projects; seven name a capability AOOS is measurably missing. Each has to be run as its own session, and its findings added here with new IDs. | [`../handoffs/2026-08-29-other-projects-survey-prompts.md`](../handoffs/2026-08-29-other-projects-survey-prompts.md) |

---

## D. Closed since the handoff that named them

Kept because a reader of those handoffs will otherwise chase them. Each was
re-checked in the tree on 2026-08-29.

| Item, as the handoff stated it | Now |
| --- | --- |
| "Every rule except `weak_ctr_page` drafts as a title/H1 proposal" — the operator's standing complaint | **Closed.** `proposalKindForRule` returns `null` when no lane fits; there is no default. The remaining gap is CODE-1, which is a different shape. |
| "The nightly job files only `create_title_h1_proposal`" | **Closed.** `proposals/daily.server.ts` calls `create_page_wording_proposal`. |
| "GA4 sits in `noSafeProbe` and reports `configured_no_safe_probe` forever" | **Closed.** Not in the set; the set is now GSC, PageSpeed, Perplexity, OpenAI Ads — the last with a written reason. |
| "Delete the SearXNG connector row" | **Closed.** No longer in the catalog. |
| "The OpenAI Ads CAPI bridge has no connector row" | **Closed.** `openai_ads` is in `CONNECTOR_CATALOG`. |
| "`surface-inventory.ts` still calls it 'the metered Firecrawl'" | **Closed.** Wording gone. |
| "`N8N_API_KEY` appears as fixture data for an env name this product does not use" | **Closed.** No occurrences. |
| "`generateTitleH1Proposal` is a server function with no caller" | **Closed.** The symbol no longer exists. |
| "`createSeoRun` is a server function with no caller" | **Withdrawn — the finding was wrong.** The export is `createSeoRuns` and `src/routes/seo-runs.index.tsx` calls it. The original scan was grep, and it grepped the wrong name. |

---

## E. What each source handoff is now for

| File | Status |
| --- | --- |
| `2026-08-20-rule-thresholds-audit.md` | **Closed.** Kept as the record of *why* the thresholds are what they are. Not a work order. |
| `2026-08-25-remediation-plan.md` | **Reference.** Its open items are OP-1, OP-2, CODE-2, CODE-7, CARRY-6. Everything else in it is in §D. Its Firecrawl history and unused-tool-surface parts remain worth reading. |
| `2026-08-25-restored-context-verification-and-map.md` | **Reference.** Part B is still the structural map. |
| `2026-08-28-audit-fix-train-context.md` | **Closed.** All ten PRs merged. |
| `2026-08-28-measurement-pass-handoff.md` | **Superseded by this file.** Its §1 — the title/H1 default — is closed. Its §4 table is now CODE-1, CODE-3, CODE-5, CODE-6. |
| `2026-08-28-parallel-rule-sessions.md` | **Live.** Four session prompts, 18 grounded rules, none built. This is CODE-6 and it is ready to hand out unchanged. |
| `2026-08-29-session-record.md` | **Reference.** What was found and fixed on 2026-08-28/29, including the competitor research and the four-layer title/H1 lock. |

---

## F. The pattern this backlog exists to stop

Counted across two sessions: **seven** instances of evidence collected
competently and then routed somewhere it cannot act.

| Evidence | Reached | Should reach |
| --- | --- | --- |
| Ads Transparency creatives | page-wording generation, as "corroboration" | the competitor engine |
| Operator classification of a domain | a dropdown | competitive scoring |
| Competitor page observations | `knowledge_entries` | the findings queue |
| 24 DataForSEO reports | stored snapshots | findings |
| Next-action guidance | one page filed under Evidence | the page an operator opens |
| 84 research items flagged `synced_to_amos` | nothing | `kb.research` |
| `retrieveKnowledgeGuidance` research entries | an early return, unreachable | every agent that asks for guidance |

Plus the earlier three: `h2Count`, `headingSkips`, URL Inspection coverage
fields — each parsed, stored, and read by nothing.

**The standing check, from this:** when you add a collector or a parser, add its
consumer in the same change — or record it here with the reason it has none.
Wiring an analysis to a consumer is not a finishing touch on this project. It is
the step that keeps being skipped, and it is why the same conversation recurred
for months.
