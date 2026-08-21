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

import { hasGovernedFixPath } from "./finding-fix-target";
import type { QueueItem } from "./suggestion-queue";

export type SuggestionVerbId = "ignore" | "restore" | "regenerate" | "draft";

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

/**
 * A change request's "ignore" is `rejectChangeRequest`, which is terminal
 * (see change-request-state.ts: `rejected` has no exits). The reversible
 * IGNORE copy would promise a restore that does not exist, so a change item
 * gets its own honest label and consequence instead.
 */
const REJECT_CHANGE: SuggestionVerb = {
  id: "ignore",
  label: "Reject",
  consequence: "Rejects this change. This cannot be undone — a new draft would have to be written.",
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

const DRAFT: SuggestionVerb = {
  id: "draft",
  label: "Draft the fix",
  consequence:
    "Writes a proposed change for the page this points at. Costs one page read and one AI call. Nothing reaches the site until you approve it on the change itself.",
  metered: true,
};

/**
 * A done row is finished, so it carries no verbs: the decision was made and
 * neither ignoring nor redrafting it means anything.
 */
export function verbsFor(item: QueueItem): readonly SuggestionVerb[] {
  if (item.queueState === "done") return [];

  const verbs: SuggestionVerb[] = [];
  if (item.queueState === "open" && item.canIgnore) {
    verbs.push(item.kind === "change" ? REJECT_CHANGE : IGNORE);
  }
  if (item.queueState === "ignored" && item.canRestore) verbs.push(RESTORE);
  if (item.canRegenerate) verbs.push(REGENERATE);
  if (
    item.queueState === "open" &&
    item.kind === "recommendation" &&
    typeof item.rule === "string" &&
    hasGovernedFixPath(item.rule)
  ) {
    verbs.push(DRAFT);
  }
  return verbs;
}
