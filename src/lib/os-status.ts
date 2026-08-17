/**
 * One status vocabulary for the whole OS. Every surface that reports whether
 * something is real derives its label here, so "configured" can never be
 * displayed as "working" and an empty screen can never look broken.
 */
export type OsStatusKey = "working" | "unproven" | "broken" | "unmeasurable";

export type OsStatus = {
  key: OsStatusKey;
  label: string;
  /** One plain sentence a non-operator can read. */
  meaning: string;
  /** Tailwind classes for the badge, semantic tokens only. */
  tone: string;
};

export const OS_STATUSES: Record<OsStatusKey, OsStatus> = {
  working: {
    key: "working",
    label: "Working",
    meaning: "A real authenticated read stored evidence recently.",
    tone: "border-primary/40 text-primary",
  },
  unproven: {
    key: "unproven",
    label: "Set up, never proven",
    meaning: "Credentials exist but no successful read has been stored yet.",
    tone: "border-amber-500/40 text-amber-400",
  },
  broken: {
    key: "broken",
    label: "Broken",
    meaning: "A real attempt failed. The reason and last attempt are recorded.",
    tone: "border-destructive/50 text-destructive",
  },
  unmeasurable: {
    key: "unmeasurable",
    label: "Cannot measure yet",
    meaning: "Nothing in the platform can observe this yet.",
    tone: "border-border text-muted-foreground",
  },
};

export type StatusInput = {
  /** Whether any credential or configuration is recorded. */
  configured: boolean;
  /** Count of stored evidence rows produced by real reads. */
  storedEvidence: number;
  /** A recorded failure reason from the last real attempt, if any. */
  lastFailure?: string | null;
  /** True when no capability exists to observe this at all. */
  capabilityMissing?: boolean;
};

/**
 * Derives status from stored facts only. Nothing here is typed by hand, so a
 * screen cannot claim a provider works because someone said so.
 */
export function deriveStatus(input: StatusInput): OsStatus {
  if (input.capabilityMissing) return OS_STATUSES.unmeasurable;
  if (input.storedEvidence > 0 && !input.lastFailure) return OS_STATUSES.working;
  if (input.lastFailure) return OS_STATUSES.broken;
  if (input.configured) return OS_STATUSES.unproven;
  return OS_STATUSES.unmeasurable;
}

/** What an operator should do next when a surface is empty. */
export function emptyStateCopy(status: OsStatus, runLabel?: string): string {
  switch (status.key) {
    case "working":
      return "Nothing stored for this window yet. The next scheduled run will fill it.";
    case "unproven":
      return runLabel
        ? `Credentials are recorded but nothing has been read yet. Run ${runLabel} to prove it.`
        : "Credentials are recorded but nothing has been read yet.";
    case "broken":
      return "The last real attempt failed, so this is empty on purpose rather than showing a guess.";
    case "unmeasurable":
    default:
      return "Nothing in the platform can observe this yet, so it stays blank instead of showing a zero.";
  }
}
