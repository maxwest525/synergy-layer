import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { GlassCard, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import {
  getSearchConsoleState,
  listSearchConsoleProperties,
  runSearchConsoleObservation,
  selectSearchConsoleProperty,
} from "@/lib/search-console.functions";

/**
 * Connection state, operator property selection, and recent snapshot history
 * for the read-only Search Console connector.
 */
export function SearchConsolePanel() {
  const queryClient = useQueryClient();
  const listProperties = useServerFn(listSearchConsoleProperties);
  const selectProperty = useServerFn(selectSearchConsoleProperty);
  const runObservation = useServerFn(runSearchConsoleObservation);

  const state = useQuery({
    queryKey: ["search-console", "state"],
    queryFn: () => getSearchConsoleState(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["search-console", "state"] });
  };

  const refresh = useMutation({
    mutationFn: () => listProperties({ data: undefined }),
    onSuccess: (result) => {
      toast.success(`Google reports ${result.properties.length} accessible properties.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const choose = useMutation({
    mutationFn: (siteUrl: string) => selectProperty({ data: { siteUrl } }),
    onSuccess: (result) => {
      toast.success(`Selected ${result.siteUrl}.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const observe = useMutation({
    mutationFn: () => runObservation({ data: undefined }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Observation failed.");
      } else if (result.rules?.noChange || result.emptyResult) {
        toast.success("Observation complete. Nothing new to raise.");
      } else {
        toast.success(
          `Observation complete for ${result.reportingDate}. ${result.rules?.recommendations ?? 0} new recommendations.`,
        );
      }
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const properties = state.data?.properties ?? [];
  const snapshots = state.data?.snapshots ?? [];
  const selected = properties.find((property) => property.selected);

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Connection</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Read only. AOOS can list properties, read finalized performance, and read sitemap status. It cannot
              change anything in Search Console.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? "Checking" : "Check access"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={observe.isPending || !selected}
              onClick={() => observe.mutate()}
            >
              {observe.isPending ? "Observing" : "Run observation"}
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected property</p>
          <p className="text-sm text-foreground">{selected?.site_url ?? "None selected yet."}</p>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Accessible properties</h2>
        {properties.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No properties recorded yet. Run a check to list what the connected Google account can reach.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {properties.map((property) => (
              <li
                key={property.site_url}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{property.site_url}</p>
                  <p className="text-xs text-muted-foreground">
                    Google reports {property.permission_level}
                    {property.eligible ? "" : " which cannot query performance data"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {property.selected ? <StatePill label="selected" tone={toneForState("active")} /> : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!property.eligible || property.selected || choose.isPending}
                    onClick={() => choose.mutate(property.site_url)}
                  >
                    Select
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Recent snapshots</h2>
        {snapshots.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No snapshots stored yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-foreground">
                  {snapshot.dimensions.length > 0 ? snapshot.dimensions.join(" + ") : "property totals"}
                </span>
                <span className="text-muted-foreground">
                  {snapshot.period_end_pt} Pacific · {snapshot.returned_row_count} rows ·{" "}
                  {formatWhen(snapshot.collected_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
