import { Link } from "@tanstack/react-router";

import { GlassCard, StatePill } from "@/components/os/primitives";
import type { LoopState } from "@/lib/loop-state";
import { cn } from "@/lib/utils";

/**
 * One optimization loop, drawn as its stages in order. The stage with nothing
 * in it is highlighted, so an operator can see exactly where the loop stops
 * turning instead of reading five separate screens.
 */
export function LoopStrip({ loop }: { loop: LoopState }) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{loop.group.label} loop</h3>
          <p className="mt-1 max-w-[70ch] text-xs text-muted-foreground">
            {loop.group.definition} {loop.group.nextStage}
          </p>
        </div>
        <StatePill
          label={loop.stalledStageKey ? "Stalled" : "Turning"}
          tone={loop.stalledStageKey ? "warning" : "success"}
        />
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {loop.stages.map((stage, index) => {
          const stalled = stage.key === loop.stalledStageKey;
          const gap = loop.gapStageKeys.includes(stage.key);
          return (
            <li key={stage.key} className="relative">
              <Link
                to={stage.to}
                className={cn(
                  "flex h-full flex-col rounded-xl border px-3 py-2.5 transition-colors",
                  stalled
                    ? "border-amber-500/50 bg-amber-500/5"
                    : gap
                      ? "border-border/80 border-dashed hover:border-primary/40 hover:bg-primary/5"
                      : "border-border/60 hover:border-primary/40 hover:bg-primary/5",
                )}
              >
                <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                  Step {index + 1}
                </span>
                <span className="mt-1 text-lg font-semibold text-foreground">{stage.count}</span>
                <span className="text-xs text-muted-foreground">{stage.unit}</span>
                <span className="mt-1 text-xs text-foreground/80">{stage.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      {loop.stallReason ? (
        <p className="mt-3 text-sm text-foreground/80">{loop.stallReason}</p>
      ) : loop.gapStageKeys.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {gapSentence(loop)} The loop still turns; the gap is listed under What is missing.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Every stage of this loop has stored activity, so evidence is reaching decisions and work.
        </p>
      )}
    </GlassCard>
  );
}

/** Names the empty-but-passed stages so a zero beside filled stages is explained, not alarming. */
function gapSentence(loop: LoopState): string {
  const labels = loop.stages
    .filter((stage) => loop.gapStageKeys.includes(stage.key))
    .map((stage) => `"${stage.label}"`);
  const list =
    labels.length <= 1
      ? (labels[0] ?? "")
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${list} ${labels.length === 1 ? "holds" : "hold"} nothing right now, while later stages carry stored work from other evidence.`;
}
