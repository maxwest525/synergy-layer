/**
 * Keyboard stepping for the suggestion queue.
 *
 * The spec asks for `j` / `k` to step, Enter to approve and `i` to ignore. That
 * is a real interaction with real edge cases: stepping past either end, acting
 * when nothing is selected, and never stealing a keystroke the operator meant
 * for a text field.
 *
 * The decision is pure so it can be tested exhaustively; the component only has
 * to dispatch it.
 */

export type QueueKeyAction =
  | { readonly kind: "select"; readonly index: number }
  | { readonly kind: "approve"; readonly index: number }
  | { readonly kind: "ignore"; readonly index: number }
  | null;

export type QueueKeyState = {
  /** How many cards are on screen. */
  readonly count: number;
  /** The selected card, or null when none is. */
  readonly selected: number | null;
  /** True when the operator is typing, so the queue must not take the key. */
  readonly typing: boolean;
};

/**
 * What a keystroke should do, or null when it should be left alone.
 *
 * Returning null rather than a no-op action matters: the component uses it to
 * decide whether to call `preventDefault`, so keys this queue does not own keep
 * working normally.
 */
export function queueKeyAction(key: string, state: QueueKeyState): QueueKeyAction {
  if (state.typing || state.count === 0) return null;

  if (key === "j" || key === "ArrowDown") {
    const next = state.selected === null ? 0 : Math.min(state.selected + 1, state.count - 1);
    return { kind: "select", index: next };
  }

  if (key === "k" || key === "ArrowUp") {
    const next = state.selected === null ? 0 : Math.max(state.selected - 1, 0);
    return { kind: "select", index: next };
  }

  // Acting needs something to act on. Enter with nothing selected is a no-op
  // rather than an approval of the first card, which would be a real accident.
  if (state.selected === null) return null;

  if (key === "Enter") return { kind: "approve", index: state.selected };
  if (key === "i") return { kind: "ignore", index: state.selected };

  return null;
}
