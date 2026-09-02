# Which keyword iteration fits

**Date:** 2026-09-02. **Status:** assessment. Nothing here is built and nothing
here is approved. It answers one question the operator asked with four
architecture documents in hand: which of them, or which combination, should
decide how keywords work in AOOS.

Four independent reviewers were pointed at the first draft of this file with
instructions to refute it. All four returned "sound with corrections", and
enough of the corrections changed the answer that §10 records every one against
what the draft had said. The headline reversal: **the first break is not
semantic.** Before any question of what a keyword means, approving one starts
nothing at all.

---

## 1. The four documents are two proposals

They read as four options and they are not. Two share a source conversation and
a SHA-256; the other two are a research report and the implementation prompt
that report ends by sketching.

| Proposal                              | Documents                                                               | Lines     | What it is                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| **A — Keyword Authority Engine**      | A1 cleaned handoff; A2 Python reference (same source, SHA `FE1229…`)    | **962**   | An explicitly **in-place keyword delta** into a system it refuses to rebuild.                         |
| **B — Decision Intelligence Runtime** | B1 deep research report; B2 master prompt (expands B1's closing prompt) | **5,570** | A **platform-wide reasoning runtime**: 13 phases, 32 deliverables, 13 domain contracts (§21.1–21.13). |

The question is not "which of four" but **A or B, and what gets harvested from
the loser.**

---

## 2. What is actually broken

The operator's sentence is right, and the diagnosis is in five layers. They are
ordered by **which one bites first**, not by which is most interesting. The
first two are bugs. Only the fifth is the architectural gap both proposals are
written about.

### 2.1 Approving a keyword starts nothing

`decideKeywordCandidates` (`keywords.functions.ts:85-96`) writes an activity
row, reconciles an inbox item, and returns. The only workflow that reads the
approved set is `dfs-targeting-pass`, registered `triggerKind: "manual"`
(`registry/modules/dataforseo.ts:388-397`). Grep finds **no cron, no schedule
and no post-approval hook** for it anywhere in `src/`, `supabase/` or `ops/`.

**An operator can approve fifty keywords and the platform does nothing, forever,
unless they independently know to open `/workflows` and press a button.**

That is the answer to "the platform has no idea what keywords are supposed to
do" at its most literal, and no document in the set diagnoses it. It is also the
cheapest thing on this page to fix.

### 2.2 Approval is a lossy transaction

`approveKeywords` (`keywords.server.ts:407-454`) copies five columns into
`tracked_keywords`: keyword, locale, `candidate_id`, `approved_by`, `active`.
The candidate row it reads from already carries search volume, CPC, competition,
keyword difficulty, search intent, the competitor it came from and that
competitor's SERP position. **All of it is dropped at the click, and DataForSEO
was paid for some of it.**

The resulting row is the whole of what an approved keyword is:

```
tenant_id, keyword (lowercased string), location_code (2840), language_code ('en'),
candidate_id, approved_by, approved_at, active, created_at, label
```

`label` is a nullable free-text column that would take a purpose today. Nothing
writes it and nothing reads it. And `candidate_id` is nullable
`ON DELETE SET NULL`, so the only path back to the discarded metrics is
severable by design.

Meaning is not missing from this pipeline. **It is destroyed at the moment of
approval**, which is both truer than "keywords arrive with no purpose" and much
cheaper to fix.

### 2.3 The intent that was bought cannot reach the keywords that matter

`keyword-enrichment.server.ts` buys `bulk_keyword_difficulty` and
`search_intent`, and the route renders both as operator pills
(`keywords.tsx:322-331`), so they _are_ read back. What consumes them is
nothing: `targeting-rules.server.ts:43-51` selects only `keyword` from
`tracked_keywords`, so no rule can reach them.

Worse, `enrichPendingCandidates` filters `.eq("review_state", "pending")`
(`:117-121`) and the button is `disabled` at `counts.pending === 0`
(`keywords.tsx:279`). **The 50 already-approved keywords can never be enriched
at all** without a database edit. The disabled control is itself an AGENTS.md
violation ("A verb that is not legal renders _nothing_, never a disabled
button").

### 2.4 "It needs a page" is a claim about the reading, not about the site

`readPageText` selects `url, title, h1` (`targeting-rules.server.ts:99-107`) and
`detectKeywordsWithoutPage` concatenates every page's title and H1 into **one
string** before asking whether a phrase is covered (`targeting-rules.ts:161`).

Two consequences:

- A page whose body answers the target but whose heading is worded differently
  is reported as "No page here is about X", which routes to "it needs a page".
- Because the corpus is one concatenated string, the rule **cannot name an
  owner** even in principle. `detectKeywordCannibalization` matches per page and
  can name competitors; nothing can name the page that _should_ own a term.

And the fix is already written. `closestPageFor` (`keyword-phrases.ts:175-196`)
finds the nearest page by shared content words and returns the words it is short
of, with "nothing at all rather than a weak guess" when no page shares one. Its
docstring says it exists precisely because "it needs a page" was a hardcoded
sentence with no logic behind it. **Its only callers are its own tests.** The
sentence is still hardcoded.

### 2.5 Only then: nothing records what a keyword is for

No owning page, no intent, no cluster, no funnel role, no exclusion, no business
relevance. This is the layer both proposals are actually about, and it is the
fourth thing to fix, not the first.

No lane writes a page either — but **the executor is not the reason.**
`applyExactReplacements` (`source-change.ts:62-97`) requires `before` to occur
exactly once and `after` zero times, then does `next.replace(before, after)`. An
anchor-plus-append pair satisfies both, so **the engine can insert.** CODE-3's
`h2_missing` is blocked by the absence of an _anchor policy_, not by the engine.
Seven governed change kinds exist (`allowlist.ts:74-95`) and `content.blog_post`
already reaches `src/pages/blog/posts.ts`, a record array. A create-a-page lane
is a convention, a `proposal_type` literal and a CHECK migration.

### The counts everyone quotes are not measurements

`workbench.ts:4-14` says 111 findings, 2 drafted from, "47 want a page written".
That is a **prose doc comment**: no cited query, no date, no asserting test.
CODE-51 independently puts the population at 115, and the keyword-grouping fix
shipped one commit _after_ the bench and re-groups the very rule behind the "47"
bucket. Per §2.4 the bucket is also inflated by a two-field corpus. The shape is
real; **do not size a create-a-page lane from these numbers without a live
read.**

### The pattern underneath

The keyword hole is one instance of this project's characteristic failure:

> **It writes the governing contract, and does not instantiate it.**

- `SITE_PAGE_KEYWORD_MAP.md` (2026-08-14) specifies thirteen fields. Its registry
  says `BLOCKED`, "No individual mappings are asserted here." **Specified,
  empty**, and BACKLOG CARRY-8 re-verified against the live database on
  2026-08-29 that no page-purpose table exists.
- `EVIDENCE_POLICY.md` defines claim labels `Required` / `Supported` / `Probable`
  / `Hypothesis` / `Unknown` and three recommendation labels. Grepped across
  `src/`: `Probable`, `Hypothesis` and all three recommendation labels return
  **zero files**. `recommendations` ships one `confidence numeric(3,2) DEFAULT
0.50` and free-text `reasoning`. **Written, never typed.**
- `DIAGNOSIS_REMEDY_MATRIX.md` is a decision contract with required evidence,
  permitted remedies and prohibited leaps per funnel stage. **Nothing in `src/`
  executes its stage order.**
- `closestPageFor` is the same failure one level down: written, tested, uncalled.

That reframes Proposal B, and §3 turns on it.

---

## 3. What Proposal B genuinely adds

My first draft said B was "mostly a restatement of doctrine this repo already
has". That is wrong, and the way it is wrong is the finding: **the repo has the
doctrine in prose and does not enforce it.** B is not asking us to re-derive what
we know. It asks us to execute what we only wrote.

Six things, by value-per-hour here:

- **The measurement-integrity gate** (B1's precedence list; B2 §7, §21.1). AOOS
  raises findings from stored snapshots with no check that the collection is
  current. One gate that refuses to raise or draft from a source past its
  freshness limit closes it. Cheap, genuinely absent.

- **The data-void escalation ladder** (B1 "'Void' or sparse-data logic"; B2
  §15.2, §21.6). **The most relevant idea in B for this property.** B forbids
  `search volume = 0 → opportunity = 0` and enumerates what to inspect instead:
  first-party GSC impressions, customer questions, sales-call language, support
  requests, paid search terms, adjacent intents, jobs-to-be-done.
  `rule-buckets.ts:119-123` names this exact problem — the query dimension is
  "mostly anonymized away" at this volume — and then stops. B says what comes
  next.

- **Decision replayability** (B1; B2 §4.3). `recommendations` stores no snapshot
  reference, no rule version, no code revision; `targeting-rules.server.ts:166`
  writes `reasoning` as a literal sentence. **A finding cannot be
  reconstructed.** A snapshot id and a rule version is one migration.

- **Epistemic class on the stored value.** B1's ten classes type how a value was
  _produced_; `EVIDENCE_POLICY`'s five label how strongly a claim is _asserted_.
  Different axes, and neither exists in code. This is the discipline whose
  absence produced CODE-51 (one hand-set impact level copied into 111 findings
  as two more "facts") and CODE-72 (a placeholder `0` rendered as a
  measurement). The repo has paid for it twice.

- **Exclusions and contraindications.** `rule-buckets.ts` gives every rule its
  _prerequisites_ — what must hold before it may speak. Nothing gives a rule its
  _disprovers_. B2 §9–§10 call these `exclusionConditions` and
  `contraindications`; `SITE_PAGE_KEYWORD_MAP` calls the page-level version
  `exclusions`. **B and this project's own unfilled schema arrive at the same
  concept independently.**

- **B2 §21.3 and §21.6.** §21.3 (low CTR must not automatically become a rewrite;
  check intent mismatch and cannibalisation first) is a procedure for
  `weak_ctr_page`, which today maps unconditionally to the `page_metadata` lane
  (`finding-fix-target.ts:49`) the moment it fires. §21.6 (**"a keyword gap does
  not automatically permit a page"**) is the guard a create-a-page lane needs.
  §21.4 is worth reading but buys less than I first claimed: `position_loss` and
  `declining_position` already sit in `NO_LANE_REASON` saying the cause is not
  in the evidence, so §21.4 documents a refusal the repo already makes.

**Where B supports the recommendation rather than opposing it:** B1 explicitly
says "Not every tenant needs a solver on day one. A deterministic prioritized
queue is sufficient initially." That is exactly where §8 step 6 lands. My first
draft listed the solver as a B excess; it is B's own advice against itself.

---

## 4. What B restates, and where the parallel is looser than it looks

Three of the four equivalences I first claimed do not survive.

| B asks for                       | Nearest AOOS analogue                         | Does it hold?                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Causal-evidence ladder (8 tiers) | `EVIDENCE_POLICY` hierarchy, 7 levels         | **Holds** — in prose. Nothing checks it.                                                                                                                                                                                  |
| Abstention as first-class        | `DIAGNOSIS_REMEDY_MATRIX`: may stay `Unknown` | **Holds** — in prose.                                                                                                                                                                                                     |
| Epistemic classes                | `EVIDENCE_POLICY` `Required`…`Unknown`        | **No.** Different axis, and zero occurrences in `src/`.                                                                                                                                                                   |
| Hard precedence                  | `DIAGNOSIS_REMEDY_MATRIX` funnel order        | **Partly.** The matrix orders the **site's** funnel (crawl → render → index → … → conversion). B orders the **platform's own measurement health** (`MEASUREMENT FAILURE > OPTIMIZATION`). Only 2 of B's 7 share the axis. |
| Data-sufficiency gating          | `rule-buckets.ts` `Prerequisite` (15 named)   | **Partly.** `Prerequisite` is the right analogue. `RuleBucket` is **not** — it classes _volume sufficiency_. And prerequisites gate whether a rule may fire, not whether a finding should abstain.                        |
| Provenance                       | `dataforseo_snapshots`, `measurement_runs`    | **Holds** for provider reads; **fails** for findings (see replayability, §3).                                                                                                                                             |

What B asks for that this build has genuinely declined stands: multi-tenant
isolation testing (one tenant), off-policy evaluation with logged propensities
(nothing explores), a learning promotion pipeline (nothing learns), and 13 domain
contracts spanning paid social, local SEO, backlinks and CRO — channels AOOS does
not touch. On scale, the checkable statement is not B1's "three to five senior
engineers" planning estimate but **B2's opening, which assigns twelve
simultaneous senior architect and lead roles to one implementer.** This is one
operator and an agent.

---

## 5. Proposal A is the spine, with two excisions named

- **It is a delta, not a rebuild.** A1's stated exclusions are "rebuilding or
  replacing the existing second brain"; §13 instructs "map every requested record
  and operation to the project's existing … contracts. Reuse an existing contract
  when it fits." That is AGENTS.md's surgical-diff rule.
- **It names this stack.** OpenSEO, n8n, LiteLLM, DataForSEO, Firecrawl,
  Crawl4AI, GSC, GA4, SerpApi — all present (OpenSEO entered the registry two
  commits ago, CODE-94). Two §3 warnings are live traps here: self-hosting
  OpenSEO does not make DataForSEO free, and LiteLLM's DataForSEO adapter is a
  live-SERP route, not a keyword-metrics route. Its SearXNG and LangGraph
  assumptions describe the source conversation's host; neither exists here.
- **It converges on the page map, as a second witness only.** §7.2 is **ten**
  record families, of which exactly one is the page map: "Page–query assignment:
  the intended primary topic/intent for a URL, supporting queries, status, and
  reviewer." **Four attributes against `SITE_PAGE_KEYWORD_MAP`'s thirteen** —
  exclusions, funnel role and CTA, cannibalisation boundary, brand/claim
  dependencies, checksum and evidence window are all absent from A1. **The
  handbook is the richer spec and must not be displaced by A1's.** The
  convergence still matters: two independent attempts reaching for the same
  missing record is the strongest evidence here that it is the right build.

### Excision 1: the score, in both places it appears

A1 §8 Step 3 proposes `business relevance + supported demand + attainable uplift

- conversion evidence + confidence − effort − risk − cost`. AOOS can source
**two** of the eight terms. A weighted composite over six null inputs is
`scoreBacklinkHealth` (CODE-63, seven factors hard-wired to null, deleted) and
  the eight authority rules (CODE-64, deleted). It would be the third.

**Excising Step 3 is not enough.** §7.2 also mandates an **Opportunity record**
carrying "trigger rule, all score inputs, policy version, evidence references,
projected provider cost, confidence, and lifecycle state". Adopting §7.2 while
refusing only Step 3 imports the same shape through the data contract instead of
the algorithm. **Both must be refused by name.**

**And the excision incurs a debt.** A1's economics depend on Step 3 gating Step 4
("Enrich only the shortlist … stop at the request/spend ceiling"). Today
`enrichPendingCandidates` sends the whole pending queue up to
`ENRICHMENT_BATCH_CAP = 1000`. Whatever replaces the score must still answer
**"which candidates are worth paying to enrich."**

**The line to hold is composite-over-nulls versus sort-over-facts, not scoring
versus no scoring.** The repo already ships a defensible ordering:
`suggestion-queue.ts:263-320` sorts by urgency rank, then longest wait, then id
for stability, over stored timestamps and stored state, with its one chosen
number carrying a written `Stated assumption` after CODE-83. A keyword ordering
built the same way is legal today.

### Excision 2: A2 is a checklist, and it fails twice

Five of A2's six patterns exist here in TypeScript, and its own header says "FOR
REFERENCE ONLY — NOT PRODUCTION-READY, NOT DROP-IN CODE". Two lines fail today,
which is what makes it useful rather than vacuous:

- **The injected HTTP client** exists in the execution loop but not where the
  pattern belongs: `dataforseo/transport.server.ts`, `serpapi/transport.server.ts`
  and `umami/client.server.ts` all call global `fetch`.
- **Normalization versioning** (A2 §2). The repo stores `content_sha256` on
  several tables and **no `normalization_version` anywhere** except the knowledge
  runtime's `parser_version`. Without it, changing how content is normalised
  silently invalidates every stored digest. That is one column, and it is A2's
  second durable contribution after "never invented zeroes" (= README rule 1).
  (Its retry limit of three against the repo's `TRANSIENT_ATTEMPTS = 4` is a
  difference, not a defect.)

---

## 6. The verdict

**Fix the two bugs first. Then build A, minus its score in both places. Harvest
six ideas from B. Take no code from A2.**

| Document | Verdict                                           | Why                                                                                                                                                        |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1**   | **Spine, minus §8.3 + §7.2's Opportunity record** | Right scope, right stack, second witness for the page map. Its score would be the third null-input scaffold; its removal owes a spend control.             |
| **A2**   | **Checklist, not code**                           | Five of six patterns already here; two fail today; `normalization_version` is worth a column.                                                              |
| **B1**   | **Harvest six ideas**                             | Freshness gate, data-void ladder, replayability, epistemic class, contraindications, causal separation. And it argues _against_ the solver, in our favour. |
| **B2**   | **Harvest §21.3 and §21.6**                       | The best decision logic in the set. §21.4 documents a refusal we already make. Its 13 phases and 13 domain contracts are an order of magnitude too large.  |

A wins **not** because B is wrong. B1 is the better-written document, and the
adversarial pass showed I had undersold it: its doctrine is not redundant here,
because this project wrote that doctrine down and never enforced it. A wins
because **the hole is keyword-shaped**, A is the only one of the two scoped to
it, and B's best ideas harvest cleanly without its program.

Neither proposal, however, diagnoses §2.1 through §2.4. **The four cheapest and
most valuable fixes on this page come from reading the code, not from either
document.**

---

## 7. Two design forks to settle before any of it

Both were found by the adversarial pass, and both will break on day one if
unanswered.

**Fork 1: derived ownership versus declared ownership.** `targeting-rules.ts`
already _derives_ which page owns a term from title/H1 word sets. A declared map
creates a second, authoritative answer. `SOURCE_OF_TRUTH.md` requires recording
a contradiction rather than silently picking the convenient source. Nobody has
said whether the declaration overrides the derivation, whether
`approved_keyword_no_page` stops firing for a mapped target whose page does not
carry the words, or where the disagreement gets filed.

**Fork 2: where the map lives.** The governing contract is a markdown registry in
`docs/execution-handbook/`. AGENTS.md requires the matching handbook document to
be updated in the same change, and those 16 files are ingested input data, so
editing `SITE_PAGE_KEYWORD_MAP.md` moves the pinned token estimate in
`scripts/ingest-governed-knowledge.test.ts` and the script must be re-run in the
same commit. Table or document canonical is undecided, and two stores of one
record is exactly the drift CLAUDE.md's pointer-not-copy rationale exists to
prevent.

**One rule that follows from both, and from doctrine:** never merge provider
intent with declared intent. `SITE_PAGE_KEYWORD_MAP` forbids filling any
assignment with inferred data, and `EVIDENCE_POLICY` puts proprietary tool scores
at hierarchy level 7, "for triage or drafting only". A prefilled default an
operator clicks through stores a level-7 inference as a level-1 declaration.
Store `provider_intent` (stored, provenanced, never authoritative) and
`declared_intent` (null, rendered as a named absence until stated) as **two
columns**.

---

## 8. First moves

Ordered by what bites first. Steps 1–4 are bugs and wiring, not architecture,
and none of them needs either proposal.

1. **Make approval start something.** `dfs-targeting-pass` is manual with no
   hook (§2.1). Either fire it after `decideKeywordCandidates` or put it on the
   observation cadence beside the other reads. Until this exists, every other
   improvement is invisible to the operator.

2. **Stop discarding what approval was given.** Carry volume, CPC, competition,
   difficulty and intent forward onto the approved row (§2.2), and let a rule
   select more than `keyword`. Note `candidate_id` is `ON DELETE SET NULL`, so
   the ownership record must carry its own values or a `NOT NULL` link.

3. **Call `closestPageFor`.** It is written, tested and uncalled (§2.4).
   Wiring it turns "it needs a page" from a hardcoded sentence into a named
   nearest page and the words it is short of. This is the single highest
   ratio of value to effort on this page.

4. **Fix the two doctrine violations found on the way:** the `disabled` Score
   button (`keywords.tsx:279`), and enrichment's inability to reach approved
   keywords (§2.3).

5. **Then the ownership record**, joining onto work that already exists:
   `allowlist.ts:43-68` already asserts canonical URL → source file for 19 public
   URLs, and `:33-42` already writes the reasoning for every deliberate
   exclusion. **That is two of the handbook's thirteen fields plus the exclusions
   rationale, in code and under test today.** Settle §7's two forks first.

6. **Replace the score with a sort, on the `suggestion-queue` pattern**
   (§5): a lexicographic sort over non-null stored facts, every tie-break named
   on screen, no coefficients. It must also answer which candidates are worth
   paying to enrich, or A1's spend control has been deleted rather than replaced.

7. **Rank against review capacity, not estimated impact.** There is one operator.
   A1 routes six classes of judgement to human review and B2 proposes twelve
   subagents; for one person **review capacity is the binding constraint on
   everything downstream of the map**. Neither proposal notices this.

8. **Only then, the create-a-page lane** — cheaper than it looks (§2.5), but see
   §9 first, and do not size it from the "47" (§2).

**Struck from the first draft:** "read back what was already bought". The route
already renders difficulty and intent as pills. It shipped.

**Deferred deliberately:** the unit-of-approval change (keyword → target). It
reads as a sequencing step and it is a **schema fork**: `tracked_keywords` is
`UNIQUE (tenant_id, keyword, location_code, language_code)` and six live
consumers read keyword strings. It is a migration, not a step.

---

## 9. What only the operator can decide

- **Will you fill a page/query-ownership map by hand?** One declaration per page,
  about 19–30 of them. Neither proposal works without it, and no provider can
  supply it: it is a statement about the business, not about search.
- **What corpus decides "this page is about X"?** Today it is title and H1 only
  (§2.4). Judging ownership on two fields is why a share of the "needs a page"
  findings exist. Widening it is a collection decision with a cost.
- **How would anyone know a mapping was wrong?** Every governed object here is
  graded against a rendered proof of an exact string. **An ownership declaration
  produces no change, so nothing in the existing measurement machinery can grade
  it**, and a wrong mapping would silently mis-route every rule that reads it.
  The handbook already reserves `owner/status/last review` for freshness; a
  review cadence and a falsification path have to be chosen. Both proposals
  assume an outcome record (A1 §7.2 "Experiment/outcome"; B2 §20) and this
  assessment had dropped it.
- **Create a page, or draft a brief you publish?** The executor writes to
  `brittmove-829a7519` (`allowlist.ts:17`), the website's own repository, which
  is correct for page changes. But rendered proof binds to the governed file
  allowlist, so a hand-published page is provable by nothing; and AOOS's own
  features do not reach production until the reconciliation push and a Lovable
  publish (`DEPLOYMENT_TOPOLOGY.md` §5, CURRENT_BUILD §0n). A1 §8 Step 8 assumes
  a CMS and knows none of this. **The brief may be the right primary answer
  rather than the fallback**, and neither proposal costs the difference.

---

## 10. What the adversarial check changed

Recorded so the next reader knows which claims were tested rather than asserted.
Four reviewers, four lenses (code facts, document fidelity, repo doctrine,
independent operator trace).

| First draft said                                             | Corrected to                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The break is that keywords carry no purpose                  | **The first break is that approval fires nothing** (`dfs-targeting-pass` is manual, no hook). No document diagnoses it.                     |
| Keywords "enter with no purpose attached"                    | **Approval is a lossy transaction**: it drops volume, CPC, competition, difficulty, intent and competitor position, some of it paid for.    |
| "nothing reads intent and difficulty back"                   | The route renders both as pills. Nothing **consumes** them, and enrichment cannot reach approved keywords at all.                           |
| "Read back what was already bought" as first-move 3          | **Struck.** Already shipped.                                                                                                                |
| 47 findings want a page written                              | An undated prose comment; CODE-51 says 115; the grouping fix postdates it; and the bucket is inflated by a title+H1-only corpus.            |
| Four governed change kinds                                   | Seven. All share one write path.                                                                                                            |
| "there is no insertion or creation kind"                     | True of the declared kinds, **false of the mechanism**: `applyExactReplacements` inserts via an anchor. A lane is cheap.                    |
| The detector just lacks an owner field                       | It concatenates all pages into one string, so it **cannot** name an owner — and `closestPageFor` already solves it and is **never called**. |
| A1 §7.2 "is almost exactly" the page map                     | Ten records; one is the page map, 4 fields against the handbook's 13. The handbook is richer and must not be displaced.                     |
| Excise A1 §8 Step 3                                          | **Also §7.2's Opportunity record**, or the same shape enters through the data contract.                                                     |
| Excising the score is free                                   | It removes A1's only spend control. The replacement owes an answer on what to pay to enrich.                                                |
| Prioritisation is off the table                              | Over-broad. `suggestion-queue.ts` already sorts defensibly. The line is composite-over-nulls vs sort-over-facts.                            |
| `RuleBucket` "already is an epistemic class"                 | It classes volume sufficiency. `Prerequisite` is the analogue, and it gates rule firing, not abstention.                                    |
| `EVIDENCE_POLICY` labels "already are" B's epistemic classes | Different axis, and **zero occurrences in `src/`**. B's ask is real.                                                                        |
| The matrix "already is" B's hard precedence                  | Different axis; only 2 of B's 7 overlap.                                                                                                    |
| B is "mostly a restatement of doctrine this repo has"        | **The repo has it in prose and does not enforce it.** B's harvest grew from 3 ideas to 6.                                                   |
| B assumes a solver                                           | B1 says the opposite: "a deterministic prioritized queue is sufficient initially". It argues our case.                                      |
| B2 assumes 3–5 engineers; 11 contracts; 12 phases            | The estimate and solver are B1's. B2 has 13 contracts, 13 phases, and assigns **twelve senior roles to one implementer**.                   |
| B2 §21.4 lands on a rule we have                             | Both rules already sit in `NO_LANE_REASON`. It documents a refusal we already make.                                                         |
| "all six A2 patterns already exist here"                     | Two fail today (global `fetch` in three transports; `normalization_version` absent everywhere).                                             |
| First build creates a page registry                          | Two of thirteen fields plus the exclusions rationale already exist in `allowlist.ts`. It is a join.                                         |
| Grouping at the door is step 2 of five                       | It is a **schema fork**: the primary key changes and six live consumers read keyword strings. Deferred.                                     |
| (unraised)                                                   | Two forks: derived vs declared ownership, and table vs handbook canonical. Plus: never merge provider intent with declared intent.          |
| (unraised)                                                   | An ownership declaration produces no change, so **nothing can grade it**. Both proposals have an outcome record; this draft had dropped it. |

One claim the check could not settle: **CODE-93 does not appear in
`BACKLOG.md`.** The 50-to-14 figure is real (`targeting-rules.ts:147`,
`keyword-phrases.ts:1-26`) but the ID resolves only to code comments and a commit
body. Per AGENTS.md it should be filed, or cited by file instead.

## Related

- [Site, Page, and Keyword Map](../../execution-handbook/SITE_PAGE_KEYWORD_MAP.md) — the record this argues for filling, and the richer of the two specs
- [Evidence Policy](../../execution-handbook/EVIDENCE_POLICY.md) — written, and absent from `src/`
- [Diagnosis and Remedy Matrix](../../execution-handbook/DIAGNOSIS_REMEDY_MATRIX.md) — a decision contract nothing executes
- [Source of truth](../../execution-handbook/SOURCE_OF_TRUTH.md) — why fork 1 must be recorded rather than resolved by convenience
- [Backlog](../../context/BACKLOG.md) — CODE-3, CODE-51, CODE-63, CODE-64, CODE-72, CODE-83, CODE-94, CARRY-8 are cited above
- [Deployment topology](../../context/DEPLOYMENT_TOPOLOGY.md) — why "measured the same way" is not yet settled
