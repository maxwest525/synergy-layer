import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { DetailRow, EmptyState, GlassCard, MetricTile, StatePill, formatWhen } from "./primitives";
import { Button } from "@/components/ui/button";
import { getUmamiState, refreshUmami, type UmamiSnapshotView } from "@/lib/umami.functions";

function findSnapshot(rows: UmamiSnapshotView[], metric: string): UmamiSnapshotView | null {
  return rows.find((row) => row.metric === metric) ?? null;
}

function count(value: number | undefined): string {
  return value === undefined ? "not returned" : value.toLocaleString();
}

/**
 * Traffic evidence from the operator's self-hosted Umami. Every number shown
 * came out of a stored snapshot, and the source is named so it is never read
 * as GA4.
 */
export function UmamiPanel() {
  const loadState = useServerFn(getUmamiState);
  const refresh = useServerFn(refreshUmami);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["umami-state"],
    queryFn: () => loadState(),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => refresh({ data: { days: 28 } }),
    onSuccess: (result) =>
      toast.success(
        `Umami read stored: ${result.written} new snapshot(s), ${result.unchanged} unchanged, for ${result.websiteName}.`,
      ),
    onError: (mutationError: Error) => toast.error(mutationError.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["umami-state"] });
    },
  });

  if (isLoading) {
    return (
      <GlassCard className="p-5">
        <p className="text-sm text-muted-foreground">Reading stored traffic evidence.</p>
      </GlassCard>
    );
  }

  if (error || !data) {
    return (
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Traffic (Umami)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The stored traffic evidence could not be read: {error?.message ?? "unknown error"}.
        </p>
      </GlassCard>
    );
  }

  const stats = findSnapshot(data.snapshots, "stats");
  const pages = findSnapshot(data.snapshots, "pages");
  const referrers = findSnapshot(data.snapshots, "referrers");
  const lastRun = data.runs[0] ?? null;

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Traffic (self-hosted Umami)</h2>
        <span className="flex items-center gap-2">
          <StatePill
            label={data.connected ? "Connected" : data.configured ? "Configured" : "Not configured"}
            tone={data.connected ? "success" : data.configured ? "warning" : "neutral"}
          />
          <StatePill label="Provider cost $0" tone="success" />
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Cookieless traffic counted by your own Umami instance. These are Umami numbers, not GA4
        numbers, and a failed read is recorded as a failure rather than as zero traffic.
      </p>

      {data.requirements.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {data.requirements.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {data.isOperator ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!data.configured || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Reading Umami" : "Read the last 28 days"}
          </Button>
          {lastRun ? (
            <span className="text-xs text-muted-foreground">
              Last run {lastRun.status} at {formatWhen(lastRun.startedAt)}
              {lastRun.error ? `: ${lastRun.error}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {stats ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label="Pageviews" value={count(stats.totals["pageviews"]?.value)} />
            <MetricTile label="Visitors" value={count(stats.totals["visitors"]?.value)} />
            <MetricTile label="Visits" value={count(stats.totals["visits"]?.value)} />
            <MetricTile label="Bounces" value={count(stats.totals["bounces"]?.value)} />
          </div>
          <div className="mt-4 space-y-2">
            <DetailRow label="Property" value={stats.websiteName ?? stats.websiteId} />
            <DetailRow
              label="Window"
              value={`${formatWhen(stats.periodStart)} to ${formatWhen(stats.periodEnd)}`}
            />
            <DetailRow label="Collected" value={formatWhen(stats.collectedAt)} />
          </div>
        </>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="No traffic snapshot stored yet"
            description="Nothing is claimed about traffic until one authenticated read of your Umami instance succeeds and stores a snapshot."
          />
        </div>
      )}

      {pages && pages.rows.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Top pages</h3>
          <ul className="mt-2 space-y-1">
            {pages.rows.slice(0, 8).map((row) => (
              <li key={row.label} className="flex justify-between gap-4 text-sm">
                <span className="truncate text-foreground">{row.label}</span>
                <span className="text-muted-foreground">{row.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {referrers && referrers.rows.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Referrers</h3>
          <ul className="mt-2 space-y-1">
            {referrers.rows.slice(0, 8).map((row) => (
              <li key={row.label} className="flex justify-between gap-4 text-sm">
                <span className="truncate text-foreground">{row.label || "direct"}</span>
                <span className="text-muted-foreground">{row.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </GlassCard>
  );
}
