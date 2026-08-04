import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { EmptyState, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { getWorkflows } from "@/lib/os.functions";

const workflowsQuery = { queryKey: ["workflows"], queryFn: () => getWorkflows() };

export const Route = createFileRoute("/workflows/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(workflowsQuery),
  head: () => ({
    meta: [
      { title: "Workflow Registry — AOOS" },
      {
        name: "description",
        content: "Declarative workflows with full run history, step-level state, durations, and failure reasons.",
      },
      { property: "og:title", content: "Workflow Registry — AOOS" },
      { property: "og:description", content: "How work runs, and what happened on every run." },
    ],
  }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const { data } = useSuspenseQuery(workflowsQuery);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="How work runs"
        title="Workflow Registry"
        description="Each workflow is a declarative graph. Execution and observability come first: every run records step state, duration, and error."
      />

      {data.workflows.length === 0 ? (
        <EmptyState title="No workflows" description="Declare a workflow in a module, then sync the registry." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.workflows.map((workflow) => {
            const runs = data.runs.filter((run) => run.workflow_id === workflow.id);
            const latest = runs[0];
            return (
              <Link key={workflow.id} to="/workflows/$id" params={{ id: workflow.id }} className="block">
                <GlassCard className="h-full p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{workflow.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{workflow.key}</p>
                    </div>
                    <StatePill label={workflow.health} tone={toneForState(workflow.health)} />
                  </div>
                  {workflow.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{workflow.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatePill label={`trigger: ${workflow.trigger_kind}`} />
                    {latest ? <StatePill label={latest.state} tone={toneForState(latest.state)} /> : null}
                    <span className="text-xs text-muted-foreground">
                      {runs.length} recent runs · last {formatWhen(latest?.created_at ?? null)}
                    </span>
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
