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
