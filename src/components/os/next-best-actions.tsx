import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { LoopStrip } from "@/components/os/loop-strip";
import { NextActionLane } from "@/components/os/next-action-lane";
import { GlassCard, formatWhen } from "@/components/os/primitives";
import { WhatsMissing } from "@/components/os/whats-missing";
import { Button } from "@/components/ui/button";
import { buildLoopStates } from "@/lib/loop-state";
import { buildMissingReasons, buildNextActions, type NextAction } from "@/lib/next-actions";
import { getNextActionFacts, prioritizeNextActions } from "@/lib/next-actions.functions";
import { TAXONOMY_GROUPS } from "@/lib/os-taxonomy";

/**
 * The dynamic half of Marketing essentials: what to do next, why the empty
 * lists are empty, and how each taxonomy loop is turning. Every card is
 * generated from stored rows, and the optional agent pass may only reorder and
 * reword what the rules already produced.
 */
export function NextBestActions({ tenantId }: { tenantId: string | null }) {
  const loadFacts = useServerFn(getNextActionFacts);
  const prioritize = useServerFn(prioritizeNextActions);

  const { data: facts } = useSuspenseQuery({
    queryKey: ["next-action-facts", tenantId],
    queryFn: () => loadFacts(),
    retry: false,
  });

  const actions = useMemo(() => buildNextActions(facts), [facts]);
  const missing = useMemo(() => buildMissingReasons(facts), [facts]);
  const loops = useMemo(() => buildLoopStates(facts), [facts]);

  const rerank = useMutation({
    mutationFn: () => prioritize({ data: { actions } }),
  });

  const ordered: NextAction[] = useMemo(() => {
    const result = rerank.data;
    if (!result) return actions;
    const byId = new Map(actions.map((action) => [action.id, action]));
    const rewritten = new Map(result.rewritten.map((entry) => [entry.id, entry.reason]));
    return result.orderedIds
      .map((id) => byId.get(id))
      .filter((action): action is NextAction => Boolean(action))
      .map((action) => {
        const reason = rewritten.get(action.id);
        return reason ? { ...action, reason } : action;
      });
  }, [actions, rerank.data]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            The optimization loops
          </h2>
          <p className="text-xs text-muted-foreground">
            Evidence becomes a decision, a decision becomes work, work is measured, and the loop
            runs again.
          </p>
        </div>
        <div className="grid gap-4">
          {loops.map((loop) => (
            <LoopStrip key={loop.group.key} loop={loop} />
          ))}
        </div>
      </section>

      <WhatsMissing missing={missing} loops={loops} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Next best actions
            </h2>
            <p className="mt-1 max-w-[70ch] text-xs text-muted-foreground">
              Generated from the same stored rows the rest of this page reads, grouped the way the
              rest of the OS is grouped. Nothing here runs on its own.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={rerank.isPending || actions.length === 0}
            onClick={() => rerank.mutate()}
          >
            {rerank.isPending ? "Asking the agent" : "Let the agent prioritise"}
          </Button>
        </div>

        {rerank.data ? (
          <GlassCard className="p-4">
            <p className="text-sm text-foreground/80">{rerank.data.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Agent ordering applied {formatWhen(rerank.data.decidedAt)}. The agent could only
              reorder and reword the actions above, never add one.
            </p>
          </GlassCard>
        ) : null}
        {rerank.isError ? (
          <p className="text-sm text-destructive">
            The agent could not be reached, so the order from stored evidence is still shown.
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          {TAXONOMY_GROUPS.map((group) => (
            <NextActionLane
              key={group.key}
              group={group}
              actions={ordered.filter((action) => action.group === group.key)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
