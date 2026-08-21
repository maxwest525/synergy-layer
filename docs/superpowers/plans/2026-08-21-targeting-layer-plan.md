# Targeting Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keyword, question and backlink data AOOS has already collected and paid for turns into page and keyword proposals in the existing suggestion queue, and three cheap new DataForSEO Labs reads extend that targeting picture behind an explicit operator click with the cost on the button.

**Architecture:** One new pure module (`src/lib/targeting-rules.ts`) decides what the stored rows say; one new server module (`src/lib/dataforseo/targeting-rules.server.ts`) reads the rows, writes `recommendations`, and is the fourth — and only new — module in the codebase that writes a recommendation, which is what moves DataForSEO from Connections stage 3 ("collecting, reaching nobody") to stage 4. Everything the queue, the router, the buckets and the copy layer already do is reused unchanged: a new rule id is registered in `finding-copy.ts` (which forces a plain-words writer and, through `rule-buckets.test.ts`, forces a bucket assignment with its `alsoNeeds`), routed in `finding-router.ts`, and the card, the ignore verb, the category badge and the weekly cap all follow with no new UI. The metered Labs reads (`domain_intersection`, `bulk_keyword_difficulty`, `search_intent`) file their results as `keyword_candidates` in `review_state: "pending"` and enter the approval flow `decideKeywordCandidates` already governs — nothing new is ever auto-tracked.

**Tech Stack:** TypeScript, React 19, TanStack Start/Router/Query, Supabase (Postgres + RLS), vitest (jsdom), Tailwind, DataForSEO Labs/SERP/Backlinks v3.

**Spec:** No separate spec document. The requirements are the Lane 2 brief, restated in full under **Goal** and **Global Constraints**, argued from three research documents that travel with this plan:

- `docs/superpowers/research/2026-08-21-dataforseo-recipe-catalog.md` — the ranked bridge list and the confirmed dead end (`finding-router.ts` has zero references to `keyword_candidates`, `tracked_keywords` or any backlinks table).
- `docs/superpowers/research/2026-08-21-connected-tool-playbooks.md` — the unused vendor recipes per connector.
- `docs/superpowers/research/2026-08-20-small-site-growth-research.md` — discovery order (internal links → sitemap → one recrawl → patience) and the not-noticed vs hurting-us taxonomy.

## Global Constraints

Copied verbatim from the Lane 2 brief. Every task's requirements implicitly include this section.

- **No demo data, ever.** Every number and every row on screen is a stored row. A read that fails renders a named absence, never a zero.
- **Metered calls are operator-click only, with the cost on the button.** No schedule, no page load, and no other action may fire a paid provider call. The button says what the click costs before it is clicked.
- **Every new rule gets a bucket + `alsoNeeds` + a citation or a stated assumption.** `rule-buckets.ts` is the registry; `RULE_ASSIGNMENTS.why` carries the reasoning, and it is developer-facing prose that must never reach the screen.
- **Plain words on screen. No rule ids.** No stored enum values, no fingerprints, no `snake_case` anywhere an operator can read it.
- **Proposals enter the EXISTING queue/approval/change-request governance, never bypass it.** A keyword becomes tracked only through `decideKeywordCandidates`. A page change is approved only through `/changes/$id`. No new code path writes an approved or applied state directly.
- **No threshold invented to force a finding.** Where counts exist, confidence is pooled/derived through `src/lib/confidence.ts`. Where a rule is a yes/no read of stored rows, it is bucketed `fact` and says so, rather than being dressed up with a number.
- **Surgical diffs.** Every changed line traces to this lane. Do not reformat, refactor, or improve adjacent code.
- **vitest TDD.** Failing test first, then the minimal implementation, then green, then commit.
- **Repo-wide lint is pre-broken.** Do not attempt a repo-wide lint fix. Files you touch must be clean: `bunx eslint <the files you changed>`.
- **Commit trailers**, on every commit in this plan:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
  ```
- **Branch:** `feat/targeting-layer` in worktree `C:\Users\maxwe\projects\aoos\.claude\worktrees\rule-thresholds`. Run every command from that directory.
- **Test command:** `bunx vitest run <path>` for one file, `bunx vitest run` for the suite. `bunx tsc --noEmit` for types.

## Two house rules this lane must not trip over

Both were found by reading the code, and both will fail the build if ignored:

1. **`src/lib/connections.registry.test.ts` reads the source tree.** It asserts that the set of `source_module:` literals written into `recommendations` across every `*.server.ts` file equals `FINDING_SOURCES` in `connections.ts`, *and* that the file writing a given `source_module` contains `from("<that connection's table>")`. Today the writers are exactly `search-console`, `seo-validation`, `ga4`. This lane adds a fourth, `dataforseo`, and therefore must (a) put `dataforseo` in the DataForSEO row's `findingSources`, and (b) keep **all** `source_module: "dataforseo"` inserts in **one** file that also contains `from("dataforseo_snapshots")`. Two files writing the same `source_module` would make the second assertion depend on directory-read order.

2. **Registering a rule id in `ALL_SEARCH_RULES` (`finding-copy.ts`) is what forces the rest.** `rule-buckets.test.ts` builds `EXPECTED_RULE_IDS` from `SEO_RULES` + `ALL_SEARCH_RULES` + the GA4 ids, and fails unless `RULE_ASSIGNMENTS` covers each exactly once. `finding-copy.ts`'s `WRITERS` is an exhaustive `Record<SearchRule, …>`, so the compiler forces a plain-words writer. Register the id there first and let the two failures tell you what is missing.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/targeting-rules.ts` (create) | Pure: stored keywords + stored SERPs + stored page text → targeting observations. No I/O. | 1, 3, 6 |
| `src/lib/targeting-rules.test.ts` (create) | The prose claims each detector makes. | 1, 3, 6 |
| `src/lib/finding-copy.ts` (modify) | New rule ids in `ALL_SEARCH_RULES` + one plain-words writer each. | 1, 3, 6 |
| `src/lib/rule-buckets.ts` (modify) | New `Prerequisite` members and one `RuleAssignment` per new rule. | 1, 3, 6 |
| `src/lib/finding-router.ts` (modify) | `CATEGORY_BY_RULE` entries so each new rule lands on the right category page. | 1, 3, 6 |
| `src/lib/getting-found.ts` (modify) | `GettingFoundFacts` carries the new prerequisite counts; `answerabilityFor` passes them. | 1, 3, 6 |
| `src/lib/getting-found.functions.ts` (modify) | The count reads behind those prerequisites. | 1, 3, 6 |
| `src/components/os/getting-found-facts.ts` (modify) | Passes the new extras into `buildGettingFound`. | 1, 3, 6 |
| `src/lib/dataforseo/targeting-rules.server.ts` (create) | The only writer of `source_module: "dataforseo"` recommendations. Reads `tracked_keywords`, `dataforseo_snapshots`, `page_metadata_observations`. | 2, 3, 6 |
| `src/lib/connections.ts` (modify) | DataForSEO's `findingSources` becomes `["dataforseo"]` — the stage 3 → stage 4 move. | 2 |
| `src/lib/recommendation-action.ts` (modify) | A named, honest reason for the new suggested-action kinds; link union widened. | 2 |
| `src/registry/modules/dataforseo.ts` (modify) | `serp.targeting` capability ($0) + `dfs-targeting-pass` manual workflow; later the two metered Labs capabilities. | 2, 4, 5 |
| `src/lib/workflow-runner.server.ts` (modify) | Node arm for `serp.targeting`. | 2 |
| `scripts/inspect-serp-item-types.ts` (create) | Read-only verification: what item types stored SERP payloads actually carry. | 3 |
| `src/lib/dataforseo/keyword-gap.server.ts` (create) | `domain_intersection` against tracked competitors → pending `keyword_candidates`. | 4 |
| `src/lib/dataforseo/keyword-enrichment.server.ts` (create) | `bulk_keyword_difficulty` + `search_intent` into `keyword_candidates.metrics`. | 5 |
| `src/lib/dataforseo.functions.ts` (modify) | Operator-click server fns for the gap run and the enrichment run. | 4, 5 |
| `src/routes/competitors.tsx` (modify) | The gap button, with its cost on it. | 4 |
| `src/routes/keywords.tsx` (modify) | The enrichment button with its cost, and difficulty/intent columns. | 5, 7 |
| `src/routes/search.tools.tsx` (modify) | `RULE_LABEL` entries so no new rule id can leak into the findings list. | 7 |

---

### Task 1: Approved keywords stop being a dead end

The gap the recipe catalog confirmed: an operator approves a keyword, `approveKeywords` writes `tracked_keywords`, and nothing downstream ever mentions it again. `finding-router.ts` has never heard of the table. This task adds the two honest yes/no readings of that data as pure functions, registers them everywhere a rule must be registered, and gives the empty state a true sentence about what they are waiting for.

Two rules, both `fact` — they are readings of what exists, not estimates from a count:

- `approved_keyword_unobserved` — a keyword the operator approved that no stored SERP has ever looked up.
- `approved_keyword_no_page` — a keyword the operator approved where no page the audit has read carries that phrase in its title or its H1.

`approved_keyword_no_page` is deliberately strict: coverage means the exact approved phrase appears, lowercased, in the stored title or H1. A looser token overlap would be a threshold invented to make findings appear, which this lane forbids.

**Files:**
- Create: `src/lib/targeting-rules.ts`
- Create: `src/lib/targeting-rules.test.ts`
- Modify: `src/lib/finding-copy.ts:20-31` (ids), `:262-273` (writers)
- Modify: `src/lib/rule-buckets.ts:23` (Prerequisite), `:26-35` (state), `:69-217` (assignments), `:219-232` (copy + key maps)
- Modify: `src/lib/finding-router.ts:27-53`
- Modify: `src/lib/getting-found.ts:99-117`, `:333-343`
- Modify: `src/lib/getting-found.functions.ts:24-32`, handler
- Modify: `src/components/os/getting-found-facts.ts:53-70`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type TargetingRule = "approved_keyword_unobserved" | "approved_keyword_no_page" | "question_asked_no_page" | "referring_domain_movement"`
  - `type TargetingObservation = { readonly rule: TargetingRule; readonly target: string; readonly title: string; readonly description: string; readonly evidence: Record<string, unknown>; readonly confidence: number }`
  - `type ApprovedKeyword = { readonly keyword: string }`
  - `type ObservedSerp = { readonly keyword: string; readonly reportingDate: string }`
  - `type PageText = { readonly url: string; readonly title: string | null; readonly h1: string | null }`
  - `detectUnobservedKeywords(approved: readonly ApprovedKeyword[], observed: readonly ObservedSerp[]): TargetingObservation[]`
  - `detectKeywordsWithoutPage(approved: readonly ApprovedKeyword[], pages: readonly PageText[]): TargetingObservation[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/targeting-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  detectKeywordsWithoutPage,
  detectUnobservedKeywords,
  type ApprovedKeyword,
  type ObservedSerp,
  type PageText,
} from "./targeting-rules";

const approved = (...keywords: string[]): ApprovedKeyword[] =>
  keywords.map((keyword) => ({ keyword }));

describe("an approved keyword nothing has looked up yet", () => {
  it("raises one finding per approved keyword with no stored SERP", () => {
    const observed: ObservedSerp[] = [{ keyword: "movers austin", reportingDate: "2026-08-14" }];
    const found = detectUnobservedKeywords(approved("movers austin", "piano movers austin"), observed);
    expect(found.map((observation) => observation.target)).toEqual(["piano movers austin"]);
    expect(found[0]?.rule).toBe("approved_keyword_unobserved");
  });

  it("matches the stored SERP target case-insensitively, so a casing difference is not a finding", () => {
    const observed: ObservedSerp[] = [{ keyword: "Movers Austin", reportingDate: "2026-08-14" }];
    expect(detectUnobservedKeywords(approved("movers austin"), observed)).toEqual([]);
  });

  it("carries the approved keyword verbatim in the evidence", () => {
    const found = detectUnobservedKeywords(approved("piano movers austin"), []);
    expect(found[0]?.evidence["keyword"]).toBe("piano movers austin");
  });

  it("says nothing when no keyword has been approved", () => {
    expect(detectUnobservedKeywords([], [])).toEqual([]);
  });
});

describe("an approved keyword no page is about", () => {
  const pages: PageText[] = [
    { url: "https://x.test/movers", title: "Movers in Austin, TX", h1: "Austin movers" },
    { url: "https://x.test/about", title: "About us", h1: "Who we are" },
  ];

  it("raises the keyword when no stored title or heading carries the phrase", () => {
    const found = detectKeywordsWithoutPage(approved("piano movers austin"), pages);
    expect(found).toHaveLength(1);
    expect(found[0]?.rule).toBe("approved_keyword_no_page");
    expect(found[0]?.target).toBe("piano movers austin");
  });

  it("stays silent when a title carries the phrase", () => {
    expect(detectKeywordsWithoutPage(approved("movers in austin"), pages)).toEqual([]);
  });

  it("stays silent when an H1 carries the phrase", () => {
    expect(detectKeywordsWithoutPage(approved("austin movers"), pages)).toEqual([]);
  });

  it("records how many pages were read, so the claim names its own denominator", () => {
    const found = detectKeywordsWithoutPage(approved("piano movers austin"), pages);
    expect(found[0]?.evidence["pagesRead"]).toBe(2);
  });

  it("says nothing at all when the audit has read no pages, rather than accusing every keyword", () => {
    expect(detectKeywordsWithoutPage(approved("piano movers austin"), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/targeting-rules.test.ts`
Expected: FAIL — `Failed to resolve import "./targeting-rules"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/targeting-rules.ts`:

```ts
/**
 * What the targeting evidence already in the database says, as pure functions.
 *
 * Keyword candidates are collected, approved and stored, and until this module
 * existed nothing read them again: `finding-router.ts` had no reference to
 * `keyword_candidates` or `tracked_keywords`, so an approval produced no
 * suggestion anywhere. These detectors are the reading half of that wire; the
 * writing half is `dataforseo/targeting-rules.server.ts`.
 *
 * Every rule here is a yes/no reading of stored rows — a keyword nobody looked
 * up, a phrase no page carries — so none of them invents a threshold to decide
 * whether it fires. Where a count exists to judge (referring-domain movement),
 * the confidence comes from `confidence.ts` rather than from a literal.
 */

export type TargetingRule =
  | "approved_keyword_unobserved"
  | "approved_keyword_no_page"
  | "question_asked_no_page"
  | "referring_domain_movement";

export type TargetingObservation = {
  readonly rule: TargetingRule;
  /** The thing the finding is about: a keyword, a question, or a domain. */
  readonly target: string;
  /** Operator-facing. Never contains a rule id. */
  readonly title: string;
  readonly description: string;
  readonly evidence: Record<string, unknown>;
  /**
   * 1 for a fact read straight off stored rows. Anything derived from counts
   * takes its number from `confidence.ts` instead.
   */
  readonly confidence: number;
};

export type ApprovedKeyword = { readonly keyword: string };
export type ObservedSerp = { readonly keyword: string; readonly reportingDate: string };
export type PageText = {
  readonly url: string;
  readonly title: string | null;
  readonly h1: string | null;
};

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** Approved keywords no stored SERP has ever looked up. */
export function detectUnobservedKeywords(
  approved: readonly ApprovedKeyword[],
  observed: readonly ObservedSerp[],
): TargetingObservation[] {
  const seen = new Set(observed.map((serp) => normalise(serp.keyword)));
  return approved
    .filter((entry) => !seen.has(normalise(entry.keyword)))
    .map((entry) => ({
      rule: "approved_keyword_unobserved" as const,
      target: entry.keyword,
      title: `Nothing has checked where you rank for "${entry.keyword}"`,
      description:
        `You approved "${entry.keyword}", and no stored search result exists for it yet, ` +
        "so there is nothing to say about where the site sits for it.",
      evidence: { keyword: entry.keyword, observedKeywords: seen.size },
      confidence: 1,
    }));
}

/**
 * Approved keywords no read page carries.
 *
 * Coverage means the approved phrase itself appears in a stored title or H1.
 * A looser token overlap would decide the question with a threshold nobody
 * chose, and this lane raises no finding that way.
 */
export function detectKeywordsWithoutPage(
  approved: readonly ApprovedKeyword[],
  pages: readonly PageText[],
): TargetingObservation[] {
  // With nothing read, every keyword would look uncovered. That is a statement
  // about the audit, not about the site.
  if (pages.length === 0) return [];

  const haystack = pages.map((page) => `${normalise(page.title ?? "")} ${normalise(page.h1 ?? "")}`);

  return approved
    .filter((entry) => !haystack.some((text) => text.includes(normalise(entry.keyword))))
    .map((entry) => ({
      rule: "approved_keyword_no_page" as const,
      target: entry.keyword,
      title: `No page here is about "${entry.keyword}"`,
      description:
        `You approved "${entry.keyword}", and none of the ${pages.length} pages read so far ` +
        "use that phrase in their title or main heading. A page that is about it is the thing " +
        "that could rank for it.",
      evidence: { keyword: entry.keyword, pagesRead: pages.length },
      confidence: 1,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/targeting-rules.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Register the two rule ids and watch the two registries fail**

In `src/lib/finding-copy.ts`, extend the id list (it is what forces both the copy writer and the bucket assignment):

```ts
export const ALL_SEARCH_RULES = [
  "striking_distance_query",
  "position_loss",
  "weak_ctr_page",
  "visibility_gain",
  "possible_query_overlap",
  "zero_impression_page",
  "query_coverage_gap",
  "index_coverage_drift",
  "site_visibility_shift",
  "site_clicks_shift",
  // Targeting family: read from approved keywords and stored SERP evidence
  // rather than from Search Console. They are listed here because this array
  // is the registry that forces a plain-words writer below and a bucket
  // assignment in rule-buckets.ts.
  "approved_keyword_unobserved",
  "approved_keyword_no_page",
] as const;
```

Run: `bunx vitest run src/lib/rule-buckets.test.ts`
Expected: FAIL — `expected exactly one assignment for "approved_keyword_unobserved"`.

Run: `bunx tsc --noEmit`
Expected: FAIL — `WRITERS` is missing the two new keys.

- [ ] **Step 6: Add the plain-words writers**

In `src/lib/finding-copy.ts`, above the `WRITERS` record:

```ts
function keywordUnobserved(evidence: Evidence, on: string): FindingCopy {
  const keyword = text(evidence["keyword"]);
  return {
    claim:
      keyword === null
        ? "One of your approved searches has never been checked"
        : `Nothing has checked where you rank for "${keyword}"`,
    evidence: keyword === null ? null : `Approved, and no stored result for it as of ${on}`,
    currentWording: null,
  };
}

function keywordWithoutPage(evidence: Evidence, on: string): FindingCopy {
  const keyword = text(evidence["keyword"]);
  const pagesRead = num(evidence["pagesRead"]);
  return {
    claim:
      keyword === null
        ? "One of your approved searches has no page about it"
        : `No page here is about "${keyword}"`,
    evidence:
      pagesRead === null
        ? null
        : `Not in the title or heading of any of the ${pagesRead} pages read by ${on}`,
    currentWording: null,
  };
}
```

and register them:

```ts
  site_clicks_shift: siteClicksShift,
  approved_keyword_unobserved: keywordUnobserved,
  approved_keyword_no_page: keywordWithoutPage,
};
```

Run: `bunx vitest run src/lib/finding-copy.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the prerequisite and the two bucket assignments**

In `src/lib/rule-buckets.ts`, extend the prerequisite union, its state, its copy and its key map:

```ts
export type Prerequisite =
  | "second_collection"
  | "page_audit"
  | "analytics"
  | "url_inspection"
  | "approved_keywords";
```

```ts
  /** At least one stored URL inspection exists to compare against. */
  readonly urlInspection: boolean;
  /** The operator has approved at least one keyword to target. */
  readonly approvedKeywords: boolean;
};
```

```ts
  url_inspection: "a stored index check to compare against",
  approved_keywords: "at least one approved keyword, so there is something to target",
};
```

```ts
  url_inspection: "urlInspection",
  approved_keywords: "approvedKeywords",
};
```

and append two assignments to `RULE_ASSIGNMENTS`:

```ts
  {
    rule: "approved_keyword_unobserved",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["approved_keywords"],
    why: "Whether a stored SERP exists for an approved keyword is a row lookup, not an estimate: detectUnobservedKeywords (targeting-rules.ts) sets a keyword against the targets of stored serp_organic snapshots. No traffic volume makes that yes/no more or less answerable. It cannot fire before an operator approves a keyword, because tracked_keywords is its entire target set.",
  },
  {
    rule: "approved_keyword_no_page",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["approved_keywords", "page_audit"],
    why: 'Whether any read page carries the approved phrase in its title or H1 is read from page_metadata_observations, not inferred from counts. Google: "Google primarily finds pages through links from other pages it already crawled" and ranks the page that is about the query, so a phrase with no page is a discovery gap, not a measurement question (docs/superpowers/research/2026-08-20-small-site-growth-research.md, taxonomy table, not-noticed column). detectKeywordsWithoutPage returns nothing when the audit has read no pages, so the page-audit prerequisite is real rather than decorative.',
  },
```

Run: `bunx vitest run src/lib/rule-buckets.test.ts`
Expected: FAIL — the `unmetPrerequisites` call sites do not yet supply `approvedKeywords`; `bunx tsc --noEmit` names `src/lib/getting-found.ts:336` and `src/lib/rule-buckets.test.ts`.

- [ ] **Step 8: Supply the prerequisite state from stored rows**

In `src/lib/rule-buckets.test.ts`, add `approvedKeywords: true` to each of the three `unmetPrerequisites({...})` literals (lines ~103, ~113, ~128) so the existing assertions keep testing what they tested.

In `src/lib/getting-found.ts`, extend the facts type:

```ts
  /** Null when analytics is not connected, which is not the same as no visits. */
  readonly sessions: number | null;
  /** Approved keywords on the tenant. Zero means nothing has been chosen to target. */
  readonly approvedKeywords: number;
};
```

and the prerequisite state in `answerabilityFor`:

```ts
    // Nothing on this page reads a stored URL inspection yet.
    urlInspection: true,
    approvedKeywords: facts.approvedKeywords > 0,
  });
```

In `src/lib/getting-found.functions.ts`, extend the returned type with `readonly approvedKeywords: number;`, return `approvedKeywords: 0` in the no-property early return, and add the count read alongside the existing parallel reads:

```ts
      db
        .from("tracked_keywords")
        .select("keyword", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("active", true),
```

destructure it as `keywordResult` and return `approvedKeywords: keywordResult.count ?? 0`.

In `src/components/os/getting-found-facts.ts`, pass it through:

```ts
      sessions: extras.data.sessions,
      approvedKeywords: extras.data.approvedKeywords,
    }),
```

Fix the `withFacts` helper in `src/lib/getting-found.test.ts` to default `approvedKeywords: 0` if the compiler asks for it.

Run: `bunx vitest run src/lib/rule-buckets.test.ts src/lib/getting-found.test.ts`
Expected: PASS.

- [ ] **Step 9: Route both rules to the Getting-found category**

In `src/lib/finding-router.ts`, append to `CATEGORY_BY_RULE`:

```ts
  // Targeting rules: what to be found for, so they belong with the rest of
  // Getting found on Google rather than with the competitor questions their
  // module (dataforseo) otherwise implies.
  approved_keyword_unobserved: "search",
  approved_keyword_no_page: "search",
```

Run: `bunx vitest run src/lib/finding-router.test.ts`
Expected: PASS.

- [ ] **Step 10: Full check and commit**

Run: `bunx vitest run` — expected PASS.
Run: `bunx tsc --noEmit` — expected clean.
Run: `bunx eslint src/lib/targeting-rules.ts src/lib/targeting-rules.test.ts src/lib/finding-copy.ts src/lib/rule-buckets.ts src/lib/finding-router.ts src/lib/getting-found.ts src/lib/getting-found.functions.ts src/components/os/getting-found-facts.ts` — expected clean.

```bash
git add src/lib/targeting-rules.ts src/lib/targeting-rules.test.ts src/lib/finding-copy.ts src/lib/rule-buckets.ts src/lib/rule-buckets.test.ts src/lib/finding-router.ts src/lib/getting-found.ts src/lib/getting-found.functions.ts src/lib/getting-found.test.ts src/components/os/getting-found-facts.ts
git commit -m "$(cat <<'EOF'
feat: read approved keywords as findings instead of storing them and stopping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 2: The wire lands rows in the queue, and DataForSEO reaches stage 4

Task 1's detectors have no caller. This task adds the server module that reads the rows, writes `recommendations`, and — because it is the fourth recommendation writer in the codebase — moves DataForSEO from Connections stage 3 to stage 4. The pass costs nothing: it re-reads stored evidence, exactly like `serp.competitors` does, so it gets the same $0 capability and manual workflow treatment.

Note the registry rule at the top of this plan: this file is the *only* place `source_module: "dataforseo"` may be written, and it must contain `from("dataforseo_snapshots")` (it does — that is where stored SERPs live).

**Files:**
- Create: `src/lib/dataforseo/targeting-rules.server.ts`
- Modify: `src/lib/connections.ts:126-133` (the DataForSEO row)
- Modify: `src/lib/recommendation-action.ts:22` (link union), `:43-107` (new kinds)
- Modify: `src/registry/modules/dataforseo.ts:48-69` (new capability), `:232-241` (new workflow)
- Modify: `src/lib/workflow-runner.server.ts:766-772` (node arm)
- Test: `src/lib/connections.registry.test.ts` (existing — must stay green), `src/lib/recommendation-action.test.ts`

**Interfaces:**
- Consumes: `detectUnobservedKeywords`, `detectKeywordsWithoutPage`, `TargetingObservation` from Task 1.
- Produces: `runTargetingPass(client: Client, tenantId: string): Promise<{ observations: number; recommendations: number }>` — called by the workflow node in this task and reused by Tasks 3 and 6, which add detectors to the same pass.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/recommendation-action.test.ts`:

```ts
describe("a proposal to write a page AOOS cannot write", () => {
  it("says why there is nothing to approve rather than leaving a blank space", () => {
    const view = describeSuggestedAction({ kind: "write_new_page", target: "piano movers austin" });
    expect(view.executable).toBe(false);
    expect(view.unavailableReason).toMatch(/writing the page is yours/i);
  });

  it("points a keyword nobody has looked up at the keyword workspace", () => {
    const view = describeSuggestedAction({ kind: "observe_keyword", target: "piano movers austin" });
    expect(view.link?.to).toBe("/keywords");
    expect(view.executable).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/recommendation-action.test.ts`
Expected: FAIL — both fall through to the default arm, so `unavailableReason` reads "Nothing is connected that could carry this out" and `link` is `null`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/recommendation-action.ts`, widen the link union:

```ts
  link: { to: "/competitors" | "/keywords"; label: string; effect: string } | null;
```

and add two arms above the default:

```ts
  if (kind === "write_new_page") {
    return {
      kind,
      executable: false,
      summary:
        "This names a search nothing on the site is about. AOOS can draft wording for a page that exists; it cannot create the page itself.",
      unavailableReason:
        "There is nothing to approve here: writing the page is yours to do. Once it exists and has been read, the wording lane can draft its title and description.",
      link: null,
    };
  }

  if (kind === "observe_keyword") {
    return {
      kind,
      executable: false,
      summary:
        "This keyword is approved but no search result has been stored for it. Looking it up is a paid provider call, so it happens on an explicit click in the keyword workspace, never from here.",
      unavailableReason:
        "There is nothing to approve here. Looking up a search costs money, so it is started deliberately in the keyword workspace.",
      link: {
        to: "/keywords",
        label: "Open the keyword workspace",
        effect:
          "Nothing is spent by opening it. The paid look-up runs only when you click it there, with its cost on the button.",
      },
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/recommendation-action.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the server pass**

Create `src/lib/dataforseo/targeting-rules.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  detectKeywordsWithoutPage,
  detectUnobservedKeywords,
  type ObservedSerp,
  type PageText,
  type TargetingObservation,
} from "../targeting-rules";
import { checksum } from "./transport.server";

type Client = SupabaseClient<Database>;

/**
 * The targeting pass: the only module that writes `source_module: "dataforseo"`
 * recommendations.
 *
 * It must stay the only one. `connections.registry.test.ts` reads the source
 * tree and asserts that the file writing a given source_module also reads that
 * connection's table, so a second file writing "dataforseo" would make that
 * assertion depend on directory-read order.
 *
 * Nothing here calls a provider. Every row it reads was already collected and,
 * in the case of the SERP snapshots, already paid for.
 */

const SUGGESTED_ACTION_BY_RULE: Record<string, string> = {
  approved_keyword_unobserved: "observe_keyword",
  approved_keyword_no_page: "write_new_page",
};

/** How far back stored SERP evidence counts as an observation of a keyword. */
export const TARGETING_CONFIG = { serpLookbackDays: 90, pageLimit: 500 };

async function readApprovedKeywords(client: Client, tenantId: string) {
  const { data, error } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ keyword: row.keyword }));
}

async function readObservedSerps(client: Client, tenantId: string): Promise<ObservedSerp[]> {
  const cutoff = new Date(Date.now() - TARGETING_CONFIG.serpLookbackDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("target, reporting_date")
    .eq("tenant_id", tenantId)
    .in("kind", ["serp_organic", "serp_organic_live"])
    .gte("reporting_date", cutoff);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ keyword: row.target, reportingDate: row.reporting_date }));
}

async function readPageText(client: Client, tenantId: string): Promise<PageText[]> {
  const { data, error } = await client
    .from("page_metadata_observations")
    .select("url, title, h1")
    .eq("tenant_id", tenantId)
    .is("error", null)
    .limit(TARGETING_CONFIG.pageLimit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ url: row.url, title: row.title, h1: row.h1 }));
}

/** One recommendation per observation, deduped on the same fingerprint scheme the other rule families use. */
async function persist(
  client: Client,
  tenantId: string,
  observations: readonly TargetingObservation[],
): Promise<number> {
  let created = 0;

  for (const observation of observations) {
    const issueFingerprint = checksum([tenantId, observation.rule, observation.target]);

    const { data: open, error: openError } = await client
      .from("recommendations")
      .select("id")
      .eq("issue_fingerprint", issueFingerprint)
      .not("state", "in", "(applied,verified,rejected,rolled_back)")
      .maybeSingle();
    if (openError) throw new Error(openError.message);
    if (open) continue;

    const { error } = await client.from("recommendations").insert({
      tenant_id: tenantId,
      title: observation.title,
      description: observation.description,
      source_module: "dataforseo",
      state: "proposed",
      requires_approval: false,
      business_impact: "medium",
      revenue_impact: "medium",
      traffic_impact: "medium",
      time_saved_minutes: 0,
      risk: "none",
      confidence: observation.confidence,
      reasoning: `Read from stored rows on ${new Date().toISOString().slice(0, 10)}: no provider was called.`,
      suggested_action: {
        kind: SUGGESTED_ACTION_BY_RULE[observation.rule] ?? "review",
        rule: observation.rule,
        target: observation.target,
      } as never,
      issue_fingerprint: issueFingerprint,
      metadata: { rule: observation.rule, evidence: observation.evidence } as never,
    });
    if (error) throw new Error(error.message);
    created += 1;
  }

  return created;
}

/**
 * Re-reads the targeting evidence and files what it finds. Costs nothing, so it
 * is safe to run as often as an operator likes.
 */
export async function runTargetingPass(
  client: Client,
  tenantId: string,
): Promise<{ observations: number; recommendations: number }> {
  const [approved, observed, pages] = await Promise.all([
    readApprovedKeywords(client, tenantId),
    readObservedSerps(client, tenantId),
    readPageText(client, tenantId),
  ]);

  const observations = [
    ...detectUnobservedKeywords(approved, observed),
    ...detectKeywordsWithoutPage(approved, pages),
  ];

  return { observations: observations.length, recommendations: await persist(client, tenantId, observations) };
}
```

- [ ] **Step 6: Move DataForSEO to stage 4 in the registry**

In `src/lib/connections.ts`, the DataForSEO row:

```ts
  {
    key: "dataforseo",
    label: "DataForSEO",
    table: "dataforseo_snapshots",
    succeeded: null,
    // The targeting pass (dataforseo/targeting-rules.server.ts) reads the
    // stored SERP snapshots and the approved keyword set and files findings
    // from them. Until it existed this row was the clearest case of stage
    // three: paid rows stored, nothing turning them into anything.
    findingSources: ["dataforseo"],
    promise: "Backlinks, referring domains and anchor text, from a paid provider.",
  },
```

Run: `bunx vitest run src/lib/connections.registry.test.ts src/lib/connections.test.ts`
Expected: PASS. If the first assertion fails naming `dataforseo`, a second file is writing that `source_module` — fix by merging it into `targeting-rules.server.ts`, not by editing the test.

- [ ] **Step 7: Give the pass a capability, a workflow and a runner arm**

In `src/registry/modules/dataforseo.ts`, after the `serp.competitor_intelligence` capability:

```ts
    {
      key: "serp.targeting",
      name: "Targeting pass",
      kind: "internal_module",
      category: "Organic",
      description:
        "Re-reads the approved keyword set against stored SERP snapshots and the pages the audit has read, and files what it finds as suggestions: an approved search nothing has looked up, and an approved search no page is about. Costs nothing and calls no provider.",
      integrationState: "real",
      operations: [
        {
          name: "targeting.derive",
          description: "Re-read approved keywords, stored SERPs and read pages, and file findings.",
          mutates: false,
        },
      ],
      config: {
        mutating: false,
        costUsd: 0,
        evidenceLabel: "observed",
        source: "stored_keyword_and_serp_rows",
      },
    },
```

and after the `dfs-competitor-derive` workflow:

```ts
    {
      key: "dfs-targeting-pass",
      name: "Targeting pass",
      description:
        "Turns the approved keyword set and the stored SERP snapshots into suggestions. Costs nothing, calls no provider, and never approves or tracks anything on its own.",
      triggerKind: "manual",
      graph: {
        nodes: [{ key: "target", kind: "capability", ref: "serp.targeting" }],
        edges: [],
      },
    },
```

In `src/lib/workflow-runner.server.ts`, extend `runSerpCompetitorNode`'s guard and add the arm:

```ts
  if (
    ref !== "serp.competitors" &&
    ref !== "serp.competitor_intelligence" &&
    ref !== "competitor.page_observation" &&
    ref !== "serp.targeting"
  ) {
    return null;
  }
```

```ts
    if (ref === "serp.targeting") {
      const { runTargetingPass } = await import("./dataforseo/targeting-rules.server");
      const result = await runTargetingPass(client, tenantId);
      return { ok: true, output: { ...result, costUsd: 0 } };
    }
```

placed immediately after the `own` guard, alongside the other refs.

- [ ] **Step 8: Full check and commit**

Run: `bunx vitest run` — expected PASS.
Run: `bunx tsc --noEmit` — expected clean.
Run: `bunx eslint src/lib/dataforseo/targeting-rules.server.ts src/lib/connections.ts src/lib/recommendation-action.ts src/lib/recommendation-action.test.ts src/registry/modules/dataforseo.ts src/lib/workflow-runner.server.ts` — expected clean.

```bash
git add src/lib/dataforseo/targeting-rules.server.ts src/lib/connections.ts src/lib/recommendation-action.ts src/lib/recommendation-action.test.ts src/registry/modules/dataforseo.ts src/lib/workflow-runner.server.ts
git commit -m "$(cat <<'EOF'
feat: file targeting findings from stored rows, moving DataForSEO to stage four

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 3: Questions people already asked, from payloads already paid for — verification first

**This task begins with a verification step, and its scope depends on the answer.** The recipe catalog says PAA questions "already sit inside stored SERP payloads ($0)". Reading the code does not confirm that: `ingestSerpPostback` (`serp.server.ts:154-158`) stores `result[0].items` from `/serp/google/organic/task_get/regular`, and nothing in `src/` has ever referenced `people_also_ask`. `readSerpEvidence` in `competitor-intelligence.server.ts:118-121` does collect every non-organic item `type` into a `features` set, so if PAA items are present they are already being counted there — but no test or stored row proves it.

So: verify against real stored rows before writing a parser.

- **Outcome A — `people_also_ask` items are present.** Implement the detector below as written.
- **Outcome B — they are absent.** Stop. Do **not** ship a parser for a field that is not there, and do **not** substitute the SerpAPI `google_related_questions` endpoint (a metered call, out of this lane's scope). Commit the verification script with a findings comment, record in this plan file that question mining is blocked on the retrieval mode, and move to Task 4. The follow-up worth costing separately is switching future collections from `task_get/regular` to `task_get/advanced`, whose element set is broader — that is a change to `serp.server.ts:158` and `:170`, it affects only collections made after it lands, and nobody in this repo has measured whether it is billed differently, so it must not be promised as free.

**Files:**
- Create: `scripts/inspect-serp-item-types.ts`
- Modify (Outcome A only): `src/lib/targeting-rules.ts`, `src/lib/targeting-rules.test.ts`, `src/lib/finding-copy.ts`, `src/lib/rule-buckets.ts`, `src/lib/rule-buckets.test.ts`, `src/lib/finding-router.ts`, `src/lib/getting-found.ts`, `src/lib/getting-found.functions.ts`, `src/components/os/getting-found-facts.ts`, `src/lib/dataforseo/targeting-rules.server.ts`

**Interfaces:**
- Consumes: `TargetingObservation`, `PageText` from Task 1; `runTargetingPass` from Task 2.
- Produces (Outcome A): `type SerpQuestion = { readonly question: string; readonly keyword: string; readonly reportingDate: string }`, `readQuestionsFromRows(rows: readonly Record<string, unknown>[], keyword: string, reportingDate: string): SerpQuestion[]`, `detectQuestionsWithoutPage(questions: readonly SerpQuestion[], pages: readonly PageText[]): TargetingObservation[]`.

- [ ] **Step 1: Write the verification script**

Create `scripts/inspect-serp-item-types.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/integrations/supabase/types";

/**
 * Read-only. Answers one question before any parser is written: what item
 * types do the SERP payloads AOOS has already stored actually contain, and
 * does a people_also_ask block appear among them?
 *
 * Calls no provider and writes nothing.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const client = createClient<Database>(
    required("SUPABASE_URL"),
    process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || required("SUPABASE_SECRET_KEY"),
  );

  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("id, target, reporting_date, endpoint, payload")
    .in("kind", ["serp_organic", "serp_organic_live"])
    .order("reporting_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const typeCounts = new Map<string, number>();
  let paaSample: unknown = null;

  for (const snapshot of data ?? []) {
    const rows = (snapshot.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [];
    for (const row of rows) {
      const type = String(row["type"] ?? "unknown");
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      if (type === "people_also_ask" && paaSample === null) paaSample = row;
    }
  }

  console.log(JSON.stringify({
    snapshotsRead: (data ?? []).length,
    endpoints: [...new Set((data ?? []).map((row) => row.endpoint))],
    itemTypes: Object.fromEntries([...typeCounts.entries()].sort((a, b) => b[1] - a[1])),
    peopleAlsoAskPresent: typeCounts.has("people_also_ask"),
    peopleAlsoAskSample: paaSample,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run it and record the answer**

Run: `bunx tsx scripts/inspect-serp-item-types.ts`
Expected: a JSON object naming every stored item type. Read `peopleAlsoAskPresent`.

- If `false` (or `snapshotsRead` is 0, which is a different answer — no evidence either way): take **Outcome B**. Commit the script, append the observed `itemTypes` map as a comment at the top of it, and skip to Task 4.
- If `true`: read `peopleAlsoAskSample` and confirm the shape the parser below assumes — an item with `type: "people_also_ask"` and an `items` array whose entries carry a `title` (the question). If the real shape differs, adjust `readQuestionsFromRows` to the shape that is actually stored, and adjust the test fixture with it.

- [ ] **Step 3 (Outcome A): Write the failing test**

Append to `src/lib/targeting-rules.test.ts`:

```ts
describe("questions the results page already showed", () => {
  const rows = [
    { type: "organic", domain: "x.test", rank_group: 1 },
    {
      type: "people_also_ask",
      items: [
        { title: "How much do piano movers cost?" },
        { title: "Do movers disassemble a piano?" },
      ],
    },
  ];

  it("reads each question verbatim, with the search and date it appeared under", () => {
    const questions = readQuestionsFromRows(rows, "piano movers austin", "2026-08-14");
    expect(questions).toEqual([
      { question: "How much do piano movers cost?", keyword: "piano movers austin", reportingDate: "2026-08-14" },
      { question: "Do movers disassemble a piano?", keyword: "piano movers austin", reportingDate: "2026-08-14" },
    ]);
  });

  it("reads nothing from a results page with no question block", () => {
    expect(readQuestionsFromRows([{ type: "organic" }], "movers austin", "2026-08-14")).toEqual([]);
  });

  it("proposes a page for a question no page answers, quoting the question", () => {
    const questions = readQuestionsFromRows(rows, "piano movers austin", "2026-08-14");
    const pages: PageText[] = [{ url: "https://x.test/movers", title: "Austin movers", h1: "Movers" }];
    const found = detectQuestionsWithoutPage(questions, pages);
    expect(found).toHaveLength(2);
    expect(found[0]?.rule).toBe("question_asked_no_page");
    expect(found[0]?.title).toContain("How much do piano movers cost?");
    expect(found[0]?.evidence["keyword"]).toBe("piano movers austin");
    expect(found[0]?.evidence["seenOn"]).toBe("2026-08-14");
  });

  it("stays silent about a question a page already answers in its title", () => {
    const questions = readQuestionsFromRows(rows, "piano movers austin", "2026-08-14");
    const pages: PageText[] = [
      { url: "https://x.test/cost", title: "How much do piano movers cost?", h1: "Cost" },
      { url: "https://x.test/a", title: "Do movers disassemble a piano?", h1: "Disassembly" },
    ];
    expect(detectQuestionsWithoutPage(questions, pages)).toEqual([]);
  });

  it("raises one finding per question even when several searches showed it", () => {
    const questions = [
      ...readQuestionsFromRows(rows, "piano movers austin", "2026-08-14"),
      ...readQuestionsFromRows(rows, "piano moving cost", "2026-08-15"),
    ];
    const found = detectQuestionsWithoutPage(questions, [
      { url: "https://x.test/movers", title: "Austin movers", h1: "Movers" },
    ]);
    expect(found).toHaveLength(2);
    expect(found[0]?.evidence["alsoSeenUnder"]).toEqual(["piano moving cost"]);
  });
});
```

Add `readQuestionsFromRows`, `detectQuestionsWithoutPage` and `type PageText` to the file's existing import block.

- [ ] **Step 4: Run test to verify it fails**

Run: `bunx vitest run src/lib/targeting-rules.test.ts`
Expected: FAIL — `readQuestionsFromRows is not a function`.

- [ ] **Step 5: Implement**

Append to `src/lib/targeting-rules.ts`:

```ts
export type SerpQuestion = {
  readonly question: string;
  readonly keyword: string;
  readonly reportingDate: string;
};

/**
 * The questions inside one stored SERP payload.
 *
 * Verified against real stored rows before this was written
 * (scripts/inspect-serp-item-types.ts): these items are already inside
 * payloads AOOS paid for, so reading them costs nothing.
 */
export function readQuestionsFromRows(
  rows: readonly Record<string, unknown>[],
  keyword: string,
  reportingDate: string,
): SerpQuestion[] {
  const questions: SerpQuestion[] = [];
  for (const row of rows) {
    if (String(row["type"] ?? "") !== "people_also_ask") continue;
    const items = Array.isArray(row["items"]) ? (row["items"] as Record<string, unknown>[]) : [];
    for (const item of items) {
      const question = typeof item["title"] === "string" ? item["title"].trim() : "";
      if (question) questions.push({ question, keyword, reportingDate });
    }
  }
  return questions;
}

/**
 * Questions Google showed under an approved search that no read page answers.
 *
 * Coverage is the same strict test the keyword rule uses: the question itself
 * appears in a stored title or H1. Each question is raised once, carrying the
 * search it first appeared under and any others that also showed it.
 */
export function detectQuestionsWithoutPage(
  questions: readonly SerpQuestion[],
  pages: readonly PageText[],
): TargetingObservation[] {
  if (pages.length === 0) return [];

  const haystack = pages.map((page) => `${normalise(page.title ?? "")} ${normalise(page.h1 ?? "")}`);
  const byQuestion = new Map<string, { first: SerpQuestion; also: string[] }>();

  for (const entry of questions) {
    const key = normalise(entry.question);
    const held = byQuestion.get(key);
    if (held === undefined) {
      byQuestion.set(key, { first: entry, also: [] });
      continue;
    }
    if (held.first.keyword !== entry.keyword && !held.also.includes(entry.keyword)) {
      held.also.push(entry.keyword);
    }
  }

  return [...byQuestion.entries()]
    .filter(([key]) => !haystack.some((text) => text.includes(key)))
    .map(([, { first, also }]) => ({
      rule: "question_asked_no_page" as const,
      target: first.question,
      title: `Nothing here answers "${first.question}"`,
      description:
        `Google showed this question on the results page for "${first.keyword}" on ` +
        `${first.reportingDate}, and none of the ${pages.length} pages read so far answer it ` +
        "in a title or main heading.",
      evidence: {
        question: first.question,
        keyword: first.keyword,
        seenOn: first.reportingDate,
        alsoSeenUnder: also,
        pagesRead: pages.length,
      },
      confidence: 1,
    }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bunx vitest run src/lib/targeting-rules.test.ts`
Expected: PASS.

- [ ] **Step 7: Register the rule end to end**

`src/lib/finding-copy.ts` — add `"question_asked_no_page",` to `ALL_SEARCH_RULES`, then the writer and its registration:

```ts
function questionWithoutPage(evidence: Evidence, on: string): FindingCopy {
  const question = text(evidence["question"]);
  const keyword = text(evidence["keyword"]);
  const seenOn = text(evidence["seenOn"]) ?? on;
  return {
    claim:
      question === null
        ? "Google is showing a question nothing here answers"
        : `Nothing here answers "${question}"`,
    evidence:
      keyword === null ? null : `Google showed it under "${keyword}" on ${seenOn}`,
    currentWording: null,
  };
}
```

```ts
  question_asked_no_page: questionWithoutPage,
};
```

`src/lib/rule-buckets.ts` — add `"serp_observation"` to `Prerequisite`, `readonly serpObservation: boolean;` to `PrerequisiteState`, `serp_observation: "at least one stored search result, so there is something to read questions out of",` to `PREREQUISITE_COPY`, `serp_observation: "serpObservation",` to `PREREQUISITE_STATE_KEY`, and the assignment:

```ts
  {
    rule: "question_asked_no_page",
    bucket: "fact",
    needsPerTarget: null,
    alsoNeeds: ["serp_observation", "page_audit"],
    why: "The question is quoted from a stored SERP payload and the coverage test is a substring check against stored titles and H1s: both sides are reads, so no volume threshold applies. Stated assumption, not a citation: a question Google chose to show is worth answering because Google showed it — this lane makes no claim that answering it will rank. detectQuestionsWithoutPage returns nothing with no read pages, and readQuestionsFromRows returns nothing with no stored SERPs, so both prerequisites are real.",
  },
```

`src/lib/rule-buckets.test.ts` — add `serpObservation: true` to the three state literals.

`src/lib/finding-router.ts` — `question_asked_no_page: "search",`.

`src/lib/getting-found.ts` — `readonly observedSerps: number;` on the facts type and `serpObservation: facts.observedSerps > 0,` in `answerabilityFor`.

`src/lib/getting-found.functions.ts` — `readonly observedSerps: number;`, `observedSerps: 0` in the early return, and the read:

```ts
      db
        .from("dataforseo_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("kind", ["serp_organic", "serp_organic_live"]),
```

`src/components/os/getting-found-facts.ts` — `observedSerps: extras.data.observedSerps,`.

- [ ] **Step 8: Add the detector to the pass**

In `src/lib/dataforseo/targeting-rules.server.ts`, add the payload read and the third detector:

```ts
async function readStoredQuestions(client: Client, tenantId: string): Promise<SerpQuestion[]> {
  const cutoff = new Date(Date.now() - TARGETING_CONFIG.serpLookbackDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("target, reporting_date, payload")
    .eq("tenant_id", tenantId)
    .in("kind", ["serp_organic", "serp_organic_live"])
    .gte("reporting_date", cutoff);
  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((snapshot) =>
    readQuestionsFromRows(
      (snapshot.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [],
      snapshot.target,
      snapshot.reporting_date,
    ),
  );
}
```

```ts
  const observations = [
    ...detectUnobservedKeywords(approved, observed),
    ...detectKeywordsWithoutPage(approved, pages),
    ...detectQuestionsWithoutPage(await readStoredQuestions(client, tenantId), pages),
  ];
```

and add `question_asked_no_page: "write_new_page"` to `SUGGESTED_ACTION_BY_RULE`.

- [ ] **Step 9: Full check and commit**

Run: `bunx vitest run`, `bunx tsc --noEmit`, `bunx eslint <every file touched above>` — all expected clean.

```bash
git add scripts/inspect-serp-item-types.ts src/lib/targeting-rules.ts src/lib/targeting-rules.test.ts src/lib/finding-copy.ts src/lib/rule-buckets.ts src/lib/rule-buckets.test.ts src/lib/finding-router.ts src/lib/getting-found.ts src/lib/getting-found.functions.ts src/components/os/getting-found-facts.ts src/lib/dataforseo/targeting-rules.server.ts
git commit -m "$(cat <<'EOF'
feat: propose a page for each question the stored results already asked

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 4: The competitor keyword gap, on a click, with the price on the button

`domain_intersection` is the one Labs endpoint the catalog ranks as worth wiring and the registry has not retired (`competitors_domain` is deliberately retired — see the note at `src/registry/modules/dataforseo.ts:45`; do not revive it). Its input is the tenant's own approved competitor list (`tracked_competitors`, written by `competitors.functions.ts` on operator approval) and the owned property. Its output is `keyword_candidates` rows in `review_state: "pending"` — the same rows the keyword workspace already reviews, decided by the same `decideKeywordCandidates`. Nothing is ever auto-tracked.

Cost: this repo budgets a Labs task at `LABS_CONFIG.estimatedUsdPerTask` (`labs.server.ts:18`), currently $0.05, and the run makes one task per tracked competitor. The button says exactly that, computed from the constant rather than typed as a literal.

**Files:**
- Create: `src/lib/dataforseo/keyword-gap.server.ts`
- Create: `src/lib/dataforseo/keyword-gap.test.ts`
- Modify: `src/lib/dataforseo.functions.ts` (add the server fn)
- Modify: `src/routes/competitors.tsx` (the button)
- Modify: `src/registry/modules/dataforseo.ts` (capability entry)

**Interfaces:**
- Consumes: `labsCall` (`labs.server.ts:27`), `LABS_CONFIG`, `KEYWORD_CONFIG` (`keywords.server.ts:14`).
- Produces:
  - `selectGapKeywords(items: readonly Record<string, unknown>[], competitor: string, ownDomain: string): GapCandidate[]` (pure, exported for the test)
  - `type GapCandidate = { readonly keyword: string; readonly competitor: string; readonly searchVolume: number | null; readonly cpc: number | null; readonly competition: number | null; readonly competitorPosition: number | null }`
  - `runKeywordGap(client, tenantId, ownDomain): Promise<{ competitors: number; filed: number; costUsd: number }>`
  - server fn `runCompetitorKeywordGap` returning the same shape.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dataforseo/keyword-gap.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { selectGapKeywords } from "./keyword-gap.server";

const item = (keyword: string, volume: number | null, ownRank: number | null, theirRank: number) => ({
  keyword_data: { keyword, keyword_info: { search_volume: volume, cpc: 1.2, competition: 0.4 } },
  first_domain_serp_element: ownRank === null ? null : { rank_group: ownRank },
  second_domain_serp_element: { rank_group: theirRank },
});

describe("what counts as a gap the operator should see", () => {
  it("keeps a keyword the competitor ranks for and the owned domain does not", () => {
    const found = selectGapKeywords([item("piano movers austin", 90, null, 3)], "rival.test", "x.test");
    expect(found).toEqual([
      {
        keyword: "piano movers austin",
        competitor: "rival.test",
        searchVolume: 90,
        cpc: 1.2,
        competition: 0.4,
        competitorPosition: 3,
      },
    ]);
  });

  it("drops a keyword the owned domain already ranks for, because that is not a gap", () => {
    expect(selectGapKeywords([item("movers austin", 400, 6, 2)], "rival.test", "x.test")).toEqual([]);
  });

  it("drops a keyword with no stored volume rather than filing an unjudgeable candidate", () => {
    expect(selectGapKeywords([item("nothing", null, null, 4)], "rival.test", "x.test")).toEqual([]);
  });

  it("lowercases the keyword so it matches the approval table's key", () => {
    const found = selectGapKeywords([item("Piano Movers Austin", 90, null, 3)], "rival.test", "x.test");
    expect(found[0]?.keyword).toBe("piano movers austin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/dataforseo/keyword-gap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/dataforseo/keyword-gap.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { KEYWORD_CONFIG } from "./keywords.server";
import { LABS_CONFIG, labsCall } from "./labs.server";

type Client = SupabaseClient<Database>;

/**
 * The competitor keyword gap: searches a tracked competitor ranks for and the
 * owned property does not.
 *
 * Metered, so it runs only from an explicit operator click with the estimate on
 * the button — one Labs task per tracked competitor. Its results are filed as
 * pending keyword candidates and go through `decideKeywordCandidates` like
 * every other candidate. Nothing here tracks a keyword.
 *
 * `competitors_domain` is deliberately not used: the registry retired
 * intersection-based *discovery* because it returns directories and social
 * networks for a thin-footprint site. This is different — the competitor list
 * is the operator's own approved one, and the intersection is only used to
 * compare two named domains.
 */

/** One task per competitor, at the repo's own Labs task estimate. */
export function estimatedGapCostUsd(competitorCount: number): number {
  return Number((competitorCount * LABS_CONFIG.estimatedUsdPerTask).toFixed(2));
}

export type GapCandidate = {
  readonly keyword: string;
  readonly competitor: string;
  readonly searchVolume: number | null;
  readonly cpc: number | null;
  readonly competition: number | null;
  readonly competitorPosition: number | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The gap rows worth an operator's attention, from one intersection payload. */
export function selectGapKeywords(
  items: readonly Record<string, unknown>[],
  competitor: string,
  _ownDomain: string,
): GapCandidate[] {
  const found: GapCandidate[] = [];

  for (const item of items) {
    // first_domain is the owned target in the request below; a present element
    // means the owned domain already ranks, so there is no gap to report.
    if (item["first_domain_serp_element"]) continue;

    const data = (item["keyword_data"] ?? {}) as Record<string, unknown>;
    const info = (data["keyword_info"] ?? {}) as Record<string, unknown>;
    const keyword = String(data["keyword"] ?? "").trim().toLowerCase();
    const searchVolume = num(info["search_volume"]);
    if (!keyword || searchVolume === null) continue;

    const theirs = (item["second_domain_serp_element"] ?? {}) as Record<string, unknown>;
    found.push({
      keyword,
      competitor,
      searchVolume,
      cpc: num(info["cpc"]),
      competition: num(info["competition"]),
      competitorPosition: num(theirs["rank_group"]),
    });
  }

  return found;
}

/** The operator's own approved competitor list. Never a derived shortlist. */
async function readTrackedCompetitors(client: Client, tenantId: string): Promise<string[]> {
  const { data, error } = await client
    .from("tracked_competitors")
    .select("domain")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.domain);
}

async function snapshotRows(client: Client, snapshotId: string): Promise<Record<string, unknown>[]> {
  const { data } = await client
    .from("dataforseo_snapshots")
    .select("payload")
    .eq("id", snapshotId)
    .single();
  return (data?.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [];
}

export async function runKeywordGap(
  client: Client,
  tenantId: string,
  ownDomain: string,
): Promise<{ competitors: number; filed: number; costUsd: number }> {
  const competitors = await readTrackedCompetitors(client, tenantId);
  if (competitors.length === 0) {
    throw new Error(
      "No approved competitors to compare against. Approve at least one on the competitors page first: AOOS will not pick a rival for you.",
    );
  }

  const { data: existing } = await client
    .from("keyword_candidates")
    .select("keyword")
    .eq("tenant_id", tenantId);
  const { data: tracked } = await client
    .from("tracked_keywords")
    .select("keyword")
    .eq("tenant_id", tenantId);
  const known = new Set([
    ...(existing ?? []).map((row) => row.keyword.toLowerCase()),
    ...(tracked ?? []).map((row) => row.keyword.toLowerCase()),
  ]);

  let filed = 0;
  let costUsd = 0;

  for (const competitor of competitors) {
    const call = await labsCall(
      client,
      tenantId,
      "/dataforseo_labs/google/domain_intersection/live",
      "labs_domain_intersection",
      `${ownDomain} vs ${competitor}`,
      {
        target1: ownDomain,
        target2: competitor,
        intersections: false,
        location_code: KEYWORD_CONFIG.locationCode,
        language_code: KEYWORD_CONFIG.languageCode,
        limit: KEYWORD_CONFIG.suggestionLimit,
      },
    );
    costUsd += call.costUsd;

    const gaps = selectGapKeywords(await snapshotRows(client, call.snapshotId), competitor, ownDomain)
      .filter((gap) => (gap.searchVolume ?? 0) >= KEYWORD_CONFIG.minSearchVolume)
      .filter((gap) => !known.has(gap.keyword))
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, KEYWORD_CONFIG.maxCandidatesPerRun);

    for (const gap of gaps) {
      const { error } = await client.from("keyword_candidates").upsert(
        {
          tenant_id: tenantId,
          keyword: gap.keyword,
          source: "labs.domain_intersection",
          seed: competitor,
          location_code: KEYWORD_CONFIG.locationCode,
          language_code: KEYWORD_CONFIG.languageCode,
          snapshot_id: call.snapshotId,
          metrics: {
            search_volume: gap.searchVolume,
            cpc: gap.cpc,
            competition: gap.competition,
            competitor: gap.competitor,
            competitor_position: gap.competitorPosition,
            estimated: true,
          } as never,
        },
        { onConflict: "tenant_id,keyword,location_code,language_code", ignoreDuplicates: true },
      );
      if (!error) {
        filed += 1;
        known.add(gap.keyword);
      }
    }
  }

  return { competitors: competitors.length, filed, costUsd };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/dataforseo/keyword-gap.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the operator-click server function**

Append to `src/lib/dataforseo.functions.ts`:

```ts
/**
 * Metered. One DataForSEO Labs task per approved competitor, fired only by an
 * explicit operator click with the estimate shown on the button. Results are
 * filed as pending keyword candidates and go through the existing approval
 * gate; nothing is tracked here.
 */
export const runCompetitorKeywordGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { getSelectedProperty } = await import("./search-console.server");
    const property = await getSelectedProperty(context.supabase);
    const ownDomain = (property ?? "")
      .replace(/^sc-domain:/, "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (!ownDomain) throw new Error("No owned property is selected to compare against.");

    const { runKeywordGap } = await import("./dataforseo/keyword-gap.server");
    const result = await runKeywordGap(context.supabase, tenantId, ownDomain);

    const { logActivity } = await import("./os.server");
    await logActivity(context.supabase, {
      tenantId,
      actorKind: "user",
      actorId: context.userId,
      verb: "keyword.gap.collected",
      subjectKind: "capability",
      summary: `Compared the site against ${result.competitors} approved competitors and filed ${result.filed} keyword candidates for review.`,
      payload: { ...result },
    });

    return result;
  });
```

- [ ] **Step 6: Put the button, and its price, on the competitors page**

In `src/routes/competitors.tsx`, alongside the existing header actions:

```tsx
<Button
  type="button"
  size="sm"
  disabled={gapMutation.isPending}
  onClick={() => gapMutation.mutate({})}
  aria-describedby="gap-cost"
>
  {gapMutation.isPending ? "Comparing…" : "Find searches they win and you miss"}
</Button>
<p id="gap-cost" className="text-xs text-muted-foreground">
  Costs about ${estimatedGapCostUsd(trackedCount).toFixed(2)} — one paid look-up per approved
  competitor. Nothing is spent until you click, and every search it finds arrives here for
  approval before anything tracks it.
</p>
```

with

```tsx
const runGap = useServerFn(runCompetitorKeywordGap);
const gapMutation = useMutation({
  mutationFn: () => runGap(),
  onSuccess: (result) => {
    toast.success(
      `${result.filed} searches filed for approval from ${result.competitors} competitors.`,
    );
    void queryClient.invalidateQueries({ queryKey: ["keyword-candidates"] });
  },
  onError: (error: Error) => toast.error(error.message),
});
```

`trackedCount` is the count of approved competitors the page already reads. If the page does not already hold it, derive it from the existing competitor list rather than adding a read: `const trackedCount = data.tracked.filter((row) => row.active).length;`.

- [ ] **Step 7: Register the capability**

In `src/registry/modules/dataforseo.ts`, add to the DataForSEO Labs capability's `operations`:

```ts
        {
          name: "labs.domain_intersection",
          description:
            "Compare the owned domain against one approved competitor and list the searches only they rank for. Operator-triggered; results enter the keyword approval queue.",
          mutates: false,
        },
```

- [ ] **Step 8: Full check and commit**

Run: `bunx vitest run`, `bunx tsc --noEmit`, `bunx eslint src/lib/dataforseo/keyword-gap.server.ts src/lib/dataforseo/keyword-gap.test.ts src/lib/dataforseo.functions.ts src/routes/competitors.tsx src/registry/modules/dataforseo.ts` — all expected clean.

```bash
git add src/lib/dataforseo/keyword-gap.server.ts src/lib/dataforseo/keyword-gap.test.ts src/lib/dataforseo.functions.ts src/routes/competitors.tsx src/registry/modules/dataforseo.ts
git commit -m "$(cat <<'EOF'
feat: file the competitor keyword gap as candidates for the existing approval gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 5: Difficulty and intent on the candidates an operator is about to judge

`bulk_keyword_difficulty` and `search_intent` each take a list of keywords and return one row per keyword, so enriching the whole pending queue is two Labs tasks, not one per keyword. They are **metered**, so — per the house rule, and contrary to the "read-only scoring needs no gate" instinct — they sit behind their own explicit operator click on the keyword workspace with the cost stated. They write into `keyword_candidates.metrics` and raise no finding: this is information for the person deciding, not a claim.

**Files:**
- Create: `src/lib/dataforseo/keyword-enrichment.server.ts`
- Create: `src/lib/dataforseo/keyword-enrichment.test.ts`
- Modify: `src/lib/dataforseo.functions.ts`
- Modify: `src/routes/keywords.tsx`
- Modify: `src/registry/modules/dataforseo.ts`

**Interfaces:**
- Consumes: `labsCall`, `LABS_CONFIG`, `KEYWORD_CONFIG`.
- Produces:
  - `type Enrichment = { readonly keywordDifficulty: number | null; readonly searchIntent: string | null }`
  - `mergeEnrichment(rows: readonly Record<string, unknown>[], intents: readonly Record<string, unknown>[]): Map<string, Enrichment>`
  - `enrichPendingCandidates(client, tenantId): Promise<{ enriched: number; costUsd: number }>`
  - server fn `runKeywordEnrichment`.
  - `ENRICHMENT_TASK_COUNT = 2`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dataforseo/keyword-enrichment.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mergeEnrichment } from "./keyword-enrichment.server";

describe("merging the two Labs reads onto one keyword", () => {
  it("keys difficulty and intent by the keyword they came back for", () => {
    const merged = mergeEnrichment(
      [{ keyword: "piano movers austin", keyword_difficulty: 24 }],
      [{ keyword: "piano movers austin", keyword_intent: { label: "commercial" } }],
    );
    expect(merged.get("piano movers austin")).toEqual({
      keywordDifficulty: 24,
      searchIntent: "commercial",
    });
  });

  it("keeps a keyword that came back from only one of the two reads", () => {
    const merged = mergeEnrichment([{ keyword: "movers austin", keyword_difficulty: 40 }], []);
    expect(merged.get("movers austin")).toEqual({ keywordDifficulty: 40, searchIntent: null });
  });

  it("stores null rather than zero when the provider returned no difficulty", () => {
    const merged = mergeEnrichment([{ keyword: "movers austin", keyword_difficulty: null }], []);
    expect(merged.get("movers austin")?.keywordDifficulty).toBeNull();
  });

  it("lowercases keys so they match the candidate rows", () => {
    const merged = mergeEnrichment([{ keyword: "Movers Austin", keyword_difficulty: 40 }], []);
    expect(merged.has("movers austin")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/dataforseo/keyword-enrichment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/dataforseo/keyword-enrichment.server.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { KEYWORD_CONFIG } from "./keywords.server";
import { LABS_CONFIG, labsCall } from "./labs.server";

type Client = SupabaseClient<Database>;

/**
 * Difficulty and intent for the candidates sitting in the approval queue.
 *
 * Both endpoints take the whole list in one task, so the run is two Labs tasks
 * whatever the queue length. Both are metered, so this never fires on a page
 * load or a schedule — only on an operator click with the estimate on it.
 *
 * It raises no finding and changes no review state. It writes into
 * `keyword_candidates.metrics` so the person deciding sees more than a volume.
 */

/** One bulk_keyword_difficulty task plus one search_intent task. */
export const ENRICHMENT_TASK_COUNT = 2;

export function estimatedEnrichmentCostUsd(): number {
  return Number((ENRICHMENT_TASK_COUNT * LABS_CONFIG.estimatedUsdPerTask).toFixed(2));
}

export type Enrichment = {
  readonly keywordDifficulty: number | null;
  readonly searchIntent: string | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function mergeEnrichment(
  difficultyRows: readonly Record<string, unknown>[],
  intentRows: readonly Record<string, unknown>[],
): Map<string, Enrichment> {
  const merged = new Map<string, Enrichment>();

  for (const row of difficultyRows) {
    const keyword = String(row["keyword"] ?? "").trim().toLowerCase();
    if (!keyword) continue;
    merged.set(keyword, {
      keywordDifficulty: num(row["keyword_difficulty"]),
      searchIntent: merged.get(keyword)?.searchIntent ?? null,
    });
  }

  for (const row of intentRows) {
    const keyword = String(row["keyword"] ?? "").trim().toLowerCase();
    if (!keyword) continue;
    const intent = (row["keyword_intent"] ?? {}) as Record<string, unknown>;
    const label = typeof intent["label"] === "string" ? intent["label"] : null;
    merged.set(keyword, {
      keywordDifficulty: merged.get(keyword)?.keywordDifficulty ?? null,
      searchIntent: label,
    });
  }

  return merged;
}

async function snapshotRows(client: Client, snapshotId: string): Promise<Record<string, unknown>[]> {
  const { data } = await client
    .from("dataforseo_snapshots")
    .select("payload")
    .eq("id", snapshotId)
    .single();
  return (data?.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [];
}

export async function enrichPendingCandidates(
  client: Client,
  tenantId: string,
): Promise<{ enriched: number; costUsd: number }> {
  const { data: pending, error } = await client
    .from("keyword_candidates")
    .select("id, keyword, metrics")
    .eq("tenant_id", tenantId)
    .eq("review_state", "pending");
  if (error) throw new Error(error.message);

  const keywords = (pending ?? []).map((row) => row.keyword);
  if (keywords.length === 0) {
    throw new Error("No keyword candidates are waiting for a decision, so there is nothing to score.");
  }

  const difficulty = await labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/bulk_keyword_difficulty/live",
    "labs_bulk_keyword_difficulty",
    `${keywords.length} pending candidates`,
    {
      keywords,
      location_code: KEYWORD_CONFIG.locationCode,
      language_code: KEYWORD_CONFIG.languageCode,
    },
  );

  const intent = await labsCall(
    client,
    tenantId,
    "/dataforseo_labs/google/search_intent/live",
    "labs_search_intent",
    `${keywords.length} pending candidates`,
    { keywords, language_code: KEYWORD_CONFIG.languageCode },
  );

  const merged = mergeEnrichment(
    await snapshotRows(client, difficulty.snapshotId),
    await snapshotRows(client, intent.snapshotId),
  );

  let enriched = 0;
  for (const candidate of pending ?? []) {
    const scores = merged.get(candidate.keyword.trim().toLowerCase());
    if (scores === undefined) continue;
    const { error: updateError } = await client
      .from("keyword_candidates")
      .update({
        metrics: {
          ...((candidate.metrics ?? {}) as Record<string, unknown>),
          keyword_difficulty: scores.keywordDifficulty,
          search_intent: scores.searchIntent,
          enriched_at: new Date().toISOString(),
        } as never,
      })
      .eq("id", candidate.id);
    if (!updateError) enriched += 1;
  }

  return { enriched, costUsd: difficulty.costUsd + intent.costUsd };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/dataforseo/keyword-enrichment.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: The server fn and the button**

Append to `src/lib/dataforseo.functions.ts`:

```ts
/**
 * Metered: two DataForSEO Labs tasks over the whole pending queue, fired only
 * by an explicit operator click. Writes scores onto the candidates and changes
 * no review state.
 */
export const runKeywordEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertOperator } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const { enrichPendingCandidates } = await import("./dataforseo/keyword-enrichment.server");
    return enrichPendingCandidates(context.supabase, tenantId);
  });
```

In `src/routes/keywords.tsx`, beside the approve/reject controls:

```tsx
<Button
  type="button"
  size="sm"
  variant="outline"
  disabled={enrichMutation.isPending || counts.pending === 0}
  onClick={() => enrichMutation.mutate({})}
  aria-describedby="enrich-cost"
>
  {enrichMutation.isPending ? "Scoring…" : "Score how hard these are to win"}
</Button>
<p id="enrich-cost" className="text-xs text-muted-foreground">
  Costs about ${estimatedEnrichmentCostUsd().toFixed(2)} — two paid look-ups covering every
  keyword waiting for a decision, however many there are. Nothing is spent until you click, and
  no keyword is approved by it.
</p>
```

with the matching `useServerFn` / `useMutation` pair that invalidates `["keyword-candidates"]` on success and toasts `${result.enriched} keywords scored.`

- [ ] **Step 6: Register the two operations**

In `src/registry/modules/dataforseo.ts`, add to the Labs capability's `operations`:

```ts
        {
          name: "labs.bulk_keyword_difficulty",
          description:
            "Score how hard every pending keyword candidate is to win. One task for the whole queue, operator-triggered.",
          mutates: false,
        },
        {
          name: "labs.search_intent",
          description:
            "Classify what each pending keyword candidate is being searched for. One task for the whole queue, operator-triggered.",
          mutates: false,
        },
```

- [ ] **Step 7: Full check and commit**

Run: `bunx vitest run`, `bunx tsc --noEmit`, `bunx eslint src/lib/dataforseo/keyword-enrichment.server.ts src/lib/dataforseo/keyword-enrichment.test.ts src/lib/dataforseo.functions.ts src/routes/keywords.tsx src/registry/modules/dataforseo.ts` — all expected clean.

```bash
git add src/lib/dataforseo/keyword-enrichment.server.ts src/lib/dataforseo/keyword-enrichment.test.ts src/lib/dataforseo.functions.ts src/routes/keywords.tsx src/registry/modules/dataforseo.ts
git commit -m "$(cat <<'EOF'
feat: score pending keyword candidates for difficulty and intent on an operator click

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 6: The backlink snapshots nobody has ever read

Six backlink endpoints run on every baseline and `backlink-evidence.server.ts` says in its own header that it "deliberately produces no recommendations". That is the purest stage-3 case in the estate. This task reads one thing out of those already-paid-for snapshots and says it out loud: how the referring-domain count moved between the two most recent `backlinks_referring_domains` snapshots, and which domains appeared or disappeared between them.

Scope honestly: `backlinks.server.ts:130-146` stores `result[0].items` for that endpoint. Each item carries a `domain`; DataForSEO also returns `first_seen` and `lost_date` on these rows, but this task does **not** depend on them — new and lost are computed by comparing the two stored snapshots, which is true regardless of which fields the provider populates. Nothing here recommends acquiring links: per the growth research, any paid or reciprocal link acquisition must never be emitted, so this rule reports movement and stops.

This is the one new rule with counts on both sides, so it is the one that takes its confidence from `confidence.ts` rather than asserting a fact.

**Files:**
- Modify: `src/lib/targeting-rules.ts`, `src/lib/targeting-rules.test.ts`
- Modify: `src/lib/finding-copy.ts`, `src/lib/rule-buckets.ts`, `src/lib/rule-buckets.test.ts`, `src/lib/finding-router.ts`
- Modify: `src/lib/getting-found.ts`, `src/lib/getting-found.functions.ts`, `src/components/os/getting-found-facts.ts`
- Modify: `src/lib/dataforseo/targeting-rules.server.ts`

**Interfaces:**
- Consumes: `confidenceInCountChange` (`src/lib/confidence.ts:95`), `TargetingObservation`.
- Produces: `type ReferringDomainSnapshot = { readonly reportingDate: string; readonly domains: readonly string[] }`, `detectReferringDomainMovement(prior: ReferringDomainSnapshot | null, current: ReferringDomainSnapshot | null): TargetingObservation[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/targeting-rules.test.ts`:

```ts
describe("movement in the sites linking to this one", () => {
  const prior = { reportingDate: "2026-07-14", domains: ["a.test", "b.test", "c.test"] };

  it("says nothing when only one snapshot exists, because nothing can have moved", () => {
    expect(detectReferringDomainMovement(null, prior)).toEqual([]);
  });

  it("says nothing when the two snapshots hold the same domains", () => {
    expect(detectReferringDomainMovement(prior, { reportingDate: "2026-08-14", domains: [...prior.domains] })).toEqual([]);
  });

  it("names what appeared and what disappeared between the two", () => {
    const found = detectReferringDomainMovement(prior, {
      reportingDate: "2026-08-14",
      domains: ["a.test", "b.test", "d.test"],
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.rule).toBe("referring_domain_movement");
    expect(found[0]?.evidence["gained"]).toEqual(["d.test"]);
    expect(found[0]?.evidence["lost"]).toEqual(["c.test"]);
  });

  it("takes its confidence from the counts, not from a literal", () => {
    const found = detectReferringDomainMovement(prior, {
      reportingDate: "2026-08-14",
      domains: ["a.test"],
    });
    // Three to one is far below confidence.ts's MIN_BASELINE of ten, so the
    // finding is recorded and reported as weak rather than suppressed.
    expect(found[0]?.confidence).toBeLessThan(0.4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/targeting-rules.test.ts`
Expected: FAIL — `detectReferringDomainMovement is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/targeting-rules.ts` (and add `import { confidenceInCountChange } from "./confidence";` at the top):

```ts
export type ReferringDomainSnapshot = {
  readonly reportingDate: string;
  readonly domains: readonly string[];
};

/**
 * How the set of sites linking here moved between the two most recent stored
 * backlink snapshots.
 *
 * This reports movement and stops. Acquiring links is never recommended:
 * "Exchanging money for links" is link spam in Google's own spam policies
 * (docs/superpowers/research/2026-08-20-small-site-growth-research.md §3), and
 * this lane emits nothing that could be read as an instruction to buy them.
 *
 * Both sides are counts, so the confidence is derived rather than asserted.
 */
export function detectReferringDomainMovement(
  prior: ReferringDomainSnapshot | null,
  current: ReferringDomainSnapshot | null,
): TargetingObservation[] {
  if (prior === null || current === null) return [];

  const before = new Set(prior.domains.map(normalise));
  const after = new Set(current.domains.map(normalise));
  const gained = [...after].filter((domain) => !before.has(domain));
  const lost = [...before].filter((domain) => !after.has(domain));
  if (gained.length === 0 && lost.length === 0) return [];

  const judgement = confidenceInCountChange(before.size, after.size);

  return [
    {
      rule: "referring_domain_movement",
      target: current.reportingDate,
      title:
        gained.length >= lost.length
          ? `${gained.length} more sites link here than last time`
          : `${lost.length} sites that linked here no longer do`,
      description:
        `Between ${prior.reportingDate} and ${current.reportingDate} the number of sites linking ` +
        `here went from ${before.size} to ${after.size}. ${judgement.reason}`,
      evidence: {
        priorDate: prior.reportingDate,
        currentDate: current.reportingDate,
        priorCount: before.size,
        currentCount: after.size,
        gained: gained.slice(0, 25),
        lost: lost.slice(0, 25),
      },
      confidence: judgement.value,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/targeting-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the rule end to end**

`src/lib/finding-copy.ts` — add `"referring_domain_movement",` to `ALL_SEARCH_RULES`, the writer, and its registration:

```ts
function referringDomainMovement(evidence: Evidence, on: string): FindingCopy {
  const priorCount = num(evidence["priorCount"]);
  const currentCount = num(evidence["currentCount"]);
  const priorDate = text(evidence["priorDate"]) ?? on;
  const gained = Array.isArray(evidence["gained"]) ? evidence["gained"].length : 0;
  const lost = Array.isArray(evidence["lost"]) ? evidence["lost"].length : 0;
  return {
    claim:
      gained >= lost
        ? "More other sites link here than they did"
        : "Fewer other sites link here than they did",
    evidence:
      priorCount === null || currentCount === null
        ? null
        : `${priorCount} linking sites on ${priorDate}, ${currentCount} on ${on} · ${gained} new, ${lost} gone`,
    currentWording: null,
  };
}
```

```ts
  referring_domain_movement: referringDomainMovement,
};
```

`src/lib/rule-buckets.ts` — add `"backlink_collection"` to `Prerequisite`, `readonly backlinkCollection: boolean;` to `PrerequisiteState`, `backlink_collection: "two stored backlink readings, so there is movement to compare",` to `PREREQUISITE_COPY`, `backlink_collection: "backlinkCollection",` to `PREREQUISITE_STATE_KEY`, and:

```ts
  {
    rule: "referring_domain_movement",
    bucket: "pooled",
    needsPerTarget: null,
    alsoNeeds: ["backlink_collection", "second_collection"],
    why: "The count of linking domains is a count, so it takes confidenceInCountChange like every other count-shaped rule rather than a literal: at this property's link volume a move of one or two domains sits inside ordinary variation, and the finding says so instead of being suppressed. It is pooled by construction — the whole property has one referring-domain set, not one per page. detectReferringDomainMovement returns nothing without two stored backlinks_referring_domains snapshots.",
  },
```

`src/lib/rule-buckets.test.ts` — add `backlinkCollection: true` to the three state literals.

`src/lib/finding-router.ts` — `referring_domain_movement: "competition",` (off-site domains are a competitive question, not a page one).

`src/lib/getting-found.ts` / `getting-found.functions.ts` / `getting-found-facts.ts` — `backlinkSnapshots: number` on the facts, `backlinkCollection: facts.backlinkSnapshots >= 2` in the state, and the read:

```ts
      db
        .from("dataforseo_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("kind", "backlinks_referring_domains"),
```

- [ ] **Step 6: Add the detector to the pass**

In `src/lib/dataforseo/targeting-rules.server.ts`:

```ts
async function readReferringDomainSnapshots(
  client: Client,
  tenantId: string,
): Promise<[ReferringDomainSnapshot | null, ReferringDomainSnapshot | null]> {
  const { data, error } = await client
    .from("dataforseo_snapshots")
    .select("reporting_date, payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "backlinks_referring_domains")
    .order("reporting_date", { ascending: false })
    .limit(2);
  if (error) throw new Error(error.message);

  const read = (row: { reporting_date: string; payload: unknown } | undefined) =>
    row === undefined
      ? null
      : {
          reportingDate: row.reporting_date,
          domains: ((row.payload as { rows?: Record<string, unknown>[] } | null)?.rows ?? [])
            .map((item) => String(item["domain"] ?? ""))
            .filter(Boolean),
        };

  return [read((data ?? [])[1]), read((data ?? [])[0])];
}
```

```ts
  const [priorLinks, currentLinks] = await readReferringDomainSnapshots(client, tenantId);
  const observations = [
    ...detectUnobservedKeywords(approved, observed),
    ...detectKeywordsWithoutPage(approved, pages),
    ...detectQuestionsWithoutPage(await readStoredQuestions(client, tenantId), pages),
    ...detectReferringDomainMovement(priorLinks, currentLinks),
  ];
```

`referring_domain_movement` gets no entry in `SUGGESTED_ACTION_BY_RULE`, so it falls to `"review"` — which `describeSuggestedAction` already answers with "this is a gap we spotted, recorded and dated". That is the right answer: there is nothing to approve, and nothing may be recommended about acquiring links.

- [ ] **Step 7: Full check and commit**

Run: `bunx vitest run`, `bunx tsc --noEmit`, `bunx eslint <every file touched above>` — all expected clean. `connections.test.ts` should now show DataForSEO with findings from both the keyword and the backlink side.

```bash
git add src/lib/targeting-rules.ts src/lib/targeting-rules.test.ts src/lib/finding-copy.ts src/lib/rule-buckets.ts src/lib/rule-buckets.test.ts src/lib/finding-router.ts src/lib/getting-found.ts src/lib/getting-found.functions.ts src/components/os/getting-found-facts.ts src/lib/dataforseo/targeting-rules.server.ts
git commit -m "$(cat <<'EOF'
feat: report movement in the linking domains the backlink snapshots already hold

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 7: No rule id reaches a screen, and the scores reach the person deciding

Two leaks and one gap remain. `src/routes/search.tools.tsx:636,662` renders `RULE_LABEL[rule] ?? rule`, so any new rule id shows raw on the findings list. The keyword workspace shows volume, CPC and competition but not the difficulty and intent Task 5 now stores. And the geo/page-map question the brief left conditional needs its answer written down rather than left implied.

**Geo and page-map proposals are out of scope for this lane, deliberately.** Nothing in this repository stores a location dimension for the owned property: `KEYWORD_CONFIG.locationCode` and `SERP_CONFIG.locationCode` are both the single constant 2840 (United States), no tenant field carries a service area, and `page_metadata_observations` holds no geographic field. A "pages for these towns" proposal would have to invent the town list, which is exactly the invented-noun failure the spec rule forbids — and mass templated near-duplicate location pages are the doorway-page pattern the growth research names on the "hurting us" side of its taxonomy. If it is wanted later, the honest prerequisite is an operator-entered service-area list on the tenant, and that is a separate lane.

**Files:**
- Modify: `src/routes/search.tools.tsx:224-236`
- Modify: `src/routes/keywords.tsx` (candidate table columns)
- Test: `src/lib/finding-copy.test.ts` (a leak guard)

**Interfaces:**
- Consumes: `ALL_SEARCH_RULES` (Task 1/3/6), the `keyword_difficulty` / `search_intent` metrics keys (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/finding-copy.test.ts`:

```ts
describe("no rule id can reach the screen through the copy layer", () => {
  it("writes a claim for every registered rule that never contains its id", () => {
    for (const rule of ALL_SEARCH_RULES) {
      const copy = describeFinding(rule, {}, "2026-08-14");
      expect(copy.claim.length, `${rule} has no claim`).toBeGreaterThan(0);
      expect(copy.claim, `${rule} leaked its id`).not.toContain(rule);
      expect(copy.claim, `${rule} left an underscore on screen`).not.toMatch(/[a-z]_[a-z]/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `bunx vitest run src/lib/finding-copy.test.ts`
Expected: PASS if every writer from Tasks 1, 3 and 6 was written as specified. If it FAILS, the named rule's writer is emitting its own id — fix the writer, not the test.

- [ ] **Step 3: Close the label leak on the findings list**

In `src/routes/search.tools.tsx`, extend `RULE_LABEL`:

```ts
  approved_keyword_unobserved: "Approved searches nobody has checked",
  approved_keyword_no_page: "Approved searches with no page about them",
  question_asked_no_page: "Questions Google shows that nothing here answers",
  referring_domain_movement: "Movement in the sites linking here",
```

- [ ] **Step 4: Show the scores to the person deciding**

In `src/routes/keywords.tsx`, extend the metrics reader and the table:

```ts
type Metrics = {
  search_volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  keyword_difficulty?: number | null;
  search_intent?: string | null;
  competitor?: string | null;
};
```

Add two cells to the candidate row, beside the existing competition cell:

```tsx
<td className="px-3 py-2 text-right">{fmtNumber(readMetrics(row.metrics).keyword_difficulty)}</td>
<td className="px-3 py-2">{readMetrics(row.metrics).search_intent ?? "—"}</td>
```

with matching header cells reading `How hard to win` and `What they want`, and — for a candidate filed by Task 4 — the competitor beneath the keyword:

```tsx
{readMetrics(row.metrics).competitor ? (
  <p className="text-xs text-muted-foreground">
    Found because {readMetrics(row.metrics).competitor} ranks for it and this site does not.
  </p>
) : null}
```

`—` is the established absence mark on this page (`fmtNumber`, `fmtMoney`), so an unscored candidate reads as unscored rather than as zero.

- [ ] **Step 5: Verify the whole lane end to end**

Run: `bunx vitest run` — expected PASS, whole suite.
Run: `bunx tsc --noEmit` — expected clean.
Run: `bunx eslint src/routes/search.tools.tsx src/routes/keywords.tsx src/lib/finding-copy.test.ts` — expected clean.
Run: `bunx vitest run src/lib/connections.registry.test.ts` — expected PASS, and this is the assertion that proves the stage 3 → stage 4 claim is real rather than asserted in a comment.

- [ ] **Step 6: Commit**

```bash
git add src/routes/search.tools.tsx src/routes/keywords.tsx src/lib/finding-copy.test.ts
git commit -m "$(cat <<'EOF'
feat: name every targeting check in plain words and show the scores on the candidates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

## Self-review

**Spec coverage.** Brief item 1 (the wire) → Tasks 1 and 2. Item 2 (PAA question mining from stored payloads) → Task 3, verification-gated. Item 3 (`domain_intersection`, operator-click, cost on button, tenant competitor list, results into the existing approval flow) → Task 4. Item 4 (`bulk_keyword_difficulty` + `search_intent` behind the same operator gate, cost stated) → Task 5. Item 5 (backlinks surfacing, honestly scoped) → Task 6. Item 6 (geo/page-map) → Task 7, explicitly out of scope with the reason written down.

**Type consistency.** `TargetingObservation`, `PageText` and `TargetingRule` are defined once in Task 1 and used unchanged in Tasks 3 and 6. `runTargetingPass` keeps its signature across Tasks 2, 3 and 6; only its `observations` array grows. `estimatedGapCostUsd` (Task 4) and `estimatedEnrichmentCostUsd` (Task 5) are separate functions on purpose — the first scales with the competitor count, the second does not scale at all.

**Known dependency on a live answer.** Task 3's shape depends on Step 2's output. Everything before and after it is independent of that answer.
