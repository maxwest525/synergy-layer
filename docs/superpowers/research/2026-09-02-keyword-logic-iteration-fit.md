# Which keyword iteration fits

**Date:** 2026-09-02. **Status:** assessment. Nothing here is built and nothing
here is approved. It answers one question the operator asked with four
architecture documents in hand: which of them, or which combination, should
decide how keywords work in AOOS.

Every claim below was put through an adversarial check against the code before
it was written down. Where that check refuted a claim, the claim is gone or
corrected; §9 lists what changed, because a first draft that survived unedited
would be the more suspicious document.

---

## 1. The four documents are two proposals

They read as four options and they are not. Two share a source conversation and
a SHA-256; the other two are a research report and the implementation prompt
that report ends by sketching.

| Proposal                              | Documents                                                               | Lines     | What it is                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| **A — Keyword Authority Engine**      | A1 cleaned handoff; A2 Python reference (same source, SHA `FE1229…`)    | **962**   | An explicitly **in-place keyword delta** into a system it refuses to rebuild.                      |
| **B — Decision Intelligence Runtime** | B1 deep research report; B2 master prompt (expands B1's closing prompt) | **5,570** | A **platform-wide reasoning runtime**: 13 phases, 32 deliverables, 13 domain contracts (§21.1–13). |

So the question is not "which of four" but **A or B, and what gets harvested
from the loser.**

---

## 2. What is actually broken

Not a missing engine. A missing **noun** — and, underneath that, a habit.

Approving a keyword writes a row to `tracked_keywords`
(`20260810204856…sql:31-43`):

```
tenant_id, keyword (lowercased string), location_code (2840), language_code ('en'),
candidate_id, approved_by, approved_at, active, created_at, label
```

`label` is the only field that could carry meaning. Nothing writes it and
nothing reads it: `keywords.server.ts:427-441` omits it from the upsert, and no
module in `src/` selects it.

**Approving a keyword stores a lowercased string.** No owning page, no intent,
no cluster, no funnel role, no exclusion, no business relevance, no reason it
was approved. That is the whole of "the platform has no idea what keywords are
supposed to do", and it is visible in one table definition.

Five consequences, each verified in the code:

1. **The queue has no concept of a target.** Approval is a bulk action
   (`keywords.functions.ts:62` takes an array; the route has checkboxes and a
   "Selected" tile), fed by three Labs sources — `keywords_for_site`,
   `keyword_suggestions`, `domain_intersection`. That is how 50 spellings were
   approved in one gesture. `keyword-phrases.ts` now collapses them to 14
   targets, and it does so **in the detector, after the fact**. The repo's own
   account of that fix (CODE-93, `f8c1948`) attributes the bug to a
   literal-substring coverage test and fixes it with word-set grouping; the
   reading that a purpose field would have prevented it is this document's, not
   the commit's.

2. **Intent and difficulty are bought, displayed, and consumed by nothing.**
   `keyword-enrichment.server.ts` calls `bulk_keyword_difficulty` and
   `search_intent` and writes them to `keyword_candidates.metrics`; the route
   renders both as operator pills (`keywords.tsx:323,327`). So they _are_ read
   back. What consumes them is nothing: no rule, no prerequisite, no lane, no
   finding, no ordering.

   **Worse, they are unreachable for the keywords that matter.**
   `enrichPendingCandidates` filters `.eq("review_state", "pending")`
   (`keyword-enrichment.server.ts:117-121`) and throws "No keyword candidates
   are waiting for a decision" when the queue is empty. **The 50 already-approved
   keywords can never be enriched by this path at all.** Any purpose field that
   expects to prefill from intent has nothing to prefill from today.

3. **Nothing orders the work.** No rule ranks one keyword against another. Both
   proposals answer with a weighted opportunity score, and for this repository
   that is the wrong answer — see §5 and §7 step 5.

4. **The detector cannot name an owner, only an absence.**
   `targeting-rules.ts:161` concatenates every read page's title and H1 into one
   string before asking whether a phrase is covered. So
   `approved_keyword_no_page` can only ever say _"no page anywhere carries these
   words"_. It cannot say which page **should** own the term, because nothing
   tells it. `detectKeywordCannibalization` matches per page and can therefore
   name the competitors, but not the owner. The findings that say "it needs a
   page" are partly an artefact of a detector with no ownership input.

5. **No lane writes a page — but the executor is not the reason.**
   `finding-fix-target.ts:147-148`, on `approved_keyword_no_page`: _"No page is
   mapped to this term. It needs a page, which is a decision about what to
   publish rather than an edit to something that exists."_

   Seven governed change kinds exist (`allowlist.ts:74-95`), and only two
   proposal kinds — `page_wording` and `page_metadata` — across five rules with
   lanes. **But `applyExactReplacements` (`source-change.ts:62-97`) can insert.**
   It requires `before` to occur exactly once and `after` zero times, then does
   `next.replace(before, after)`. An anchor-plus-append pair satisfies both.
   CODE-3's `h2_missing` is blocked because no **anchor policy** exists, not
   because the engine cannot insert. A create-a-page lane is therefore a
   convention, a `proposal_type` literal and a CHECK migration — **not a new
   execution engine.** That is much cheaper than it looks.

### The counts everyone quotes are not measurements

`workbench.ts:4-14` says 111 findings raised, 2 drafted from, 109 with no lane,
"47 want a page written, 45 want an investigation, 6 want a competitive answer."
That is a **prose doc comment** with no cited query, no date, no asserting test
and no reproducing script. CODE-51 independently puts the finding population at 115. CODE-93 shipped one commit _after_ the bench and re-groups exactly the rule
behind the "47" bucket, so 47 is stale within its own branch. The shape of the
problem is real; **do not carry these numbers into a build decision without a
live read.**

### The pattern underneath

The keyword hole is one instance of the project's characteristic failure, and
naming it is the most useful thing in this assessment:

> **This project writes the governing contract and does not instantiate it.**

- `SITE_PAGE_KEYWORD_MAP.md` (2026-08-14) specifies thirteen fields — page type
  and purpose, primary query cluster, supporting clusters, exclusions, funnel
  role and CTA, cannibalisation boundary, owner/status. Its registry says
  `BLOCKED`, "No individual mappings are asserted here." **Specified, empty.**
- `EVIDENCE_POLICY.md` defines claim labels `Required` / `Supported` /
  `Probable` / `Hypothesis` / `Unknown` and three recommendation labels
  (`Deterministic repair`, `Evidence-based candidate`, `Validated winner`).
  Grepped across `src/`: `Probable`, `Hypothesis` and all three recommendation
  labels return **zero files**. `recommendations` ships one
  `confidence numeric(3,2) DEFAULT 0.50` and a free-text `reasoning`.
  **Written, never typed.**
- `DIAGNOSIS_REMEDY_MATRIX.md` is a decision contract with required evidence,
  permitted remedies and prohibited leaps per funnel stage. **Nothing in `src/`
  executes its stage order.**

That reframes Proposal B entirely, and §3 and §4 turn on it.

---

## 3. What Proposal B genuinely adds

My first draft said B was "mostly a restatement of doctrine this repo already
has". The adversarial check refuted that, and the correction matters: **the repo
has the doctrine in prose and not in code.** B is not asking us to re-derive
what we know. It is asking us to _execute_ what we only wrote — which is exactly
the pattern §2 just named.

Six things, in rough order of value-per-hour here:

- **The measurement-integrity gate** (B1's precedence list; B2 §7, §21.1). AOOS
  raises findings from stored snapshots with no check that the collection is
  current; `command-center.ts` can only put "N daily reads are overdue" on a
  status line. One gate that refuses to raise or draft from a source past its
  freshness limit would close it, and it is the same principle AGENTS.md already
  legislates in a different form. Cheap, and genuinely absent.

- **The data-void escalation ladder** (B1 "'Void' or sparse-data logic"; B2
  §15.2, §21.6). **The single most relevant idea in B for this property.** B
  forbids `search volume = 0 → opportunity = 0` and enumerates what to inspect
  instead: first-party GSC impressions, customer questions, sales-call language,
  support requests, paid search terms, adjacent intents, competitor category
  language, jobs-to-be-done. `rule-buckets.ts:119-123` names this exact problem
  — the query dimension is "mostly anonymized away" at this property's volume —
  and then stops. B says what to do next.

- **Decision replayability** (B1; B2 §4.3). `recommendations`
  (`20260804091534…sql:201-222`) stores no snapshot reference, no rule version,
  no code revision. `targeting-rules.server.ts:166` writes `reasoning` as the
  literal string "Read from stored rows on «date»: no provider was called." **A
  finding cannot be reconstructed.** A snapshot id and a rule version is one
  migration and one insert change.

- **Epistemic class on the stored value.** B1's ten classes type how each value
  was _produced_ (`OBSERVED`, `DETERMINISTIC`, `STATISTICAL_ESTIMATE`,
  `TENANT_ASSUMPTION`, `UNVERIFIED_EXTERNAL`…). `EVIDENCE_POLICY`'s five labels
  are a different axis — how strongly a claim is _asserted_ — and neither axis
  exists in code. This is the discipline whose absence produced CODE-51 (one
  hand-set impact level copied into 111 findings as two more "facts") and
  CODE-72 (a placeholder `0` rendered as a measurement). The repo has paid for
  it twice.

- **Exclusions and contraindications.** `rule-buckets.ts` gives every rule its
  _prerequisites_ — what must be true before it may speak. Nothing gives a rule
  its _disprovers_ — what, if true, means the diagnosis is wrong. B2 §9–§10 call
  these `exclusionConditions` and `contraindications`; `SITE_PAGE_KEYWORD_MAP`
  calls the page-level version `exclusions`. **B and this project's own unfilled
  schema arrive at the same concept independently**, which is an argument for
  §7's direction.

- **B2 §21.3, §21.4, §21.6** are the best decision logic in any of the four
  documents and land on rules that exist here. §21.3 (low CTR must not
  automatically become a rewrite; check intent mismatch and cannibalisation
  first) is a procedure for `weak_ctr_page`, which today maps unconditionally to
  the `page_metadata` lane (`finding-fix-target.ts:49`) the moment it fires.
  §21.4 (activate `CONTENT_DECAY` only after technical, measurement, intent and
  query-mix explanations are ruled out) is a procedure for `position_loss`,
  which today says "the cause is not in the evidence" and stops. §21.6 (**"a
  keyword gap does not automatically permit a page"**) is the guard a
  create-a-page lane needs on the day it exists.

---

## 4. What Proposal B restates, and where the parallel is looser than it looks

The overlap is real but narrower than a first read suggests. Three of the four
equivalences I first claimed do not survive:

| B asks for                       | Nearest AOOS analogue                                                | Does it hold?                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Causal-evidence ladder (8 tiers) | `EVIDENCE_POLICY.md` evidence hierarchy, 7 levels                    | **Holds**, in prose. Same axis, same intent, written 2026-08-14.                                                                                                                                                                                                                                                                        |
| Abstention as first-class        | `DIAGNOSIS_REMEDY_MATRIX.md`: a diagnosis may stay `Unknown`         | **Holds**, in prose.                                                                                                                                                                                                                                                                                                                    |
| Epistemic classes                | `EVIDENCE_POLICY.md` `Required`…`Unknown`                            | **Does not hold.** Different axis (asserted-strength vs produced-how), and zero occurrences in `src/`. See §3.                                                                                                                                                                                                                          |
| Hard precedence                  | `DIAGNOSIS_REMEDY_MATRIX.md` funnel-stage order                      | **Partly.** The matrix orders the **site's** funnel (crawl → render → index → … → conversion). B orders the **platform's own measurement health** (`MEASUREMENT FAILURE > OPTIMIZATION`, `FAILED VERIFICATION > OUTCOME LEARNING`). Only 2 of B's 7 share the matrix's axis.                                                            |
| Data-sufficiency gating          | `rule-buckets.ts` `Prerequisite` (15 named)                          | **Partly.** `Prerequisite` is the right analogue and it holds. `RuleBucket` is **not** — it classes _volume sufficiency_, not epistemic kind. And `unmetPrerequisites` is consumed by three view-model builders as explanatory sentences: it **explains empty screens, it gates nothing** (the module's own header: "Not enforcement"). |
| Provenance on every value        | `EVIDENCE_POLICY` fields; `dataforseo_snapshots`; `measurement_runs` | **Holds** for provider reads. Does **not** hold for findings — see decision replayability in §3.                                                                                                                                                                                                                                        |

What B asks for that this build has **deliberately declined** stands: multi-tenant
isolation testing (one tenant), a constraint solver (B1's OR-Tools/CP-SAT
suggestion), off-policy evaluation with logged propensities (nothing explores), a
learning promotion pipeline (nothing learns), and 13 domain contracts spanning
paid social, local SEO, backlinks and CRO — channels AOOS does not touch. B1's
own planning estimate is three to five senior engineers, and it labels that "a
planning estimate rather than an observed project estimate". This is one operator
and an agent.

**Adopting B's program wholesale would mean building ten domains that have no
data.** Harvesting its six ideas costs a fraction and closes real gaps.

---

## 5. Proposal A is the spine, with two excisions named

A1 fits for structural reasons.

- **It is a delta, not a rebuild.** Its stated exclusions (A1:10) are "rebuilding
  or replacing the existing second brain", and §13 instructs: "map every
  requested record and operation to the project's existing … contracts. Reuse an
  existing contract when it fits." That is AGENTS.md's surgical-diff rule.
- **It names this stack.** A1 §3 lists OpenSEO, n8n, LiteLLM, DataForSEO,
  Firecrawl, Crawl4AI, GSC, GA4, SerpApi — all present here (OpenSEO entered the
  registry two commits ago, CODE-94). Two of its §3 warnings are live traps
  here: self-hosting OpenSEO does not make DataForSEO free, and LiteLLM's
  DataForSEO adapter is a live-SERP route, not a keyword-metrics route. Its
  SearXNG and LangGraph assumptions describe the source conversation's host, not
  this one; neither exists here.
- **Its §7.2 converges on the unfilled page map — but less tidily than I first
  claimed.** §7.2 is **ten** record types, of which exactly one is the page map:
  "Page–query assignment: the intended primary topic/intent for a URL,
  supporting queries, status, and reviewer." That is **four** attributes against
  `SITE_PAGE_KEYWORD_MAP`'s **thirteen**; exclusions, funnel role and CTA,
  cannibalisation boundary, brand/claim dependencies, checksum and evidence
  window are all absent from A1. **The handbook is the better spec.** The
  convergence still matters — two independent attempts reaching for the same
  missing record is the strongest evidence here that it is the right build — but
  A1 does not supply its content.
- **Its §3 status ladder is house style already.** "Mentioned / Present /
  Configured / Authenticated / Integrated / Pilot-verified / Production-verified,
  do not collapse these into built" is README rule 2 in more words.

### Excision 1: the opportunity score (A1 §8 Step 3)

A1 proposes `business relevance + supported demand + attainable uplift +
conversion evidence + confidence − effort − risk − cost`. Of those eight terms
AOOS can source **two**. A weighted composite over six null inputs is precisely
`scoreBacklinkHealth` (CODE-63, seven factors hard-wired to null, deleted) and
the eight authority rules (CODE-64, waiting on evidence nothing produces,
deleted). It would be the third. A1's Opportunity record, which stores "all score
inputs", goes with it.

**But the excision costs something and §7 must pay for it.** A1's economics
depend on Step 3 gating Step 4 ("Enrich only the shortlist … stop at the
request/spend ceiling"). Remove the shortlist and there is none: today
`enrichPendingCandidates` sends the whole pending queue up to
`ENRICHMENT_BATCH_CAP = 1000`. Whatever replaces the score must still answer
**"which candidates are worth paying to enrich"**, or the recommendation has
quietly removed a cost control.

### Excision 2: A2 contributes no code, and fails its own checklist twice

Five of A2's six patterns exist here in TypeScript: Zod contracts at every server
boundary, SHA-256 content identity, registry modules as explicit topology,
bounded retries, and provider contracts separated by evidence role. A2's own
header says "FOR REFERENCE ONLY — NOT PRODUCTION-READY, NOT DROP-IN CODE".

Two lines of it fail today, which makes it useful as a checklist rather than
vacuous:

- **The injected HTTP client** exists in the execution loop but not where the
  pattern belongs: `dataforseo/transport.server.ts`, `serpapi/transport.server.ts`
  and `umami/client.server.ts` all call global `fetch`.
- **Normalization versioning** (A2 §2). The repo stores `content_sha256` on
  several tables and **no `normalization_version` anywhere** except the knowledge
  runtime's `parser_version`. Without it, changing how content is normalised
  silently invalidates every stored digest and no query can say which rule
  produced which. That is a column, and it is A2's second durable contribution
  after "never invented zeroes" (= README rule 1).

---

## 6. The verdict

**Build A, minus its score and its Opportunity record. Harvest six ideas from B.
Take no code from A2, and treat it as a checklist that currently fails twice.**

| Document | Verdict                     | Why                                                                                                                                            |
| -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1**   | **Spine, minus §8 Step 3**  | Right scope, right stack, converges on the page map. Its score would be the third null-input scaffold; its replacement must still bound spend. |
| **A2**   | **Checklist, not code**     | Five of six patterns already here in TypeScript; two lines fail today; `normalization_version` is worth a column.                              |
| **B1**   | **Harvest six ideas**       | Freshness gate, data-void ladder, replayability, epistemic class, contraindications, causal separation. Its program assumes 3–5 engineers.     |
| **B2**   | **Harvest §21.3/21.4/21.6** | The best decision logic in the set, landing on rules that exist. Its 13 phases and 13 domain contracts are an order of magnitude too large.    |

A wins **not** because B is wrong. B1 is the better-written document, and the
adversarial check showed I had undersold it: its doctrine is not redundant here,
because this project wrote that doctrine down and never put it in code. A wins
because **the hole is keyword-shaped**, A is the only one of the two scoped to
it, and B's best ideas can be harvested without adopting its program.

---

## 7. First moves

Ordered. Each checked against AGENTS.md. Note how much of step 1 already exists.

**1. Join query ownership onto the page map that is already half-built.**
`allowlist.ts:43-68` already asserts canonical URL → source file for 19 public
URLs, and `:33-42` already writes the reasoning for every deliberate exclusion
(staff-gated routes, noindex pages, slug routes whose wording is a data record).
**That is two of `SITE_PAGE_KEYWORD_MAP`'s thirteen fields plus the exclusions
rationale, in code and under test today.** The build is adding query ownership
and purpose to it, not creating a registry from nothing.

- No invented threshold: every field is an operator declaration or a stored
  provider value; an undeclared field renders as a named absence.
- No eighth category: it lives inside the existing `/keywords` route.
- Design fork to settle first: extend `tracked_keywords` (its unused `label`
  column would take a purpose today) or supersede it with a join table. Note
  `candidate_id` is nullable `ON DELETE SET NULL`, so the approved row's only
  link to its enrichment metrics is severable — an ownership table must carry
  its own intent or a `NOT NULL` link.

**2. Unblock enrichment for approved keywords before anything depends on it.**
`enrichPendingCandidates` can only ever see `review_state = 'pending'`. Until
that changes, the 50 approved keywords have no intent to prefill a purpose field
with, and step 1's nicest affordance is dead on arrival. This is a filter and a
code path, and it is a prerequisite for step 1 being useful rather than merely
correct.

**3. Group at the door, not in the detector.** `keyword-phrases.ts` already knows
50 spellings are 14 targets. Approval should operate on the target, so the queue
stops presenting 40 rows that are one decision.

**4. Give the detector an owner to check against.** Once a target has an owning
page, `detectKeywordsWithoutPage` stops concatenating every page into one string
and can ask the real question: does _the page that should own this_ carry it?
That converts a large share of "it needs a page" into "this page is not saying
what it is for", which existing lanes can already draft.

**5. Replace the score with a sort, and make the sort do the spending.** Once a
target carries an owning page and a declared intent, "which of these matters" is
answerable from stored rows: targets with no owner, targets two pages claim,
targets with impressions and no clicks. A sort with a stated key, not a score.
**It must also answer §5's debt** — which candidates are worth paying to enrich —
so the cost control A1 Step 3 provided is replaced rather than deleted.

**6. Rank against review capacity, not estimated impact.** There is one
operator. A1 routes six classes of judgement to human review and B2 proposes
twelve subagents with a reconciling orchestrator; for one person, **review
capacity is the binding constraint on everything downstream of the page map.**
Neither proposal notices this. Any ordering that ignores it will produce a queue
nobody can work, which is the state the bench already documents.

**7. Only then, the create-a-page lane — and it is cheaper than it looks.** Per
§2.5 the executor can already insert via an anchor. `content.blog_post` already
reaches `src/pages/blog/posts.ts` (`allowlist.ts:87`, `page-source-map.ts:63-67`)
and `posts.ts` is a record array, so an append-by-anchor into it would make a
keyword-driven brief publishable and provable through the **existing**
rendered-proof machinery. What it needs is an anchor policy, a `proposal_type`
literal, a CHECK migration, and B2 §21.6's guard so that a gap does not
automatically permit a page.

Steps 3–7 are each cheap **only after** step 1, and dishonest before it.

---

## 8. What only the operator can decide

- **Will you fill a page/query-ownership map by hand?** One declaration per page,
  about 19–30 of them. Neither proposal works without it and no provider can
  supply it: it is a statement about the business, not about search.
- **Should AOOS ever create a page, or only draft a brief you publish?** §7 step
  7 shows the first is cheaper than previously assumed. The second still needs
  nothing new.
- **Does "keyword" stay the unit on screen, or does "target" replace it?** Step 3
  changes what you are approving. That is a product decision.
- **How does a new page get measured, given the deployment split?** The executor
  writes page changes to `brittmove-829a7519` (`allowlist.ts:17`), the website's
  own repository, which is correct. But AOOS's _own_ features — the map, the
  lane — do not reach production until the reconciliation push and a Lovable
  publish (`DEPLOYMENT_TOPOLOGY.md` §5, CURRENT_BUILD §0n). A1 §8 Step 8 assumes
  staging through "the current publishing workflow" and a CMS, and knows nothing
  of this. Worth settling before, not after.

---

## 9. What the adversarial check changed

Recorded so the next reader knows which claims were tested rather than asserted.

| First draft said                                              | Corrected to                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "an operator approves them one at a time"                     | Bulk approval by array, three candidate sources. Strengthens the point; the stated fact was false.                        |
| "nothing reads intent and difficulty back"                    | The route renders both as pills. Nothing **consumes** them — and enrichment cannot reach approved keywords at all.        |
| Four governed change kinds                                    | Seven. All share one write path.                                                                                          |
| "there is no insertion or creation kind"                      | True of the declared kinds, **false of the mechanism**: `applyExactReplacements` inserts via an anchor. A lane is cheap.  |
| A1 §7.2 "is almost exactly" the page map                      | §7.2 is ten records; one is the page map, with 4 fields against the handbook's 13. The handbook is the better spec.       |
| `RuleBucket` "already is an epistemic class"                  | It classes volume sufficiency. `Prerequisite` is the right analogue, and it explains rather than gates.                   |
| `EVIDENCE_POLICY` labels "already are" B's epistemic classes  | Different axis, and **zero occurrences in `src/`**. B's ask is real.                                                      |
| The matrix "already is" B's hard precedence                   | Different axis; only 2 of B's 7 overlap.                                                                                  |
| B is "mostly a restatement of doctrine this repo already has" | **The repo has the doctrine in prose and not in code.** B asks us to execute what we wrote. Its harvest grew from 3 to 6. |
| B2 assumes 3–5 engineers; 11 contracts; 12 phases             | The estimate and the solver are B1's, not B2's. B2 has 13 contracts and 13 phases.                                        |
| "all six A2 patterns already exist here"                      | Two fail today (global `fetch` in three transports; retry limit 4 vs 3), and `normalization_version` is a real gap.       |
| 111 / 2 / 47 as facts                                         | An undated prose comment; CODE-51 says 115; CODE-93 makes 47 stale in its own branch. Needs a live read.                  |
| First build creates a page registry                           | Two of thirteen fields plus the exclusions rationale already exist in `allowlist.ts`. It is a join, not a greenfield.     |

## Related

- [Site, Page, and Keyword Map](../../execution-handbook/SITE_PAGE_KEYWORD_MAP.md) — the record this argues for filling
- [Evidence Policy](../../execution-handbook/EVIDENCE_POLICY.md) — written, and absent from `src/`
- [Diagnosis and Remedy Matrix](../../execution-handbook/DIAGNOSIS_REMEDY_MATRIX.md) — a decision contract nothing executes
- [Backlog](../../context/BACKLOG.md) — CODE-3, CODE-51, CODE-63, CODE-64, CODE-72, CODE-93, CODE-94 are cited above
- [Deployment topology](../../context/DEPLOYMENT_TOPOLOGY.md) — why "measured the same way" is not yet settled
