import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { OperatorRouteError } from "@/components/os/route-error";
import {
  BackLink,
  DetailRow,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { getSchedule } from "@/lib/os.functions";

const scheduleQuery = (id: string) => ({
  queryKey: ["schedule", id],
  queryFn: () => getSchedule({ data: { id } }),
});

export const Route = createFileRoute("/scheduler/$id")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(scheduleQuery(params.id));
    if (!data.schedule) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.schedule
      ? `${loaderData.schedule.name} — Scheduler — Marky`
      : "Schedule — Marky";
    const description =
      loaderData?.schedule?.description ?? "Schedule cadence, dependencies, and last outcome.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData?.schedule ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  errorComponent: OperatorRouteError,
  component: ScheduleDetailPage,
});

function ScheduleDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(scheduleQuery(id));
  const schedule = data.schedule!;

  return (
    <div className="space-y-10">
      <BackLink to="/scheduler">Full schedule</BackLink>
      <PageHeader
        eyebrow="Schedule"
        title={schedule.name}
        description={schedule.description ?? "No description recorded for this schedule."}
        actions={<StatePill label={schedule.health} tone={toneForState(schedule.health)} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Cadence</h2>
          <dl className="mt-3">
            <DetailRow label="Cron" value={schedule.cron} />
            <DetailRow label="Target" value={`${schedule.target_kind}`} />
            <DetailRow label="Enabled" value={schedule.enabled ? "Yes" : "No"} />
            <DetailRow label="Next run" value={formatWhen(schedule.next_run_at)} />
            <DetailRow label="Last run" value={formatWhen(schedule.last_run_at)} />
            <DetailRow
              label="Last state"
              value={
                schedule.last_state ? (
                  <StatePill label={schedule.last_state} tone={toneForState(schedule.last_state)} />
                ) : (
                  "Never run"
                )
              }
            />
            <DetailRow
              label="Last duration"
              value={schedule.last_duration_ms ? `${schedule.last_duration_ms} ms` : "—"}
            />
            <DetailRow label="Consecutive failures" value={schedule.failure_count} />
          </dl>
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Waits on</h2>
          {data.dependencies.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No dependencies. This schedule runs on its cadence alone.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.dependencies.map((dependency) =>
                dependency.schedules ? (
                  <li
                    key={dependency.depends_on_schedule_id}
                    className="flex items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/scheduler/$id"
                        params={{ id: dependency.schedules.id }}
                        className="truncate text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {dependency.schedules.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {dependency.condition.replace(/_/g, " ")}
                      </p>
                    </div>
                    {dependency.schedules.last_state ? (
                      <StatePill
                        label={dependency.schedules.last_state}
                        tone={toneForState(dependency.schedules.last_state)}
                      />
                    ) : (
                      <StatePill label="never run" />
                    )}
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Firings</h2>
        {data.runs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No firing recorded yet. One row is kept per firing from 2026-09-02; earlier firings left
            only the last state above.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.runs.map((run) => (
              <li
                key={run.id}
                className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{formatWhen(run.fired_at)}</p>
                  <p className="text-xs text-muted-foreground">
                    {run.fired_by === "pg_cron"
                      ? "Fired by the database schedule"
                      : "Run by an operator"}
                    {run.duration_ms !== null ? ` · ${run.duration_ms} ms` : ""}
                  </p>
                  {run.error ? (
                    <p className="mt-1 text-xs text-foreground/80">{run.error}</p>
                  ) : null}
                </div>
                <StatePill label={run.state} tone={toneForState(run.state)} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <Link to="/scheduler" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to scheduler
      </Link>
    </div>
  );
}
