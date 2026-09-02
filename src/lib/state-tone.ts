/**
 * Which colour a stored state reads in. Lived in primitives.tsx, where a
 * non-component export costs every screen a full reload on hot refresh
 * (CQ-10); nothing about it needs React.
 */

export type Tone = "neutral" | "positive" | "warning" | "danger" | "primary";

export function toneForState(state: string | null | undefined): Tone {
  switch (state) {
    case "healthy":
    case "succeeded":
    case "active":
    case "real":
    case "approved":
    case "verified":
    case "applied":
      return "positive";
    case "degraded":
    case "awaiting_approval":
    case "pending":
    case "under_review":
    case "proposed":
    case "paused":
    case "simulated":
      return "warning";
    case "failing":
    case "failed":
    case "error":
    case "rejected":
    case "rolled_back":
      return "danger";
    case "running":
    case "scheduled":
      return "primary";
    default:
      return "neutral";
  }
}
