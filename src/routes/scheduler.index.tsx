import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { EmptyState, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { runSchedulerTick } from "@/lib/os-admin.functions";
import { getSchedules } from "@/lib/os.functions";

const schedulesQuery = { queryKey: ["schedules"], queryFn: () => getSchedules() };

export const Route = createFileRoute("/scheduler/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(schedulesQuery),
  head: () => ({
    meta: [
      { title: "Scheduler — AOOS" },
      {
        name: "description",
        content:
          "Dependency-aware scheduling: recurring work, chained workflows, next run times, and failure counts in one view.",
      },
      { property: "og:title", content: "Scheduler — AOOS" },
      { property: "og:description", content: "When work runs, and what it waits on." },
    ],
  }),
  component: SchedulerPage,
});

function SchedulerPage() {
  const { data } = useSuspenseQuery(schedulesQuery);
  const queryClient = useQueryClient();
  const tick = useServerFn(runSchedulerTick);

  const mutation = useMutation({
    mutationFn: () => tick({ data: undefined }),
    onSuccess: (result) => {
      toast.success(`${result.claimed} schedules ran, ${result.blocked} waiting on dependencies`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="When work runs"
        title="Scheduler"
        description="Recurring work with explicit dependencies, so chained workflows run in order instead of as isolated jobs."
        actions={
          <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Running tick" : "Run scheduler tick"}
          </Button>
        }
      />

      {data.schedules.length === 0 ? (
        <EmptyState title="No schedules" description="Create a schedule to run a workflow on a cadence." />
      ) : (
        <ul className="space-y-3">
          {data.schedules.map((schedule) => {
            const upstream = data.dependencies.filter((edge) => edge.schedule_id === schedule.id);
            return (
              <li key={schedule.id}>
                <Link to="/scheduler/$id" params={{ id: schedule.id }} className="block">
                  <GlassCard className="p-5 transition-colors hover:border-primary/40">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{schedule.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {schedule.cron} · {schedule.target_kind}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatePill label={schedule.enabled ? "enabled" : "paused"} tone={schedule.enabled ? "positive" : "warning"} />
                        {schedule.last_state ? (
                          <StatePill label={schedule.last_state} tone={toneForState(schedule.last_state)} />
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Next {formatWhen(schedule.next_run_at)}</span>
                      <span>Last {formatWhen(schedule.last_run_at)}</span>
                      <span>{schedule.failure_count} consecutive failures</span>
                      {upstream.length > 0 ? (
                        <StatePill label={`${upstream.length} dependencies`} tone="primary" />
                      ) : null}
                    </div>
                  </GlassCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
