import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { GlassCard, StatePill } from "@/components/os/primitives";
import type { LoopState } from "@/lib/loop-state";
import type { MissingReason } from "@/lib/next-actions";
import { TAXONOMY_GROUPS } from "@/lib/os-taxonomy";

/**
 * Why the screens are empty. Every line names a stored reason, so a zero is
 * never presented as a measurement and an empty list never looks like a bug.
 */
export function WhatsMissing({ missing, loops }: { missing: MissingReason[]; loops: LoopState[] }) {
  const stalled = loops.filter((loop) => loop.stalledStageKey).length;

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">What is missing</h2>
        <StatePill
          label={stalled > 0 ? `${stalled} of ${loops.length} loops stalled` : "All loops turning"}
          tone={stalled > 0 ? "warning" : "success"}
        />
      </div>
      <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">
        Each line is an instruction: what is missing, the stored reason it is missing, and the one
        step that fixes it. Nothing here is an estimate.
      </p>

      {missing.length === 0 ? (
        <p className="mt-4 text-sm text-foreground/80">
          Nothing is missing. Every list on this screen is backed by stored rows.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {TAXONOMY_GROUPS.map((group) => {
            const items = missing.filter((entry) => entry.group === group.key);
            if (items.length === 0) return null;
            const loop = loops.find((entry) => entry.group.key === group.key) ?? null;
            return (
              <div key={group.key} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  {loop?.stalledStageKey ? (
                    <span className="text-xs text-amber-400">
                      loop stalls at{" "}
                      {loop.stages.find((stage) => stage.key === loop.stalledStageKey)?.label}
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-2">
                  {items.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-border/60 bg-background/30 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {entry.label} <span className="text-muted-foreground">&mdash;</span>{" "}
                            <span className="text-primary">{entry.instruction}</span>
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">{entry.reason}</p>
                        </div>
                        <Link
                          to={entry.to}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          {entry.actionLabel}
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
