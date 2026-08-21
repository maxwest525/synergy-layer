# Actionable Suggestion Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every suggestion card on the three category pages can be acted on from the card itself, or says on screen why it cannot be.

**Architecture:** The queue (`src/lib/suggestion-queue.ts`) already computes `canIgnore` / `canRestore` / `canRegenerate` per item; nothing reads them. This lane makes the pages read them through one new pure module (`suggestion-verbs.ts`) and one shared card component that replaces the three copy-pasted `SuggestionRow` functions. Legality that is currently a lie gets corrected at the source rather than papered over in the UI: observation-only rows lose `canIgnore`, audit findings gain it once a suppression table exists, and every non-executable recommendation kind carries an on-screen reason instead of a silently missing button. Approve never bypasses `/changes/$id`; drafting a fix routes through the existing governed `proposeFixFromFinding` path.

**Tech Stack:** TypeScript, React 19, TanStack Start/Router/Query, Supabase (Postgres + RLS), vitest + @testing-library/react (jsdom), Tailwind.

**Spec:** No separate spec document exists for this lane. The requirements are the Lane 1 brief, restated in full under **Goal** and **Global Constraints** below; the plan argues from those and from the file receipts named in each task.

## Global Constraints

- **No demo data, ever.** Every number and every row on screen is a stored row. A read that fails renders a named absence, never a zero.
- **Approve routes through governance.** Any approval of a page change goes through `/changes/$id` and `runTransition`. No new code path may set an approved/applied state directly.
- **No lying buttons.** A verb that is not legal renders *nothing* — never a disabled control, never a control that throws on click. Where the operator would reasonably expect a verb, an on-screen reason sentence replaces it.
- **Metered actions show their cost on the button, and fire only on an explicit operator click.** `proposeFixFromFinding` costs one Firecrawl render plus one Gemini call. `regenerateTitleH1Proposal` costs one Gemini call. Never auto-fire either.
- **Plain words on screen.** No rule ids, no stored enum values, no fingerprints in operator-facing copy.
- **Surgical diffs.** Every changed line traces to this lane. Do not reformat, refactor, or improve adjacent code.
- **Every behavior tested.** vitest, with factory helpers and `describe` blocks that state the prose claim being verified (see `src/lib/suggestion-queue.test.ts` and `src/components/os/site-health-page.test.tsx` for the house style).
- **Repo-wide lint is pre-broken.** Do not attempt a repo-wide lint fix. Files you touch must be clean: `bunx eslint <the files you changed>`.
- **Commit trailers**, on every commit in this plan:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
  ```
- **Branch:** `feat/visibility-lanes` in worktree `C:\Users\maxwe\projects\aoos\.claude\worktrees\rule-thresholds`. Run every command from that directory.
- **Test command:** `bunx vitest run <path>` for one file, `bunx vitest run` for the suite.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/suggestion-queue.ts` (modify) | Verb legality per queue item. Gains `observationOnly`, `suppressed`; `canIgnore`/`canRestore` corrected. | 1, 5 |
| `src/lib/suggestion-verbs.ts` (create) | Pure: `QueueItem` → the verbs to render, each with its plain-word label and consequence line. | 2 |
| `src/lib/recommendation-queue-state.ts` (create) | Pure: which recommendation state an ignore/restore may write, or the refusal reason. | 3 |
| `src/lib/os-admin.functions.ts` / `os-admin.server.ts` (modify) | `setRecommendationQueueState` server fn + thin server handler over the pure guard. | 3 |
| `src/components/os/suggestion-card.tsx` (create) | The one card the three category pages render: link + legal verbs + reason lines. | 4 |
| `src/components/os/getting-found-page.tsx`, `your-pages-page.tsx`, `site-health-page.tsx` (modify) | Delete the three local `SuggestionRow`s, render `SuggestionCard`. | 4 |
| `supabase/migrations/20260821090000_suggestion_suppressions.sql` (create) | Tenant-scoped, fingerprint-keyed, restorable suppression of audit findings. | 5 |
| `src/lib/suggestion-suppressions.functions.ts` (create) | `ignoreAuditFinding` / `restoreAuditFinding` server fns. | 5 |
| `src/lib/command-center.functions.ts` (modify) | Reads suppressions; populates `observationOnly` and `suppressed` on queue sources. | 1, 5 |
| `src/lib/recommendation-action.ts` (modify) | Per-kind decision: executable, or a named `unavailableReason`; plus the governed `draft` path. | 6 |
| `src/lib/finding-fix-target.ts` (modify) | Exports `hasGovernedFixPath(rule)` — the single set of rules with a governed fix. | 7 |
| `src/routes/search.tools.tsx` (modify) | Drops its duplicate `DRAFTABLE_RULES` in favour of `hasGovernedFixPath`. | 7 |

---

### Task 1: Observation-only rows stop claiming they can be ignored

`canIgnoreSource` (`src/lib/suggestion-queue.ts:171-173`) returns `true` for every recommendation. But `decide()` (`src/lib/os-admin.server.ts:33-40`) refuses any observation-only row and any row already in state `observed`. So the queue currently promises a verb the server will always reject. The queue has no way to know: `QueueSource` carries no observation flag. Add one, and populate it from the same `isObservationOnly` helper the detail route already uses (`src/routes/recommendations.$id.tsx:65-66`).

**Files:**
- Modify: `src/lib/suggestion-queue.ts:33-71` (type), `:166-173` (legality)
- Modify: `src/lib/command-center.functions.ts:208-223` (recommendation sources)
- Test: `src/lib/suggestion-queue.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `QueueSource.observationOnly?: boolean`; `QueueItem.canIgnore` / `canRestore` are `false` when `observationOnly === true`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/suggestion-queue.test.ts`:

```ts
describe("what an observation may be told to do", () => {
  it("does not offer to ignore observed evidence, because the server refuses it", () => {
    const queue = buildQueue(
      [source({ id: "r1", storedState: "observed", observationOnly: true })],
      NOW,
    );
    expect(queue.open[0]?.canIgnore).toBe(false);
  });

  it("does not offer to restore observed evidence either", () => {
    const queue = buildQueue(
      [source({ id: "r1", storedState: "rejected", observationOnly: true })],
      NOW,
    );
    expect(queue.ignored[0]?.canRestore).toBe(false);
  });

  it("still offers to ignore an ordinary recommendation", () => {
    const queue = buildQueue([source({ id: "r2", storedState: "proposed" })], NOW);
    expect(queue.open[0]?.canIgnore).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/suggestion-queue.test.ts -t "what an observation may be told to do"`
Expected: FAIL — TypeScript rejects `observationOnly` on `QueueSource`, and the first two assertions receive `true`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/suggestion-queue.ts`, add to `QueueSource` (after the `rule` field, around line 57):

```ts
  /**
   * True when the row is stored evidence rather than a proposal. The server
   * refuses to decide one, so the queue must not offer the verb.
   */
  readonly observationOnly?: boolean;
```

Replace `canRestoreSource` and `canIgnoreSource` (lines 165-173):

```ts
/**
 * A rejected change request is terminal, so restoring it is not offered, and
 * observed evidence was never a decision to reverse.
 */
function canRestoreSource(source: QueueSource): boolean {
  return source.kind !== "change" && source.observationOnly !== true;
}

/**
 * Ignoring needs somewhere to store the suppression. Audit findings have none
 * yet, and observed evidence is a fact rather than a suggestion: `decide`
 * refuses it, so offering the verb here would guarantee a failed click.
 */
function canIgnoreSource(source: QueueSource): boolean {
  return source.kind !== "audit" && source.observationOnly !== true;
}
```

In `src/lib/command-center.functions.ts`, add the import beside the existing ones near line 5:

```ts
import { isObservationOnly } from "./recommendation-action";
```

and add one field to `recommendationSources` (inside the object literal starting at line 208, beside `rule`):

```ts
      observationOnly: isObservationOnly(row.metadata) || row.state === "observed",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/suggestion-queue.test.ts src/lib/command-center.test.ts`
Expected: PASS, all files.

- [ ] **Step 5: Lint the touched files and commit**

```bash
bunx eslint src/lib/suggestion-queue.ts src/lib/command-center.functions.ts src/lib/suggestion-queue.test.ts
git add src/lib/suggestion-queue.ts src/lib/command-center.functions.ts src/lib/suggestion-queue.test.ts
git commit -m "$(cat <<'EOF'
fix: stop the queue offering to ignore observed evidence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 2: The verbs a card may show, as a pure module

One place decides which verbs a card renders and what each one says it will do. Pure, so it tests without a DOM and cannot drift between the three pages.

**Files:**
- Create: `src/lib/suggestion-verbs.ts`
- Test: `src/lib/suggestion-verbs.test.ts`

**Interfaces:**
- Consumes: `QueueItem` from `./suggestion-queue`, including `canIgnore`/`canRestore`/`canRegenerate` and the `observationOnly` correction from Task 1.
- Produces:
  ```ts
  export type SuggestionVerbId = "ignore" | "restore" | "regenerate";
  export type SuggestionVerb = {
    readonly id: SuggestionVerbId;
    readonly label: string;
    readonly consequence: string;
    readonly metered: boolean;
  };
  export function verbsFor(item: QueueItem): readonly SuggestionVerb[];
  ```
  Task 4 renders exactly this list. Task 7 adds a fourth id, `"draft"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/suggestion-verbs.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildQueue, type QueueSource } from "./suggestion-queue";
import { verbsFor } from "./suggestion-verbs";

const NOW = "2026-08-21T12:00:00.000Z";

function source(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): QueueSource {
  return {
    kind: "recommendation",
    categoryId: "search",
    title: "Title does not say Tulsa",
    targetUrl: "https://trumoveinc.com/corporate-relocation",
    storedState: "proposed",
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function idsFor(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): string[] {
  const queue = buildQueue([source(overrides)], NOW);
  const item = [...queue.open, ...queue.ignored, ...queue.done][0];
  if (!item) throw new Error("the fixture produced no queue item");
  return verbsFor(item).map((verb) => verb.id);
}

describe("which verbs a card may offer", () => {
  it("offers ignore on an open suggestion that can be ignored", () => {
    expect(idsFor({ id: "r1" })).toContain("ignore");
  });

  it("does not offer ignore on a row already ignored", () => {
    expect(idsFor({ id: "r1", storedState: "rejected" })).not.toContain("ignore");
  });

  it("offers restore only on an ignored row", () => {
    expect(idsFor({ id: "r1", storedState: "rejected" })).toContain("restore");
    expect(idsFor({ id: "r2" })).not.toContain("restore");
  });

  it("offers a redraft only where a redraft path exists", () => {
    expect(
      idsFor({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" }),
    ).toContain("regenerate");
    expect(
      idsFor({ id: "c2", kind: "change", proposalType: "page_metadata", storedState: "proposed" }),
    ).not.toContain("regenerate");
  });

  it("offers nothing on a done row, because the decision is made", () => {
    expect(idsFor({ id: "r1", storedState: "applied" })).toEqual([]);
  });
});

describe("what each verb tells the operator it will do", () => {
  it("names the cost of the redraft on the verb itself", () => {
    const queue = buildQueue(
      [source({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" })],
      NOW,
    );
    const redraft = verbsFor(queue.open[0]!).find((verb) => verb.id === "regenerate");
    expect(redraft?.metered).toBe(true);
    expect(redraft?.consequence).toMatch(/one AI call/i);
  });

  it("says an ignore is reversible, so nothing is lost by using it", () => {
    const queue = buildQueue([source({ id: "r1" })], NOW);
    const ignore = verbsFor(queue.open[0]!).find((verb) => verb.id === "ignore");
    expect(ignore?.metered).toBe(false);
    expect(ignore?.consequence).toMatch(/put it back/i);
  });

  it("never names a rule id or a stored state in operator copy", () => {
    const queue = buildQueue(
      [source({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" })],
      NOW,
    );
    for (const verb of verbsFor(queue.open[0]!)) {
      expect(`${verb.label} ${verb.consequence}`).not.toMatch(
        /title_h1|page_metadata|proposed|rejected|weak_ctr_page/,
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/suggestion-verbs.test.ts`
Expected: FAIL — `Cannot find module './suggestion-verbs'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/suggestion-verbs.ts`:

```ts
/**
 * Which verbs one suggestion card may offer, and what each one promises.
 *
 * The queue already decides legality; this module decides only what is shown
 * and in what words. A verb the queue calls illegal is absent from the list —
 * never present and disabled, because a control an operator cannot use teaches
 * them to stop reading the controls.
 *
 * Pure, so the three category pages cannot drift from one another.
 */

import type { QueueItem } from "./suggestion-queue";

export type SuggestionVerbId = "ignore" | "restore" | "regenerate";

export type SuggestionVerb = {
  readonly id: SuggestionVerbId;
  readonly label: string;
  /** What clicking it does, in the operator's words. Rendered beside the verb. */
  readonly consequence: string;
  /** True when the click spends money. The card renders the cost on the button. */
  readonly metered: boolean;
};

const IGNORE: SuggestionVerb = {
  id: "ignore",
  label: "Not now",
  consequence: "Moves it out of your list. You can put it back at any time.",
  metered: false,
};

const RESTORE: SuggestionVerb = {
  id: "restore",
  label: "Put it back",
  consequence: "Returns it to your list, where it was before you set it aside.",
  metered: false,
};

const REGENERATE: SuggestionVerb = {
  id: "regenerate",
  label: "Write it again",
  consequence:
    "Writes fresh wording from the evidence stored today. Costs one AI call, and nothing reaches the site until you approve it.",
  metered: true,
};

/**
 * A done row is finished, so it carries no verbs: the decision was made and
 * neither ignoring nor redrafting it means anything.
 */
export function verbsFor(item: QueueItem): readonly SuggestionVerb[] {
  if (item.queueState === "done") return [];

  const verbs: SuggestionVerb[] = [];
  if (item.queueState === "open" && item.canIgnore) verbs.push(IGNORE);
  if (item.queueState === "ignored" && item.canRestore) verbs.push(RESTORE);
  if (item.canRegenerate) verbs.push(REGENERATE);
  return verbs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/suggestion-verbs.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

```bash
bunx eslint src/lib/suggestion-verbs.ts src/lib/suggestion-verbs.test.ts
git add src/lib/suggestion-verbs.ts src/lib/suggestion-verbs.test.ts
git commit -m "$(cat <<'EOF'
feat: derive a suggestion card's verbs from the queue's legality

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 3: A server function that can ignore and restore a recommendation

`decideRecommendation` (`src/lib/os-admin.functions.ts:63-72`) is the only path to a recommendation's state, and it refuses every row whose suggested action is non-executable (`src/lib/os-admin.server.ts:44-48`) — which, per `describeSuggestedAction`, is every row. Ignoring is not approving: setting a suggestion aside runs nothing, so it must not be gated on there being something to run. This task adds a separate, narrower path with its own pure guard, and leaves `decideRecommendation` untouched.

**Files:**
- Create: `src/lib/recommendation-queue-state.ts`
- Create: `src/lib/recommendation-queue-state.test.ts`
- Modify: `src/lib/os-admin.server.ts` (append a function; `decide` is not touched)
- Modify: `src/lib/os-admin.functions.ts` (append a server fn after `decideRecommendation`, line 72)

**Interfaces:**
- Consumes: `isObservationOnly` from `./recommendation-action`.
- Produces:
  ```ts
  // recommendation-queue-state.ts
  export type QueueStateWrite =
    | { readonly ok: true; readonly nextState: "rejected" | "proposed" }
    | { readonly ok: false; readonly reason: string };
  export function nextRecommendationState(
    verb: "ignore" | "restore",
    currentState: string,
    observationOnly: boolean,
  ): QueueStateWrite;

  // os-admin.server.ts
  export async function setQueueState(
    client: Client, id: string, verb: "ignore" | "restore", userId: string,
  ): Promise<{ id: string; state: string }>;

  // os-admin.functions.ts — Task 4 calls this
  export const setRecommendationQueueState: /* POST, { id: uuid, verb: "ignore" | "restore" } */;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/recommendation-queue-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { nextRecommendationState } from "./recommendation-queue-state";

describe("setting a suggestion aside, and taking it back", () => {
  it("ignores an open suggestion without asking whether anything is runnable", () => {
    expect(nextRecommendationState("ignore", "proposed", false)).toEqual({
      ok: true,
      nextState: "rejected",
    });
  });

  it("restores an ignored suggestion to the open list", () => {
    expect(nextRecommendationState("restore", "rejected", false)).toEqual({
      ok: true,
      nextState: "proposed",
    });
  });

  it("refuses to set aside observed evidence, and says why in plain words", () => {
    const result = nextRecommendationState("ignore", "observed", true);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/what we saw/i);
  });

  it("refuses to ignore something already ignored", () => {
    const result = nextRecommendationState("ignore", "rejected", false);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/already set aside/i);
  });

  it("refuses to restore something that is not set aside", () => {
    const result = nextRecommendationState("restore", "proposed", false);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/not set aside/i);
  });

  it("refuses to reopen an approved suggestion, because that decision was acted on", () => {
    const result = nextRecommendationState("restore", "approved", false);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/already approved/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/recommendation-queue-state.test.ts`
Expected: FAIL — `Cannot find module './recommendation-queue-state'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/recommendation-queue-state.ts`:

```ts
/**
 * Whether an ignore or a restore may write, and what it writes.
 *
 * Deliberately separate from `decide`: approving a recommendation is gated on
 * there being an executable handler behind it, because an approval that runs
 * nothing is a lie. Setting a suggestion aside runs nothing by definition, so
 * that gate does not apply to it — but the other guards do, and they live here
 * rather than in the server module so they can be tested exhaustively.
 */

export type QueueStateWrite =
  | { readonly ok: true; readonly nextState: "rejected" | "proposed" }
  | { readonly ok: false; readonly reason: string };

export function nextRecommendationState(
  verb: "ignore" | "restore",
  currentState: string,
  observationOnly: boolean,
): QueueStateWrite {
  if (observationOnly || currentState === "observed") {
    return {
      ok: false,
      reason:
        "This is a record of what we saw, not a suggestion. There is nothing here to set aside.",
    };
  }
  if (currentState === "approved") {
    return { ok: false, reason: "This was already approved, so it cannot be moved back." };
  }
  if (verb === "ignore") {
    if (currentState === "rejected") {
      return { ok: false, reason: "This is already set aside." };
    }
    return { ok: true, nextState: "rejected" };
  }
  if (currentState !== "rejected") {
    return { ok: false, reason: "This is not set aside, so there is nothing to put back." };
  }
  return { ok: true, nextState: "proposed" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/recommendation-queue-state.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the server handler**

Append to `src/lib/os-admin.server.ts`, immediately after `decide` ends (line 74, before the `resolveItem` doc comment):

```ts
/**
 * Set a suggestion aside, or take it back.
 *
 * This is not `decide`. It records that the operator does not want to see the
 * row now; it authorises nothing and runs nothing, so it is not gated on there
 * being an executable handler. `approved_at` and `approved_by` are deliberately
 * left alone: nobody approved anything.
 */
export async function setQueueState(
  client: Client,
  id: string,
  verb: "ignore" | "restore",
  userId: string,
) {
  const { isObservationOnly } = await import("./recommendation-action");
  const { nextRecommendationState } = await import("./recommendation-queue-state");

  const { data: existing, error: readError } = await client
    .from("recommendations")
    .select("id, title, state, metadata")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error("That suggestion is not visible to this account.");

  const write = nextRecommendationState(verb, existing.state, isObservationOnly(existing.metadata));
  if (!write.ok) throw new Error(write.reason);

  const { data: updated, error } = await client
    .from("recommendations")
    .update({ state: write.nextState })
    .eq("id", id)
    .select("id, state")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(client, {
    actorKind: "user",
    actorId: userId,
    verb: `recommendation.${verb}`,
    subjectKind: "recommendation",
    subjectId: id,
    summary:
      verb === "ignore"
        ? `${existing.title} was set aside.`
        : `${existing.title} was put back on the list.`,
  });

  return updated;
}
```

- [ ] **Step 6: Add the server function**

Append to `src/lib/os-admin.functions.ts`, immediately after `decideRecommendation` (line 72):

```ts
/**
 * Set a suggestion aside, or take it back. Reversible, records nothing as
 * approved, and runs nothing — so it carries no cost and no site effect.
 */
export const setRecommendationQueueState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), verb: z.enum(["ignore", "restore"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertOperator, setQueueState } = await import("./os-admin.server");
    await assertOperator(context.supabase, context.userId);
    return setQueueState(context.supabase, data.id, data.verb, context.userId);
  });
```

- [ ] **Step 7: Run the suite and commit**

Run: `bunx vitest run src/lib/recommendation-queue-state.test.ts && bunx tsc --noEmit`
Expected: tests PASS; typecheck reports no new errors in the three touched files.

```bash
bunx eslint src/lib/recommendation-queue-state.ts src/lib/recommendation-queue-state.test.ts src/lib/os-admin.server.ts src/lib/os-admin.functions.ts
git add src/lib/recommendation-queue-state.ts src/lib/recommendation-queue-state.test.ts src/lib/os-admin.server.ts src/lib/os-admin.functions.ts
git commit -m "$(cat <<'EOF'
feat: let an operator set a suggestion aside and take it back

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 4: One shared card, with its verbs on it

`getting-found-page.tsx:138-166`, `your-pages-page.tsx:112-134` and `site-health-page.tsx:133-155` hold three near-identical `SuggestionRow` functions, each rendering one passive `Link` from `actionFor`. Replace all three with one component that also renders the verbs from Task 2, wired to real mutations.

**Files:**
- Create: `src/components/os/suggestion-card.tsx`
- Modify: `src/components/os/getting-found-page.tsx:138-166` (delete `SuggestionRow`, keep `URGENCY_TONE` only if still used elsewhere in the file — it is not; delete it too), `:186`, `:236`
- Modify: `src/components/os/your-pages-page.tsx:112-134`, `:143`
- Modify: `src/components/os/site-health-page.tsx:133-155`, `:162`
- Test: `src/components/os/suggestion-card.test.tsx`

**Interfaces:**
- Consumes: `verbsFor` / `SuggestionVerb` (Task 2), `setRecommendationQueueState` (Task 3), `actionFor` from `@/lib/command-center`, `rejectChangeRequest` from `@/lib/change-requests.functions`, `regenerateTitleH1Proposal` from `@/lib/title-h1-proposals.functions`, `COMMAND_CENTER_QUERY_KEY` from `./command-center-facts`.
- Produces: `export function SuggestionCard({ item }: { item: QueueItem })`. Tasks 5 and 7 extend its verb wiring; the prop stays a single `item`.

- [ ] **Step 1: Write the failing test**

Create `src/components/os/suggestion-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildQueue, type QueueSource } from "@/lib/suggestion-queue";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
const useServerFn = vi.hoisted(() => vi.fn(() => vi.fn()));
vi.mock("@tanstack/react-start", () => ({ useServerFn }));

const { SuggestionCard } = await import("./suggestion-card");

const NOW = "2026-08-21T12:00:00.000Z";

function source(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): QueueSource {
  return {
    kind: "recommendation",
    categoryId: "search",
    title: "Title does not say Tulsa",
    targetUrl: "https://trumoveinc.com/corporate-relocation",
    storedState: "proposed",
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function show(overrides: Partial<QueueSource> & Pick<QueueSource, "id">) {
  const queue = buildQueue([source(overrides)], NOW);
  const item = [...queue.open, ...queue.ignored, ...queue.done][0];
  if (!item) throw new Error("the fixture produced no queue item");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SuggestionCard item={item} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useServerFn.mockClear();
});

describe("a card an operator can act on", () => {
  it("offers to set an open suggestion aside", () => {
    show({ id: "r1" });
    expect(screen.getByRole("button", { name: /Not now/ })).toBeEnabled();
  });

  it("offers to put an ignored suggestion back", () => {
    show({ id: "r1", storedState: "rejected" });
    expect(screen.getByRole("button", { name: /Put it back/ })).toBeEnabled();
  });

  it("keeps the review link that already existed", () => {
    show({ id: "r1" });
    expect(screen.getByRole("link", { name: /Review it/ })).toBeInTheDocument();
  });
});

describe("a verb that is not legal is absent, never disabled", () => {
  it("renders no set-aside control on a page check, which has nowhere to store it", () => {
    show({ id: "audit:missing_title", kind: "audit", severity: "critical" });
    expect(screen.queryByRole("button", { name: /Not now/ })).not.toBeInTheDocument();
  });

  it("renders no redraft control where no redraft path exists", () => {
    show({ id: "c1", kind: "change", proposalType: "page_metadata", storedState: "proposed" });
    expect(screen.queryByRole("button", { name: /Write it again/ })).not.toBeInTheDocument();
  });

  it("never renders a disabled control at rest", () => {
    show({ id: "r1" });
    for (const button of screen.queryAllByRole("button")) {
      expect(button).toBeEnabled();
    }
  });
});

describe("what a verb costs is on the verb", () => {
  it("says the redraft spends an AI call before it is clicked", () => {
    show({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" });
    expect(screen.getByRole("button", { name: /Write it again/ })).toHaveAccessibleDescription(
      /one AI call/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/os/suggestion-card.test.tsx`
Expected: FAIL — `Cannot find module './suggestion-card'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/os/suggestion-card.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId } from "react";
import { toast } from "sonner";

import { COMMAND_CENTER_QUERY_KEY } from "./command-center-facts";
import { actionFor } from "@/lib/command-center";
import { rejectChangeRequest } from "@/lib/change-requests.functions";
import { setRecommendationQueueState } from "@/lib/os-admin.functions";
import type { QueueItem, UrgencyTone } from "@/lib/suggestion-queue";
import { verbsFor, type SuggestionVerb } from "@/lib/suggestion-verbs";
import { regenerateTitleH1Proposal } from "@/lib/title-h1-proposals.functions";
import { cn } from "@/lib/utils";

/**
 * One suggestion, on every category page.
 *
 * The three pages held three copies of this row, each offering a single link
 * to somewhere else. The queue already worked out which verbs are legal for a
 * row; this card is where the operator finally gets them. A verb the queue
 * calls illegal is not rendered at all — a disabled control would tell the
 * operator the action exists and they are not allowed it, which is not what is
 * true. What is true is that there is nowhere for it to go yet.
 *
 * Nothing here approves anything. Approval lives on /changes/$id and stays
 * there; setting aside and putting back run nothing and cost nothing.
 */

const URGENCY_TONE: Record<UrgencyTone, string> = {
  danger: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

const LINK =
  "shrink-0 rounded-[10px] border border-input bg-secondary px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-border";

const VERB =
  "shrink-0 rounded-[10px] border border-input px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground";

export function SuggestionCard({ item }: { item: QueueItem }) {
  const action = actionFor(item);
  const verbs = verbsFor(item);
  const queryClient = useQueryClient();
  const setQueueState = useServerFn(setRecommendationQueueState);
  const rejectChange = useServerFn(rejectChangeRequest);
  const redraft = useServerFn(regenerateTitleH1Proposal);
  const describedBy = useId();

  const run = useMutation({
    mutationFn: async (verb: SuggestionVerb) => {
      if (verb.id === "regenerate") return redraft({ data: { id: item.id } });
      if (item.kind === "change") return rejectChange({ data: { id: item.id, notes: null } });
      return setQueueState({ data: { id: item.id, verb: verb.id } });
    },
    onSuccess: async (_result, verb) => {
      toast.success(
        verb.id === "regenerate"
          ? "New wording drafted. Open the fix to read it before approving."
          : verb.id === "ignore"
            ? "Set aside. You can put it back from the ignored list."
            : "Put back on your list.",
      );
      await queryClient.invalidateQueries({ queryKey: COMMAND_CENTER_QUERY_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-foreground">{item.title}</span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-subtle">
            <span className={URGENCY_TONE[item.tone]}>{item.urgencyLabel}</span>
            {item.targetUrl ? ` · ${item.targetUrl}` : null}
          </span>
        </span>
        {action.params ? (
          <Link to={action.to} params={action.params} className={LINK}>
            {action.label}
          </Link>
        ) : (
          <Link to={action.to} className={LINK}>
            {action.label}
          </Link>
        )}
      </div>
      {verbs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {verbs.map((verb) => (
            <span key={verb.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => run.mutate(verb)}
                disabled={run.isPending}
                aria-describedby={`${describedBy}-${verb.id}`}
                className={cn(VERB, verb.metered && "border-warning/50 text-warning")}
              >
                {run.isPending && run.variables?.id === verb.id ? "Working…" : verb.label}
              </button>
              <span
                id={`${describedBy}-${verb.id}`}
                className="text-[11px] leading-snug text-subtle"
              >
                {verb.consequence}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/os/suggestion-card.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Replace the three local rows**

In `src/components/os/getting-found-page.tsx`: delete the `SuggestionRow` function (lines 138-166) and the now-unused `URGENCY_TONE` const (lines 40-44) and the `UrgencyTone` type import (line 17 — keep `QueueItem` only if still referenced; it is not, so drop the whole `suggestion-queue` type import if `QueueItem` becomes unused). Add `import { SuggestionCard } from "./suggestion-card";` beside the other local imports. Replace `<SuggestionRow item={item} />` at line 186 and `<SuggestionRow key={item.id} item={item} />` at line 236 with `<SuggestionCard item={item} />` / `<SuggestionCard key={item.id} item={item} />`.

Do the same in `src/components/os/your-pages-page.tsx` (delete lines 112-134, replace the use at line 143) and `src/components/os/site-health-page.tsx` (delete lines 133-155, replace the use at line 162). In those two files `URGENCY_TONE` and `LINK` are also used by other components in the file — check each with `grep -n "URGENCY_TONE\|LINK" <file>` and delete only what is orphaned.

- [ ] **Step 6: Run the page tests**

Run: `bunx vitest run src/components/os/`
Expected: PASS. If a page test asserted on a row's markup, update the assertion to the card's markup — do not change what the test claims, only where it looks.

- [ ] **Step 7: Lint and commit**

```bash
bunx eslint src/components/os/suggestion-card.tsx src/components/os/suggestion-card.test.tsx src/components/os/getting-found-page.tsx src/components/os/your-pages-page.tsx src/components/os/site-health-page.tsx
git add src/components/os/
git commit -m "$(cat <<'EOF'
feat: put the queue's legal verbs on the suggestion card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 5: Somewhere to store an ignored page check

`canIgnoreSource` returns false for `kind: "audit"` because Phase 1 added no table (`src/lib/suggestion-queue.ts:12-14, 170-173`). Audit sources are synthesised each read with fingerprints `audit:<check>` and `site:<check>` (`src/lib/command-center.functions.ts:227-257`), so a fingerprint-keyed suppression row is enough to make an ignore stick and a restore undo it.

**Files:**
- Create: `supabase/migrations/20260821090000_suggestion_suppressions.sql`
- Create: `src/lib/suggestion-suppressions.functions.ts`
- Modify: `src/lib/suggestion-queue.ts:33-71` (type), `:170-173` (legality), and `queueStateFor` at `:92-98`
- Modify: `src/lib/command-center.functions.ts:227-271`
- Modify: `src/components/os/suggestion-card.tsx` (route the audit verbs)
- Test: `src/lib/suggestion-queue.test.ts`

**Interfaces:**
- Consumes: the `suppressed` field is read by `verbsFor` indirectly, through `canIgnore`/`canRestore`.
- Produces:
  - `QueueSource.suppressed?: boolean` — set when a stored suppression row matches the fingerprint.
  - `ignoreAuditFinding({ data: { fingerprint: string } })` and `restoreAuditFinding({ data: { fingerprint: string } })` in `src/lib/suggestion-suppressions.functions.ts`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/suggestion-queue.test.ts`:

```ts
describe("setting a page check aside, now that there is somewhere to store it", () => {
  it("offers to set a page check aside", () => {
    const queue = buildQueue(
      [source({ id: "audit:missing_title", kind: "audit", severity: "critical" })],
      NOW,
    );
    expect(queue.open[0]?.canIgnore).toBe(true);
  });

  it("moves a suppressed page check out of the open list and offers to put it back", () => {
    const queue = buildQueue(
      [
        source({
          id: "audit:missing_title",
          kind: "audit",
          severity: "critical",
          suppressed: true,
        }),
      ],
      NOW,
    );
    expect(queue.open).toHaveLength(0);
    expect(queue.ignored[0]?.canRestore).toBe(true);
    expect(queue.ignored[0]?.canIgnore).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/suggestion-queue.test.ts -t "setting a page check aside"`
Expected: FAIL — `suppressed` is not a `QueueSource` field, and `canIgnore` is `false`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260821090000_suggestion_suppressions.sql`:

```sql
-- An operator's decision to set a page check aside.
--
-- Page-audit findings are recomputed on every read rather than stored, so there
-- was no row to mark ignored and the queue reported the verb as unavailable.
-- One row per (tenant, fingerprint) is enough: the fingerprint the queue
-- already builds ("audit:<check>", "site:<check>") is stable across reads.
-- Restoring deletes the row, so nothing accumulates a second state to reason
-- about, and re-ignoring is an upsert on the same key.
CREATE TABLE public.suggestion_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  suppressed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fingerprint)
);

GRANT SELECT, INSERT, DELETE ON public.suggestion_suppressions TO authenticated;
GRANT ALL ON public.suggestion_suppressions TO service_role;
ALTER TABLE public.suggestion_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_read ON public.suggestion_suppressions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY ss_write ON public.suggestion_suppressions FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE INDEX idx_ss_tenant ON public.suggestion_suppressions (tenant_id);
```

- [ ] **Step 4: Make the queue read it**

In `src/lib/suggestion-queue.ts`, add to `QueueSource` beside `observationOnly`:

```ts
  /** Set when the operator stored a decision to keep this out of the open list. */
  readonly suppressed?: boolean;
```

In `queueStateFor` (line 92), add after the `linkedChangeId` guard:

```ts
  if (source.suppressed === true) return "ignored";
```

Replace `canIgnoreSource` and `canRestoreSource` bodies:

```ts
/**
 * A rejected change request is terminal, so restoring it is not offered, and
 * observed evidence was never a decision to reverse. A page check set aside is
 * one stored row, and deleting it puts the check straight back.
 */
function canRestoreSource(source: QueueSource): boolean {
  if (source.observationOnly === true) return false;
  if (source.kind === "audit") return source.suppressed === true;
  return source.kind !== "change";
}

/** Ignoring needs somewhere to store the suppression; `suggestion_suppressions` is it. */
function canIgnoreSource(source: QueueSource): boolean {
  if (source.observationOnly === true) return false;
  if (source.kind === "audit") return source.suppressed !== true;
  return true;
}
```

Update the module doc comment at lines 12-14 to say suppression is stored, not absent:

```ts
 * Ignoring a page-audit finding is stored in `suggestion_suppressions`, keyed
 * by the fingerprint the queue builds. Restoring a rejected change request
 * still has nowhere to go, so that verb still reports itself unavailable
 * rather than rendering a button that cannot work.
```

- [ ] **Step 5: Run the queue tests**

Run: `bunx vitest run src/lib/suggestion-queue.test.ts`
Expected: PASS, including the two new cases.

- [ ] **Step 6: Read suppressions in the facts loader**

In `src/lib/command-center.functions.ts`, after the `readPageAudit` call at line 152, add:

```ts
    const suppressionResult = await db
      .from("suggestion_suppressions")
      .select("fingerprint")
      .eq("tenant_id", tenantId);
    const suppressed = new Set(
      (assertRead("Ignored suggestions", suppressionResult).data ?? []).map(
        (row) => row.fingerprint,
      ),
    );
```

Then add `suppressed: suppressed.has(\`audit:${finding.check}\`)` inside the `auditSources` object literal (line 227) and `suppressed: suppressed.has(\`site:${finding.check}\`)` inside `siteSources` (line 245).

- [ ] **Step 7: Add the server functions**

Create `src/lib/suggestion-suppressions.functions.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Setting a page check aside, and putting it back.
 *
 * Page-audit findings are recomputed on every read, so there is no row to mark.
 * The fingerprint the queue builds is the key, and restoring deletes the row
 * rather than writing a second state. Neither call touches the site or spends
 * anything.
 */
const input = z.object({ fingerprint: z.string().min(1).max(200) });

export const ignoreAuditFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { error } = await context.supabase
      .from("suggestion_suppressions")
      .upsert(
        { tenant_id: tenantId, fingerprint: data.fingerprint, suppressed_by: context.userId },
        { onConflict: "tenant_id,fingerprint" },
      );
    if (error) throw new Error(`That check could not be set aside: ${error.message}`);
    return { fingerprint: data.fingerprint, suppressed: true };
  });

export const restoreAuditFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { assertOperator } = await import("./os-admin.server");
    const { requireTenantId } = await import("./tenant.server");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const { error } = await context.supabase
      .from("suggestion_suppressions")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("fingerprint", data.fingerprint);
    if (error) throw new Error(`That check could not be put back: ${error.message}`);
    return { fingerprint: data.fingerprint, suppressed: false };
  });
```

- [ ] **Step 8: Route the audit verbs on the card**

In `src/components/os/suggestion-card.tsx`, add the imports:

```tsx
import { ignoreAuditFinding, restoreAuditFinding } from "@/lib/suggestion-suppressions.functions";
```

add the two hooks beside the existing ones:

```tsx
  const ignoreAudit = useServerFn(ignoreAuditFinding);
  const restoreAudit = useServerFn(restoreAuditFinding);
```

and add one branch at the top of `run`'s `mutationFn`, before the `regenerate` branch:

```tsx
      if (item.kind === "audit") {
        const fingerprint = item.fingerprint ?? item.id;
        return verb.id === "ignore"
          ? ignoreAudit({ data: { fingerprint } })
          : restoreAudit({ data: { fingerprint } });
      }
```

- [ ] **Step 9: Extend the card test and run everything**

Replace the card test case `"renders no set-aside control on a page check, which has nowhere to store it"` with:

```tsx
  it("offers to set a page check aside, now that the decision is stored", () => {
    show({ id: "audit:missing_title", kind: "audit", severity: "critical" });
    expect(screen.getByRole("button", { name: /Not now/ })).toBeEnabled();
  });
```

Run: `bunx vitest run src/lib/ src/components/os/`
Expected: PASS.

- [ ] **Step 10: Lint and commit**

```bash
bunx eslint src/lib/suggestion-queue.ts src/lib/suggestion-suppressions.functions.ts src/lib/command-center.functions.ts src/components/os/suggestion-card.tsx src/lib/suggestion-queue.test.ts src/components/os/suggestion-card.test.tsx
git add supabase/migrations/20260821090000_suggestion_suppressions.sql src/lib/ src/components/os/
git commit -m "$(cat <<'EOF'
feat: store an ignored page check so the verb can be offered

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 6: Every suggested-action kind says on screen why it cannot be approved

`describeSuggestedAction` (`src/lib/recommendation-action.ts:37-92`) returns `executable: false` for every kind, so the Approve/Reject controls at `src/routes/recommendations.$id.tsx:90-107` can never render. That is the right call — none of these kinds has a handler — but the operator arrives at a page with no controls and no statement of why. The `summary` field already carries a reason for four kinds; it is rendered under "Suggested action" (`recommendations.$id.tsx:197`), far from where the buttons would have been.

Decision per kind, made from what the codebase supports today:

| Kind | Decision | Why |
|---|---|---|
| `review_competitor_evidence` | Stays non-executable; keeps its `/competitors` link | The real decision is on the candidate, in `competitors.functions.ts`. Approving here would record nothing. |
| `review_coverage_gap`, `review` | Stays non-executable | Pure observation drawn from stored SERP evidence. There is nothing to run. |
| `authorise_capability` | Stays non-executable | Authorisation is against a real connection in the Capability Registry; no handler is wired to this row. |
| `index_collection` | Stays non-executable | No connected handler exists for indexing a knowledge collection. |
| A rule finding (`action.rule` set) | **Gains a governed draft path**, not an approval | `proposeFixFromFinding` already drafts a change request and routes the operator to `/changes/$id`. Approval stays there. Wired in Task 7. |
| Anything else | Stays non-executable | Unknown kind; the honest answer is that nothing is connected. |

So no kind becomes approvable in this lane. What changes is that the refusal is stated where the buttons would be, in one sentence, rather than only in a panel below.

**Files:**
- Modify: `src/lib/recommendation-action.ts:9-17` (type), `:37-92` (each branch)
- Modify: `src/routes/recommendations.$id.tsx:65-107`
- Test: `src/lib/recommendation-action.test.ts` (create — no test file exists for this module)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SuggestedActionView` gains `readonly unavailableReason: string | null` — non-null exactly when `executable` is false. Task 7 adds `readonly draftableRule: string | null` to the same type.

- [ ] **Step 1: Write the failing test**

Create `src/lib/recommendation-action.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { describeSuggestedAction } from "./recommendation-action";

const KINDS = [
  "review_competitor_evidence",
  "review_coverage_gap",
  "review",
  "authorise_capability",
  "index_collection",
  "something_nobody_wired",
];

describe("a row that cannot be approved says so, in one sentence", () => {
  it.each(KINDS)("gives %s a reason the operator can read", (kind) => {
    const view = describeSuggestedAction({ kind });
    expect(view.executable).toBe(false);
    expect(view.unavailableReason).not.toBeNull();
    expect(view.unavailableReason?.length ?? 0).toBeGreaterThan(20);
  });

  it("never carries a reason without also refusing", () => {
    for (const kind of KINDS) {
      const view = describeSuggestedAction({ kind });
      expect(view.executable === false && view.unavailableReason !== null).toBe(true);
    }
  });

  it("keeps the competitor queue as the place the real decision is made", () => {
    const view = describeSuggestedAction({ kind: "review_competitor_evidence" });
    expect(view.link?.to).toBe("/competitors");
  });

  it("does not name a stored kind in the reason the operator reads", () => {
    for (const kind of KINDS) {
      expect(describeSuggestedAction({ kind }).unavailableReason).not.toContain(kind);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/recommendation-action.test.ts`
Expected: FAIL — `unavailableReason` does not exist on `SuggestedActionView`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/recommendation-action.ts`, add to `SuggestedActionView` (after `summary`, line 14):

```ts
  /**
   * Why approving is not offered, in the operator's words. Non-null exactly
   * when `executable` is false, so the surface can render the absence of a
   * button as a stated fact rather than an empty space.
   */
  unavailableReason: string | null;
```

Add `unavailableReason` to each of the five returns and the fallback:

```ts
// review_competitor_evidence
    unavailableReason:
      "There is nothing to approve here. The decision is made on the candidate itself, in the competitor queue.",
// review_coverage_gap / review
    unavailableReason:
      "There is nothing to approve here. This is a gap we spotted, recorded and dated so it stays visible.",
// authorise_capability
    unavailableReason:
      "Turning a capability on is done against the real connection, in the Capability Registry. Approving it here would record a decision that runs nothing.",
// index_collection
    unavailableReason:
      "Nothing is connected that could do this yet, so this row is a note rather than something you can set running.",
// fallback
    unavailableReason:
      "Nothing is connected that could carry this out, so there is no approval to give.",
```

In `src/routes/recommendations.$id.tsx`, render the reason where the buttons would be. Replace the `actions` fragment (lines 88-107) `canDecide ? (...) : null` tail with:

```tsx
            ) : action.unavailableReason && !data.changeRequest && !observation ? (
              <p className="max-w-sm text-xs leading-snug text-muted-foreground">
                {action.unavailableReason}
              </p>
            ) : null}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/lib/recommendation-action.test.ts && bunx tsc --noEmit`
Expected: tests PASS, 9 cases; typecheck clean for the touched files.

- [ ] **Step 5: Lint and commit**

```bash
bunx eslint src/lib/recommendation-action.ts src/lib/recommendation-action.test.ts "src/routes/recommendations.\$id.tsx"
git add src/lib/recommendation-action.ts src/lib/recommendation-action.test.ts "src/routes/recommendations.\$id.tsx"
git commit -m "$(cat <<'EOF'
feat: say why a suggestion cannot be approved, where the button would be

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

### Task 7: Draft the fix from the card, for every rule that has a governed fix

`proposeFixFromFinding` (`src/lib/search-findings.functions.ts:147`) is the one bridge from a finding to a governed change request, and it is reachable only from `/search/tools`. Two lists disagree about which rules it accepts: `finding-fix-target.ts:13-24` covers eight rules (four page-targeted, three query-targeted, plus `query_coverage_gap`), while `search.tools.tsx:237-244` hard-codes five. The three missing — `visibility_gain`, `zero_impression_page`, `index_coverage_drift` — are page-targeted rules that resolve to the existing title/H1 lane, so they need no new change kind. Make `finding-fix-target.ts` the single source, and put the verb on the card.

**Files:**
- Modify: `src/lib/finding-fix-target.ts:13-24, 36-38`
- Modify: `src/routes/search.tools.tsx:237-244, 695`
- Modify: `src/lib/suggestion-verbs.ts` (add the `draft` verb)
- Modify: `src/components/os/suggestion-card.tsx` (wire it)
- Test: `src/lib/finding-fix-target.test.ts`, `src/lib/suggestion-verbs.test.ts`, `src/components/os/suggestion-card.test.tsx`

**Interfaces:**
- Consumes: `verbsFor` (Task 2), `SuggestionCard` (Task 4), `QueueItem.rule` (already populated at `command-center.functions.ts:219`).
- Produces:
  - `export function hasGovernedFixPath(rule: string): boolean` in `finding-fix-target.ts`.
  - `SuggestionVerbId` gains `"draft"`; `verbsFor` returns it for an open recommendation whose `rule` has a governed fix path.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/finding-fix-target.test.ts`:

```ts
describe("which rules the governed fix path accepts", () => {
  it("accepts every rule deriveFixTarget can resolve", () => {
    for (const rule of [
      "weak_ctr_page",
      "visibility_gain",
      "zero_impression_page",
      "index_coverage_drift",
      "striking_distance_query",
      "position_loss",
      "possible_query_overlap",
      "query_coverage_gap",
    ]) {
      expect(hasGovernedFixPath(rule)).toBe(true);
    }
  });

  it("refuses a rule deriveFixTarget has no path for", () => {
    expect(hasGovernedFixPath("some_rule_nobody_wired")).toBe(false);
    expect(deriveFixTarget("some_rule_nobody_wired", "https://x.test/", []).ok).toBe(false);
  });
});
```

(Add `hasGovernedFixPath` to the existing import at the top of that file.)

Append to `src/lib/suggestion-verbs.test.ts`:

```ts
describe("drafting a fix straight from the card", () => {
  it("offers a draft on an open suggestion whose fix is governed", () => {
    expect(idsFor({ id: "r1", rule: "weak_ctr_page" })).toContain("draft");
  });

  it("offers no draft where no governed fix exists for the rule", () => {
    expect(idsFor({ id: "r1", rule: "some_rule_nobody_wired" })).not.toContain("draft");
    expect(idsFor({ id: "r1" })).not.toContain("draft");
  });

  it("offers no draft on a page check, which is not a rule finding", () => {
    expect(idsFor({ id: "audit:missing_title", kind: "audit", severity: "critical" })).not.toContain(
      "draft",
    );
  });

  it("names what the draft costs and where the approval still happens", () => {
    const queue = buildQueue([source({ id: "r1", rule: "weak_ctr_page" })], NOW);
    const draft = verbsFor(queue.open[0]!).find((verb) => verb.id === "draft");
    expect(draft?.metered).toBe(true);
    expect(draft?.consequence).toMatch(/approve/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/lib/finding-fix-target.test.ts src/lib/suggestion-verbs.test.ts`
Expected: FAIL — `hasGovernedFixPath` is not exported; `"draft"` is not a verb id.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/finding-fix-target.ts`, after `QUERY_TARGET_RULES` (line 24):

```ts
/**
 * Whether a rule finding has a governed lane that can draft its fix.
 *
 * The one answer to that question. A surface offering "Draft the fix" reads it
 * rather than keeping its own list — two lists is how a button appears for a
 * rule the server then refuses.
 */
export function hasGovernedFixPath(rule: string): boolean {
  return (
    rule === "query_coverage_gap" || PAGE_TARGET_RULES.has(rule) || QUERY_TARGET_RULES.has(rule)
  );
}
```

In `src/routes/search.tools.tsx`: delete `DRAFTABLE_RULES` (lines 237-244), add `hasGovernedFixPath` to the existing `@/lib/finding-fix-target` import (add the import line if the module is not yet imported there), and change line 695 from `DRAFTABLE_RULES.has(finding.rule)` to `hasGovernedFixPath(finding.rule)`.

In `src/lib/suggestion-verbs.ts`, add the import, extend the id union, add the verb, and add the branch:

```ts
import { hasGovernedFixPath } from "./finding-fix-target";

export type SuggestionVerbId = "ignore" | "restore" | "regenerate" | "draft";

const DRAFT: SuggestionVerb = {
  id: "draft",
  label: "Draft the fix",
  consequence:
    "Writes a proposed change for the page this points at. Costs one page read and one AI call. Nothing reaches the site until you approve it on the change itself.",
  metered: true,
};
```

and inside `verbsFor`, after the ignore branch:

```ts
  if (
    item.queueState === "open" &&
    item.kind === "recommendation" &&
    typeof item.rule === "string" &&
    hasGovernedFixPath(item.rule)
  ) {
    verbs.push(DRAFT);
  }
```

In `src/components/os/suggestion-card.tsx`, add:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { proposeFixFromFinding } from "@/lib/search-findings.functions";
```

```tsx
  const navigate = useNavigate();
  const draftFix = useServerFn(proposeFixFromFinding);
```

add a branch at the top of `run`'s `mutationFn`:

```tsx
      if (verb.id === "draft") {
        return draftFix({
          data: { recommendationId: item.id, idempotencyKey: crypto.randomUUID() },
        });
      }
```

and in `onSuccess`, before the toast, route the draft to the change it created:

```tsx
      if (verb.id === "draft") {
        const drafted = _result as { changeRequest: { id: string } };
        toast.success("Draft written. Read it before approving; nothing has changed on the site.");
        await navigate({ to: "/changes/$id", params: { id: drafted.changeRequest.id } });
        return;
      }
```

Add `useNavigate` to the router mock in `src/components/os/suggestion-card.test.tsx`:

```tsx
  useNavigate: () => vi.fn(),
```

- [ ] **Step 4: Add the card test and run everything**

Append to `src/components/os/suggestion-card.test.tsx`:

```tsx
describe("drafting the fix from the card", () => {
  it("offers the draft on a rule finding with a governed fix, with its cost stated", () => {
    show({ id: "r1", rule: "weak_ctr_page" });
    expect(screen.getByRole("button", { name: /Draft the fix/ })).toHaveAccessibleDescription(
      /one page read and one AI call/i,
    );
  });

  it("offers no draft where the rule has no governed fix", () => {
    show({ id: "r1", rule: "some_rule_nobody_wired" });
    expect(screen.queryByRole("button", { name: /Draft the fix/ })).not.toBeInTheDocument();
  });
});
```

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: the full suite PASSES and the typecheck reports no new errors. If a pre-existing failure appears, confirm it fails on `git stash`-free `origin/main` too before touching it — do not fix unrelated failures in this lane; report them.

- [ ] **Step 5: Lint and commit**

```bash
bunx eslint src/lib/finding-fix-target.ts src/lib/finding-fix-target.test.ts src/lib/suggestion-verbs.ts src/lib/suggestion-verbs.test.ts src/components/os/suggestion-card.tsx src/components/os/suggestion-card.test.tsx src/routes/search.tools.tsx
git add src/lib/ src/components/os/ src/routes/search.tools.tsx
git commit -m "$(cat <<'EOF'
feat: draft a governed fix from the suggestion card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
EOF
)"
```

---

## Verification, after the last task

- [ ] `bunx vitest run` — whole suite green.
- [ ] `bunx tsc --noEmit` — no new type errors.
- [ ] `bunx eslint` over every file this plan touched — clean.
- [ ] Read one category page in the running app and confirm by eye: an open suggestion shows "Not now"; an ignored one shows "Put it back"; a `page_metadata` change shows no redraft control at all rather than a greyed one; a rule finding shows "Draft the fix" with its cost in the description beside it.
- [ ] Confirm no approval control appeared anywhere outside `/changes/$id`.
