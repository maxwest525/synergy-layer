import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { GlassCard, StatePill, formatWhen } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { getObservationCadences, setObservationCadence } from "@/lib/observation-cadence.functions";
import { formatDuration, type CadenceStatus } from "@/lib/observation-cadence";

function Fact({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-xs leading-relaxed ${
          tone === "danger" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CadenceCard({
  cadence,
  isOperator,
  onToggle,
  pending,
}: {
  cadence: CadenceStatus;
  isOperator: boolean;
  onToggle: (enabled: boolean) => void;
  pending: boolean;
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{cadence.label}</h3>
        <span className="flex items-center gap-2">
          <StatePill label={cadence.stateLabel} tone={cadence.tone} />
          <StatePill label={`${cadence.storedRowCount} stored`} tone="neutral" />
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cadence.instruction}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Fact label="Last run" value={formatWhen(cadence.lastRunAt)} />
        <Fact label="Duration" value={formatDuration(cadence.lastDurationMs)} />
        <Fact
          label="Rows returned"
          value={
            cadence.lastRunRowCount === null ? "Not recorded" : `${cadence.lastRunRowCount} row(s)`
          }
        />
        <Fact
          label="Last error"
          value={cadence.lastError ? cadence.lastError : "None recorded"}
          {...(cadence.lastError ? { tone: "danger" as const } : {})}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Schedule <span className="text-foreground">{cadence.cron ?? "not set"}</span>
        {" · "}Next run {formatWhen(cadence.nextRunAt)}
        {" · "}Newest stored row {formatWhen(cadence.lastStoredAt)}
      </p>

      <div className="mt-4">
        {cadence.action === "prove" ? (
          <Button asChild variant="outline" size="sm">
            <Link to={cadence.proveHref}>{cadence.actionLabel}</Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!isOperator || pending}
            onClick={() => onToggle(cadence.action === "enable")}
          >
            {pending ? "Saving..." : cadence.actionLabel}
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

/** Read-only cadences for GA4, Umami, PageSpeed, and Search Console. */
export function ObservationCadences() {
  const load = useServerFn(getObservationCadences);
  const save = useServerFn(setObservationCadence);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["observation-cadences"],
    queryFn: () => load(),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (input: { source: CadenceStatus["key"]; enabled: boolean }) =>
      save({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.enabled
          ? "Daily cadence turned on. The next run will store a snapshot."
          : "Daily cadence turned off. Nothing runs on its own now.",
      );
      void queryClient.invalidateQueries({ queryKey: ["observation-cadences"] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Observation cadences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only daily reads. A cadence stays off until the source has stored its first real row,
          so nothing schedules itself on an unproven connection.
        </p>
      </div>

      {error ? (
        <GlassCard className="p-5">
          <p className="text-sm text-destructive">
            Could not read the cadences: {(error as Error).message}
          </p>
        </GlassCard>
      ) : isLoading || !data ? (
        <GlassCard className="p-5">
          <p className="text-sm text-muted-foreground">Reading cadence state...</p>
        </GlassCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.cadences.map((cadence) => (
            <CadenceCard
              key={cadence.key}
              cadence={cadence}
              isOperator={data.isOperator}
              pending={mutation.isPending && mutation.variables?.source === cadence.key}
              onToggle={(enabled) => mutation.mutate({ source: cadence.key, enabled })}
            />
          ))}
        </div>
      )}
    </section>
  );
}
