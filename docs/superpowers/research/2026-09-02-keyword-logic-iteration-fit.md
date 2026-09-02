# Which keyword iteration fits

**Date:** 2026-09-02. **Status:** assessment. Nothing here is built, and nothing
here is approved. It exists to answer one question the operator asked with four
documents in hand: which of them, or which combination, should decide how
keywords work in AOOS.

The four documents are attached to the session that produced this file. They are
quoted by section rather than reproduced.

---

## 1. The four documents are two proposals

They read as four options and they are not. Two of them share a source
conversation and a SHA-256; the other two are a research report and the
implementation prompt that report ends by sketching.

| Proposal                              | Documents                                                                               | Lines     | What it is                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| **A — Keyword Authority Engine**      | A1 cleaned handoff; A2 Python reference (same source, SHA `FE1229…`)                    | **962**   | An explicitly **in-place keyword delta** into an existing system it refuses to rebuild.          |
| **B — Decision Intelligence Runtime** | B1 deep research report; B2 master implementation prompt (the expansion of B1's ending) | **5,570** | A **platform-wide reasoning runtime**: 12 phases, 32 deliverables, 11 domain decision contracts. |

So the real question is not "which of four" but: **A or B, and what gets
harvested from the loser.**

---

## 2. What is actually broken

Not a missing engine. A missing **noun**.

Approving a keyword in AOOS writes a row to `tracked_keywords`
(`20260810204856…sql:31-44`). The row is:

```
tenant_id, keyword (lowercased string), location_code (2840), language_code ('en'),
candidate_id, approved_by, approved_at, active, created_at, label
```

`label` is the only field that could carry meaning. Nothing writes it and
nothing reads it — `keywords.server.ts:427` omits it from the upsert, and no
module in `src/` selects it.

**Approving a keyword stores a lowercased string.** There is no owning page, no
intent, no cluster, no funnel role, no exclusion, no business relevance, no
reason it was approved. That is the whole of "the platform has no idea what
keywords are supposed to do", and it is visible in one table definition.

Five consequences follow, each already visible in the code:

1. **The queue never knew "target" was a concept.** 50 approved keywords turned
   out to be 14 targets (CODE-93). `keyword-phrases.ts` now collapses spellings
   after the fact, which is the right repair and still a repair: the grouping
   happens in the detector, not at the moment the operator decides.

2. **The governing contract for exactly this is written and empty.**
   `docs/execution-handbook/SITE_PAGE_KEYWORD_MAP.md` (2026-08-14) already
   specifies page purpose, primary query cluster, supporting clusters,
   exclusions, funnel role and CTA, cannibalisation boundary, and owner. Its
   registry says the page map is `BLOCKED` and "No individual mappings are
   asserted here." **The shape of the answer exists; there are zero instances
   of it.**

3. **Intent and difficulty are bought and never read.**
   `keyword-enrichment.server.ts` calls DataForSEO `search_intent` and
   `bulk_keyword_difficulty` on a metered click and says so in its own header:
   "It raises no finding and changes no review state." The data lands in
   `keyword_candidates.metrics` and stops.

4. **Nothing orders the work.** No rule ranks one keyword against another. Both
   proposals answer this with a weighted opportunity score, and for this
   repository that is the wrong answer twice over: §4 "Where A must be trimmed"
   says why, and §6 step 5 says what to do instead.

5. **The lane the keyword findings need does not exist.**
   `finding-fix-target.ts:148`, on `approved_keyword_no_page`: _"No page is
   mapped to this term. It needs a page, which is a decision about what to
   publish rather than an edit to something that exists."_ Per
   `workbench.ts`'s own account, 111 findings were raised and 2 drafted from; of
   the 109 with no governed lane, **47 want a page written**.

   The executor cannot write one. Seven governed change kinds exist
   (`allowlist.ts:74-95`: `service.page_wording`, `page.metadata`,
   `site.crawl_directives`, `site.structured_data`, `content.blog_post`,
   `page.wording`, `site.footer_wording`) and all seven write through the same
   mechanic: _"Each approved before value must occur exactly once in the live
   file, or the write is refused"_ (`execution.functions.ts:156`). **Exact
   replacement of text that is already there.** `content.blog_post` is the one
   that looks like an exception and is not: it allowlists
   `src/pages/blog/posts.ts` so an _existing_ post's fields can be edited, and
   `page-source-map.ts:65` maps a blog URL to that file. Nothing inserts.

   Downstream of that, only **two** proposal kinds exist — `page_wording` and
   `page_metadata` — across five rules with lanes (`finding-fix-target.ts`,
   `FIX_LANES`). CODE-3 records the identical blocker for a missing H2: a
   governed **insertion** kind does not exist, because there is no `before` text
   to match.

The chain goes dead in a precise place. Discovery works. Approval works.
Detection works. Execution works. **Between "this keyword matters" and "this
page should own it" there is nothing at all**, and downstream of that, the one
action 47 findings ask for cannot be taken.

---

## 3. Proposal B is mostly doctrine this repo already wrote

B1 and B2 are good documents. They are also, for this repository, largely a
restatement of `docs/execution-handbook/`, written later and at ten times the
length. The overlap is not vague; it is close to line for line.

| B asks for                                               | AOOS already has                                                                                                              | Since      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Epistemic type system (`OBSERVED` … `LLM_HYPOTHESIS`)    | `EVIDENCE_POLICY.md` claim labels: `Required`, `Supported`, `Probable`, `Hypothesis`, `Unknown`                               | 2026-08-14 |
| Causal-evidence ladder (tiers 1–8)                       | `EVIDENCE_POLICY.md` evidence hierarchy, 7 levels, engine rule → first-party → controlled test → research → … → AI output     | 2026-08-14 |
| Hard precedence (`INDEXATION_BLOCKER > CONTENT_REFRESH`) | `DIAGNOSIS_REMEDY_MATRIX.md`: "Never prescribe a later-stage fix for an earlier-stage failure", with a prohibited-leap column | 2026-08-14 |
| Abstention as a first-class outcome                      | `DIAGNOSIS_REMEDY_MATRIX.md`: "A diagnosis may remain `Unknown` or `insufficient evidence` indefinitely"                      | 2026-08-14 |
| Data-sufficiency gating                                  | `rule-buckets.ts`: `RuleBucket` (`fact` / `pooled` / `beyond_current_volume`) plus 14 named `Prerequisite`s and `alsoNeeds`   | 2026-08-20 |
| Provenance on every value                                | `EVIDENCE_POLICY.md` mandatory evidence fields; `dataforseo_snapshots`; `rendered_by`; `measurement_runs`                     | 2026-08-14 |
| "Execution complete ≠ verified"                          | `applied` is reachable only through `apply_change_request_rendered_proof` (CODE-7); `stuckAtFor` separates the four stages    | 2026-09-02 |
| Approval gate no model can bypass                        | `runTransition` / `/changes/$id`; `mark_applied` removed from the database routine itself                                     | 2026-09-02 |
| Outcome windows and confidence                           | `change-measurement.ts`, `cohort-verdict.ts`, `confidence.ts`; CODE-55 put the confidence on screen                           | 2026-09-02 |

B's remaining asks are mostly things this build has **deliberately declined**:
multi-tenant isolation testing (one tenant), a constraint solver (one property),
off-policy evaluation with logged propensities (nothing explores), a learning
promotion pipeline (nothing learns), 11 domain contracts across paid social,
local SEO, backlinks and CRO (channels AOOS does not touch). B2 assumes three to
five senior engineers. This is one operator and an agent.

**Adopting B wholesale would mean re-deriving, in code, a doctrine that already
exists in prose — and then building ten domains that have no data.**

### What B genuinely adds

Three things, and they are worth taking:

- **The epistemic class belongs on the value, not on the rule.** AOOS classifies
  _rules_ (`RuleBucket`) and labels _claims_ in prose. It does not stamp a
  stored number with what kind of thing it is. That is why CODE-51 could copy
  one hand-set impact level into 111 findings as two more "facts", and why
  CODE-72 could render a placeholder `0` as a measurement. B1's table of
  epistemic classes is the missing discipline, and the repo has already paid for
  its absence twice.
- **Attribution is not incrementality** (B1, "Attribution is not causal
  inference"). AOOS measures change outcomes against a stored baseline and grades
  them. It has no vocabulary for "GA4 attributed this" versus "this would not
  have happened otherwise." Cheap to add as a label; expensive to discover later.
- **B2 §21.3, §21.4, §21.6** are the best-written decision logic in any of the
  four documents, and they land directly on rules that already exist here.
  §21.3 (low CTR must not automatically become a title rewrite; check intent
  mismatch and cannibalisation first) is a decision procedure for
  `weak_ctr_page`, which today maps unconditionally to the `page_metadata` lane
  (`finding-fix-target.ts:49`) the moment it fires. §21.4 (only
  activate `CONTENT_DECAY` after technical, measurement, intent and query-mix
  explanations are ruled out) is a decision procedure for `position_loss` and
  `declining_position`, which today say "the cause is not in the evidence" and
  stop. §21.6 (**"a keyword gap does not automatically permit a page"**) is the
  guard the create-a-page lane will need on the day it exists.

Everything else in 5,570 lines is either already here or has no data behind it.

---

## 4. Proposal A is the spine

A1 fits for reasons that are structural, not stylistic.

- **It is a delta, not a rebuild.** Its whole editorial finding (§1) is that the
  conversation it corrects went wrong by starting a new foundation instead of
  extending the existing one, and §13 hands the implementer an instruction to
  "map every requested record and operation to the project's existing source,
  evidence, memory, retrieval, proposal, review, relationship, workflow,
  connection, and audit contracts. Reuse an existing contract when it fits." That
  is the same instruction as AGENTS.md's surgical-diff rule.
- **It names this stack.** OpenSEO, n8n, LiteLLM, DataForSEO, Firecrawl,
  Crawl4AI, GSC, GA4, SerpApi — every one of them is in this repository, and
  OpenSEO entered the registry two commits ago (CODE-94). Its §3 warnings are
  about this system: that self-hosting OpenSEO does not make DataForSEO free,
  that LiteLLM's DataForSEO adapter is a live-SERP route and not a
  keyword-metrics route. Both are live traps here.
- **Its §7.2 arrives independently at the unfilled `SITE_PAGE_KEYWORD_MAP`.**
  A1 asks for a _query/topic identity_ (normalised query, locale, intent,
  customer problem, entities, topic cluster, business relevance) and a
  _page–query assignment_ (the intended primary topic/intent for a URL,
  supporting queries, status, reviewer). `SITE_PAGE_KEYWORD_MAP.md` asks for
  page type and purpose, primary query cluster, supporting clusters,
  exclusions, funnel role and CTA, cannibalisation boundary, owner/status.

  Set side by side, **the assignment record is the same record**, and each side
  carries a little the other lacks. `SITE_PAGE_KEYWORD_MAP` is the better spec:
  it has exclusions, funnel role and CTA, brand/claim dependencies and the
  source repo path, none of which A1 thought of, and all of which this executor
  needs. A1 is richer on the _observation_ records around it (query–page
  observations, commercial metric snapshots, SERP snapshots) — and AOOS already
  stores every one of those in a real table.

  So A1's central schema ask is a document this project wrote sixteen days
  before A1 existed, and never populated. Two independent attempts converging on
  the same missing record is the strongest evidence in this assessment that it
  is the right thing to build.

- **Its §3 status ladder is already house style.** "Mentioned / Present /
  Configured / Authenticated / Integrated / Pilot-verified / Production-verified,
  do not collapse these into built" is README rule 2 ("configured is not
  connected, and collected is not delivered") in more words.

### Where A must be trimmed

A1 is not adopted whole either.

- **§8 Step 3's opportunity score is the one thing to refuse.** It proposes
  `business relevance + supported demand + attainable uplift + conversion
evidence + confidence − effort − risk − cost`. Of those eight terms, AOOS can
  currently source **two** (demand, from DataForSEO; freshness, from row dates).
  The rest have no collection path. A weighted composite over six null inputs is
  precisely `scoreBacklinkHealth` (CODE-63, deleted) and precisely the eight
  authority rules (CODE-64, deleted). A1 even says the weights "must be visible
  and adjustable", which is not the problem: the inputs are the problem.
  **Ordering, when it comes, must be a sort over stored facts, not a score.**
- **§8's `n8n`, LangGraph and SearXNG assumptions** describe the source
  conversation's host, not this one. AOOS orchestrates through its own registry
  modules and scheduler; there is no LangGraph here and no reason to add one.
- **A2 contributes no code.** All six of its patterns already exist in
  TypeScript here: Zod contracts at every server-function boundary; SHA-256
  content identity (`knowledge_source_versions.content_sha256` plus
  `parser_version`, which is its `NORMALIZATION_VERSION`); explicit workflow
  topology (registry modules); an injected HTTP client; bounded retries;
  separate provider contracts by evidence role. Its one durable line —
  "represent unavailable measurements as `None`, never as invented zeroes" — is
  README rule 1, and the repo enforced it against itself twice this week
  (CODE-51, CODE-72). **A2 is a conformance checklist this repo passes, not a
  source of implementation.**

---

## 5. The verdict

**Build Proposal A, trimmed. Harvest three things from B. Take no code from A2.**

| Document | Verdict               | Why                                                                                                               |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A1**   | **Spine, minus §8.3** | Right scope, right stack, and its §7.2 is the `SITE_PAGE_KEYWORD_MAP` row this project already specified.         |
| **A2**   | **Checklist only**    | Six patterns, all already implemented here in TypeScript. Porting Python would be a rewrite backwards.            |
| **B1**   | **Harvest 3 ideas**   | Epistemic class on the value; attribution ≠ incrementality; the abstention vocabulary. The rest AOOS already has. |
| **B2**   | **Harvest §21.3/4/6** | Excellent decision logic for rules that exist. Its 12-phase program is an order of magnitude too large.           |

The reason A wins is not that it is better written. B1 is better written. A wins
because **the hole in this platform is keyword-shaped, not runtime-shaped.** The
deterministic evidence discipline B spends 5,570 lines arguing for is already
the thing this repository is most rigorous about. What it lacks is a record
saying what a keyword is for.

---

## 6. First moves

Ordered, each small enough to ship, each checked against AGENTS.md.

**1. Give an approved keyword a purpose.** Fill the record
`SITE_PAGE_KEYWORD_MAP.md` already specifies and A1 §7.2 asks for. At approval
time the operator says which page should own the target (or that none does yet),
and what the searcher is trying to do. Everything else on this list needs it.

- No invented threshold: every field is an operator's declaration or a stored
  provider value, and an undeclared field renders as a named absence.
- No eighth category: this lives inside the existing `/keywords` route.
- The intent DataForSEO already sold us (§2.3) becomes a default the operator
  confirms or overrides, never an assignment made on their behalf.

**2. Group at the door, not in the detector.** `keyword-phrases.ts` already
knows that 50 spellings are 14 targets. Approval should operate on the target,
so the queue stops presenting 40 rows that are one decision.

**3. Read back what was already bought.** Surface stored difficulty and intent
on the approval screen. This is a display change over rows that exist, and it
ends the state where a metered call funds nothing.

**4. Name the create-a-page gap honestly before building it.** 47 findings want
a page. The executor does exact string replacement, so the lane needs an
insertion path (CODE-3's blocker) _and_ B2 §21.6's guard, so that a gap does not
automatically permit a page. Until that exists, the bench should say so in those
words — which `workbench.ts` already does, and which is the correct interim
state, not a bug.

**5. Order only after step 1, and only by sorting.** Once a target carries an
owning page and a declared intent, "which of these matters" is answerable from
stored rows: targets with no page, targets two pages claim, targets with
impressions and no click. That is a sort with a stated key. It is not a score,
and it must not become one.

The sequence matters. Steps 2, 3 and 5 are each cheap **only after** step 1, and
each is impossible or dishonest before it.

---

## 7. What only the operator can decide

- **Is a page/query-ownership map something you want to fill by hand?** It is a
  one-time declaration per page (there are about 30). Nothing in either proposal
  works without it, and no provider can supply it: it is a statement about the
  business, not about search.
- **Should AOOS ever create a page, or only draft a brief you publish?** The
  first needs a new executor path and a new approval state. The second needs
  neither and closes most of the 47.
- **Does "keyword" stay the unit, or does "target" replace it on screen?** Step 2
  changes what the operator is approving. That is a product decision.

## Related

- [Site, Page, and Keyword Map](../../execution-handbook/SITE_PAGE_KEYWORD_MAP.md) — the record this argues for filling
- [Evidence Policy](../../execution-handbook/EVIDENCE_POLICY.md) — the hierarchy Proposal B restates
- [Diagnosis and Remedy Matrix](../../execution-handbook/DIAGNOSIS_REMEDY_MATRIX.md) — the precedence rules Proposal B restates
- [Backlog](../../context/BACKLOG.md) — CODE-3, CODE-63, CODE-64, CODE-93 are cited above
