import type { OutcomeVerdict } from "@/lib/outcome-verdict";
import { cn } from "@/lib/utils";
import { confidenceWords } from "@/lib/verdict-confidence-words";
import { VERDICT_LABEL, VERDICT_TONE } from "./verdict-copy";

export type VerdictReading = {
  windowDays: number;
  verdict: OutcomeVerdict;
  reason: string;
  /** Present on count-based verdicts; a 0.4 and a 0.9 must not read the same. */
  confidence?: { value: number; band: string } | null;
};

/**
 * The measurement system's own grading of a change, rendered wherever the
 * operator is about to judge it themselves: the change detail page and the
 * execution card's verify step. It informs the decision and never makes it.
 * The verify gate stays what it is (finalized post-change Search Console
 * rows); this is context, per the outcome-measurement contract.
 */
export function OutcomeVerdictContext({ verdicts }: { verdicts: readonly VerdictReading[] }) {
  if (verdicts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reading for this change has been graded yet, so the measurement system offers no verdict.
        Grading happens once an evidence window closes with a complete reading.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        What the stored measurements say. Verifying stays your judgment; this grading is the context
        for it, not a gate.
      </p>
      <ul className="space-y-2">
        {verdicts.map((reading) => (
          <li key={reading.windowDays} className="text-sm">
            <span
              className={cn(
                "text-[10.5px] font-bold uppercase tracking-[0.1em]",
                VERDICT_TONE[reading.verdict],
              )}
            >
              {VERDICT_LABEL[reading.verdict]}
            </span>
            <span className="ml-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-subtle">
              {reading.windowDays} day reading
            </span>
            <span className="block text-muted-foreground">{reading.reason}</span>
            {confidenceWords(reading.confidence) ? (
              <span className="block text-subtle">{confidenceWords(reading.confidence)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
