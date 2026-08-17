import { Link } from "@tanstack/react-router";

import { GlassCard, StatePill } from "@/components/os/primitives";
import type { NextAction } from "@/lib/next-actions";
import type { TaxonomyGroup } from "@/lib/os-taxonomy";

const ACTION_CLASS =
  "inline-flex items-center rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10";

/**
 * One taxonomy lane of generated next best actions. Every card links to the
 * workspace that resolves it, so nothing on the screen is a dead end.
 */
export function NextActionLane({
  group,
  actions,
}: {
  group: TaxonomyGroup;
  actions: NextAction[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{group.label}</h3>
        <p className="text-xs text-muted-foreground">{group.definition}</p>
      </div>

      {actions.length === 0 ? (
        <GlassCard className="p-4">
          <p className="text-sm text-muted-foreground">
            Nothing in this group needs you right now. {group.nextStage}
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <GlassCard key={action.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">{action.title}</h4>
                {action.blockedBy ? <StatePill label="Blocked" tone="warning" /> : null}
              </div>
              <p className="mt-1.5 max-w-[70ch] text-sm text-muted-foreground">{action.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">Evidence: {action.evidence}</p>
              {action.blockedBy ? (
                <p className="mt-1 text-xs text-amber-400">Blocked by: {action.blockedBy}</p>
              ) : null}
              <div className="mt-3">
                <Link to={action.to} className={ACTION_CLASS}>
                  {action.actionLabel}
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </section>
  );
}
