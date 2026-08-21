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
