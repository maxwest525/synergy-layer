import type { OutcomeVerdict } from "@/lib/outcome-verdict";

/**
 * The one place a stored verdict becomes operator words, shared by Site health
 * and the change detail page so the same verdict can never read differently on
 * two screens. Plain words, not the stored enum: the operator never sees
 * "too_early".
 */
export const VERDICT_LABEL: Record<OutcomeVerdict, string> = {
  success: "It worked",
  neutral: "No change yet",
  failure: "It did not work",
  not_yet: "Not yet",
  too_early: "Too early to say",
  unmeasurable: "Cannot be measured",
};

export const VERDICT_TONE: Record<OutcomeVerdict, string> = {
  success: "text-primary",
  neutral: "text-info",
  failure: "text-destructive",
  not_yet: "text-muted-foreground",
  too_early: "text-muted-foreground",
  unmeasurable: "text-muted-foreground",
};
