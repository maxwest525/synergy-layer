# Google Autocomplete as a non-metered candidate source

**Status:** specified, not built. Filed as CODE-99.
**Date:** 2026-09-04
**Asked for by:** the operator, 2026-09-04, after asking whether the endpoint
people use for "phrases and keywords" was worth having.

## Why this exists

The operator's standing rule, given 2026-09-02, is that OpenSEO and other
non-metered providers come first. Today keyword discovery is entirely metered:
`suggestKeywords` makes one `keywords_for_site` call plus one
`keyword_suggestions` call per seed, up to `KEYWORD_CONFIG.maxSeeds`, and every
one of them is billed. Every candidate AOOS has ever seen was paid for.

Google Autocomplete is the same expansion, free. It is what
`suggestqueries.google.com/complete/search` returns, and it is the source
underneath most of the free keyword tools. Used as a first pass it does not
replace DataForSEO — it decides *which* keywords are worth paying DataForSEO
to measure.

## What it is, and what it is not

The operator's link was to Google Cloud Search `Query.suggest`
(`cloudsearch.googleapis.com/v1/query/suggest`). That is a different product:
enterprise search over a Workspace tenant's own indexed datasources. It cannot
answer anything about public search demand and is not what this spec uses.

The endpoint this spec uses is:

```
https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=<phrase>
```

`client=firefox` returns `["<query>", ["suggestion", ...]]` — a bare JSON
array, no wrapper. `client=chrome` returns a fifth element with Google's own
type annotations and relevance ordering; this spec uses `firefox` because the
extra fields are undocumented and the repo may not read a number it cannot
source.

**It returns phrases and nothing else.** No search volume, no CPC, no
competition, no difficulty, no intent. Anything this source files carries
`metrics: null`, never a zero.

## The rule this collides with, and how it is handled

AGENTS.md requires a `docs/integrations/<provider>/DIGEST.md` written from the
vendor's own documentation *before* any integration code. Google publishes no
documentation for this endpoint. It is undocumented, and automated querying of
it is contrary to Google's terms of service.

That contradiction is recorded rather than resolved quietly, per
`SOURCE_OF_TRUTH.md`. The handling:

1. The digest for this provider is written **from observed behaviour**, dated,
   and states at the top that it is reverse-engineered and that no vendor
   documentation exists. It is not presented as authoritative.
2. Nothing in AOOS reads a number from this source, so there is no threshold
   or metric to ground. It contributes strings only. Rule 4 (no invented
   thresholds) is satisfied by having nothing to invent.
3. The operator sees, on the button and in the result, that this source is
   unofficial. That is the disclosure; the decision to press it stays theirs.

If the operator would rather not use an undocumented endpoint at all, the
alternative is DataForSEO's own Google Autocomplete endpoint, which is
documented and metered. That is a one-line swap of the transport in step 2
below; nothing else in this spec changes.

## Where it goes in the existing pipeline

The pipeline today, all of it in `src/lib/dataforseo/keywords.server.ts`:

```
seeds ─▶ labs.keywords_for_site  ─┐
        labs.keyword_suggestions ─┴─▶ isRelevant ─▶ rankByVolume ─▶ keyword_candidates
```

With this source:

```
seeds ─▶ autocomplete (free) ─▶ isRelevant ─▶ redundantAgainst ─▶ keyword_candidates
                                                                   (metrics: null)
                                                                        │
                                                     operator selects ──┘
                                                                        ▼
                                                     enrichPendingCandidates (metered)
```

The free pass fills the queue. The metered pass measures only what survived.

## Specification

### 1. Seeds

Reuse the existing ladder exactly — `readTenantSeeds`, then `readSeedQueries`,
then `readSeedsFromSite`, and throw the same error when all three are empty.
No new seed logic. Cap at `KEYWORD_CONFIG.maxSeeds`, as the metered path does.

### 2. The fetch

New file `src/lib/autocomplete/transport.server.ts`:

```ts
export async function fetchSuggestions(
  phrase: string,
  opts: { hl: string; gl: string; signal?: AbortSignal },
): Promise<string[]>
```

- One request per seed, **sequential**, with a fixed delay between them.
  Concurrency is what gets an IP blocked.
- Per-request timeout. A timeout is a failed seed, not an empty result — the
  two are different sentences and the caller is told which.
- Non-200, malformed JSON, or a response that is not `[string, string[]]`
  returns a named failure. It never returns `[]` to mean "the call failed",
  because that is indistinguishable from "Google had no suggestions".
- No API key, no credential, nothing to store in `.env`.

### 3. Expansion depth

Two passes, both free:

- **Pass 1** — each seed verbatim.
- **Pass 2** — each seed suffixed with a single letter `a`–`z` and with a
  leading question word (`how`, `where`, `what`, `who`, `why`, `when`, `is`,
  `can`, `best`, `cheap`, `near me`). This is the alphabet-soup technique the
  free tools use.

That is `maxSeeds × 37` requests at most. At `maxSeeds = 5` that is 185
requests. Sequential with the delay in step 2, that is minutes, not seconds —
so it runs as a workflow node with progress, not inside a click handler that
blocks the page.

Pass 2 is opt-in per run. The button offers "seeds only" (fast) and "expand"
(slow, many more candidates). Default is seeds only.

### 4. Filtering, in this order

1. **Relevance** — the existing `isRelevant` closure over `phraseTokens`,
   unchanged. Autocomplete will return navigational and brand junk for a
   two-word seed and this is the filter that already handles that.
2. **Dedupe against itself** — `phraseKey` from `src/lib/keyword-phrases.ts`.
   The alphabet pass returns the same phrase from many letters.
3. **Dedupe against approved** — `redundantAgainst` (CODE-98). A phrase an
   active approved keyword already covers is never filed as a candidate.
4. **Dedupe against pending** — the existing `onConflict` on
   `(tenant_id, keyword, location_code, language_code)` with
   `ignoreDuplicates: true` handles this; no new code.

No volume filter, because there is no volume. No cap on candidates per run
beyond `KEYWORD_CONFIG.maxCandidatesPerRun`, applied by arrival order rather
than `rankByVolume`, since ranking by volume is impossible here. The screen
says the order is arrival order and not a judgement.

### 5. The row it writes

Into `keyword_candidates`, same table:

| Column                       | Value                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| `source`                     | `google.autocomplete`                                                      |
| `seed`                       | the seed that produced it (the base seed, not the letter-suffixed variant) |
| `metrics`                    | `null` — **not** `{search_volume: 0}`                                      |
| `snapshot_id`                | the raw-response snapshot row                                              |
| `location_code`/`language_code` | `KEYWORD_CONFIG` values, so dedupe keys match the metered path          |

The raw response is stored as a snapshot exactly as provider responses are, so
what Google actually said on that date survives independent of what was
filed from it.

`metricsWorthKeeping` already returns `false` for `null`, so a candidate from
this source that reaches approval records honestly that no metrics existed at
approval time. Nothing else changes in `approveKeywords`.

### 6. The operator click

Registry entry in `src/registry/modules/` — a new module, not inside
`dataforseo.ts`, since the provider is different:

```
key:         "autocomplete-keyword-discovery"
name:        "Google Autocomplete keyword discovery"
triggerKind: "manual"
cost:        $0.00
```

Button on `/keywords`, beside the existing discovery action. Rule 5 says the
cost goes on the button; here that means the button reads **$0.00 — free,
unofficial source** rather than omitting cost. Free is a cost statement, and
"unofficial" is the disclosure from §3 above.

The result toast says: seeds used, requests made, suggestions returned,
dropped as irrelevant, folded as duplicates, filed. Every one of those is a
different number and the operator is told which is which.

### 7. Enrichment is the metered half

`enrichPendingCandidates` already scores difficulty and intent for pending
candidates, metered, on an explicit click. That is where a candidate from this
source acquires numbers — after a human has looked at it. This is the cost
saving: DataForSEO gets asked about the phrases that survived a human, not
about everything Google's index associates with the domain.

Known blocker, already filed: `enrichPendingCandidates` filters
`review_state = 'pending'` and the button is `disabled` at `pending === 0`.
That disabled state is an AGENTS.md violation independent of this work and is
not fixed here.

### 8. Tests

Pure functions, no network in the test suite:

- Parsing: well-formed `[q, [...]]`; a wrapper Google sometimes changes;
  malformed JSON; HTML error page; empty suggestion array. Each returns the
  documented shape, and the failure cases are distinguishable from "no
  suggestions".
- Expansion: the alphabet/question-word set is generated correctly and is
  deduped before any request is made.
- Filtering: relevance, self-dedupe, `redundantAgainst`, in order, with a
  fixture where the same target arrives under six spellings.
- `metrics: null` reaches the row and is never coerced to `0`.

## What this does not do

- It does not measure anything. Anyone reading a demand number off this source
  is reading a number that does not exist.
- It does not solve page ownership (CODE-93/94) or the SERP-observation cost of
  keywords already approved. It adds candidates; those items decide what
  happens to them.
- It should not be built before CODE-98's dedupe is landed — it is, as of
  2026-09-04 — because without the fold at the door an expansion pass of this
  size floods the queue with spellings of the same fourteen targets.

## Open operator decision

Whether to use the undocumented Google endpoint (free, against Google's terms,
can be IP-blocked) or DataForSEO's documented Autocomplete endpoint (metered,
supported). §3 records the contradiction; the choice is the operator's and is
not made here.
