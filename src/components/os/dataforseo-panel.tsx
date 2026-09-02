import { useQuery } from "@tanstack/react-query";

import {
  CardGridSkeleton,
  EmptyNote,
  EmptyState,
  GlassCard,
  ListSkeleton,
  MetricTile,
  StatePill,
} from "@/components/os/primitives";
import { formatWhen } from "@/lib/format-when";
import { toneForState } from "@/lib/state-tone";
import { getDataForSeoState } from "@/lib/dataforseo.functions";

function usd(value: number | string | null | undefined): string {
  const numeric = typeof value === "string" ? Number(value) : (value ?? 0);
  return `$${numeric.toFixed(4)}`;
}

/**
 * Governance surface for the DataForSEO provider: budget headroom, the
 * per-request cost ledger, and the immutable snapshots those requests wrote.
 */
export function DataForSeoPanel() {
  const { data, isPending, error } = useQuery({
    queryKey: ["dataforseo-state"],
    queryFn: () => getDataForSeoState(),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <CardGridSkeleton columns={4} count={4} label="Loading DataForSEO spend" />
        <GlassCard className="p-5">
          <ListSkeleton rows={4} label="Loading provider request ledger" />
        </GlassCard>
      </div>
    );
  }

  if (error || !data) {
    return (
      <GlassCard className="p-5">
        <EmptyState
          title="DataForSEO state unavailable"
          description="Sign in as an operator to read the provider budget and request ledger."
        />
      </GlassCard>
    );
  }

  const remaining = data.budget.ceilingUsd - data.budget.spentUsd;
  const usedShare = data.budget.ceilingUsd > 0 ? data.budget.spentUsd / data.budget.ceilingUsd : 0;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Budget, {data.budget.periodMonth}
          </h2>
          <StatePill
            label={data.budget.hardStop ? "hard stop armed" : "hard stop off"}
            tone={data.budget.hardStop ? "positive" : "warning"}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <MetricTile label="Ceiling" value={`$${data.budget.ceilingUsd.toFixed(2)}`} />
          <MetricTile label="Spent" value={`$${data.budget.spentUsd.toFixed(4)}`} />
          <MetricTile label="Remaining" value={`$${remaining.toFixed(2)}`} />
          <MetricTile label="Used" value={`${(usedShare * 100).toFixed(2)}%`} />
        </div>
        {data.pendingKeywordCandidates > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {data.pendingKeywordCandidates} keyword candidates are waiting for operator approval.
            SERP observation stays idle until at least one is approved.
          </p>
        ) : null}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Request ledger</h2>
        {data.requests.length === 0 ? (
          <EmptyNote className="mt-2">No provider requests recorded yet.</EmptyNote>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2 text-sm last:border-b-0 last:pb-0"
              >
                <span className="font-mono text-xs text-muted-foreground">{request.endpoint}</span>
                <span className="flex items-center gap-3">
                  <StatePill label={request.outcome} tone={toneForState(request.outcome)} />
                  <span className="text-muted-foreground">{request.returned_row_count} rows</span>
                  <span className="text-foreground">{usd(request.cost_usd)}</span>
                  <span className="text-muted-foreground">{formatWhen(request.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Immutable snapshots</h2>
        {data.snapshots.length === 0 ? (
          <EmptyNote className="mt-2">No snapshots stored yet.</EmptyNote>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2 text-sm last:border-b-0 last:pb-0"
              >
                <span className="text-foreground">{snapshot.kind}</span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  <span className="font-mono text-xs">{snapshot.target}</span>
                  <span>{snapshot.returned_row_count} rows</span>
                  <span>{usd(snapshot.provider_cost_usd)}</span>
                  <span>{formatWhen(snapshot.collected_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
