/**
 * Lifecycle rules for a concrete asset change request.
 *
 * The whole point of this model is that approval is not application and
 * application is not verification. Those distinctions are enforced here, in one
 * pure module, so the server and the operator UI can never disagree about what
 * a state means or which control is legitimate.
 */

export const CHANGE_STATES = [
  "proposed",
  "approved",
  "applied",
  "verified",
  "rejected",
  "rolled_back",
] as const;

export type ChangeState = (typeof CHANGE_STATES)[number];

export type ChangeAction = "approve" | "reject" | "mark_applied" | "verify" | "roll_back";

/** Terminal state each action moves the request into. */
export const ACTION_RESULT: Record<ChangeAction, ChangeState> = {
  approve: "approved",
  reject: "rejected",
  mark_applied: "applied",
  verify: "verified",
  roll_back: "rolled_back",
};

const ALLOWED: Record<ChangeState, ChangeAction[]> = {
  proposed: ["approve", "reject"],
  approved: ["mark_applied"],
  applied: ["verify", "roll_back"],
  verified: ["roll_back"],
  rejected: [],
  rolled_back: [],
};

export function isChangeState(value: unknown): value is ChangeState {
  return typeof value === "string" && (CHANGE_STATES as readonly string[]).includes(value);
}

export function canTransition(from: ChangeState, action: ChangeAction): boolean {
  return ALLOWED[from].includes(action);
}

export type TransitionDecision =
  | { kind: "apply"; to: ChangeState }
  /** Same action, same result: replaying a click must not log or write twice. */
  | { kind: "noop"; to: ChangeState }
  | { kind: "invalid"; reason: string };

export function decideTransition(from: ChangeState, action: ChangeAction): TransitionDecision {
  const to = ACTION_RESULT[action];
  if (from === to) return { kind: "noop", to };
  if (canTransition(from, action)) return { kind: "apply", to };
  return {
    kind: "invalid",
    reason: `A change request that is ${humanState(from)} cannot be ${pastTense(action)}.`,
  };
}

export function humanState(state: ChangeState): string {
  if (state === "applied") return "applied, verification pending";
  if (state === "rolled_back") return "rolled back";
  return state;
}

function pastTense(action: ChangeAction): string {
  switch (action) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "mark_applied":
      return "marked applied";
    case "verify":
      return "verified";
    default:
      return "rolled back";
  }
}

/**
 * Recommendation enum values that map honestly onto a change state. Anything
 * without a truthful counterpart is left alone rather than forced.
 */
export function recommendationStateFor(state: ChangeState): string | null {
  switch (state) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "applied":
      return "applied";
    case "verified":
      return "verified";
    case "rolled_back":
      return "rolled_back";
    default:
      return null;
  }
}

export type OutcomeView = {
  /** True while there is no finalized post-change Search Console data yet. */
  waiting: boolean;
  message: string;
};

export function describeOutcome(input: {
  state: ChangeState;
  appliedAt: string | null;
  postChangeRows: unknown[];
}): OutcomeView {
  if (input.appliedAt === null) {
    return {
      waiting: true,
      message:
        "Nothing has been applied yet, so there is no post-change data to read. The baseline rows above are the only evidence on file.",
    };
  }
  if (input.postChangeRows.length === 0) {
    return {
      waiting: true,
      message:
        "Waiting for finalized post-change Search Console data. No data is not evidence of success.",
    };
  }
  return {
    waiting: false,
    message: "Post-change Search Console rows for this page are shown below, next to the baseline.",
  };
}
