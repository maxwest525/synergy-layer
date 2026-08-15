import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  EmptyState,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { getWorkflows } from "@/lib/os.functions";

const workflowsQuery = { queryKey: ["workflows"], queryFn: () => getWorkflows() };

export const Route = createFileRoute("/workflows/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: ({ context }) => {
    // Warm the cache without blocking navigation; the suspense boundary
    // renders the pending surface immediately.
    void context.queryClient.prefetchQuery(workflowsQuery);
  },
  head: () => ({
    meta: [
      { title: "Workflow Registry — AOOS" },
      {
        name: "description",
        content:
          "Declarative workflows with full run history, step-level state, durations, and failure reasons.",
      },
      { property: "og:title", content: "Workflow Registry — AOOS" },
      { property: "og:description", content: "How work runs, and what happened on every run." },
    ],
  }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const { data } = useSuspenseQuery(workflowsQuery);
  const failedRuns = data.runs.filter((run) => run.state === "failed");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="How work runs"
        title="Workflow Registry"
        description="Each workflow is a declarative graph. Execution and observability come first: every run records step state, duration, and error."
      />

      {failedRuns.length > 0 ? (
        <section id="failed-runs" className="scroll-mt-24 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Failed runs ({failedRuns.length})
          </h2>
          <GlassCard className="p-5">
            <ul className="space-y-3">
              {failedRuns.map((run) => {
                const workflow = data.workflows.find((item) => item.id === run.workflow_id);
                const label = workflow?.name ?? workflow?.key ?? "Unknown workflow";
                return (
                  <li
                    key={run.id}
                    className="space-y-1 border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {run.workflow_id ? (
                        <Link
                          to="/workflows/$id"
                          params={{ id: run.workflow_id }}
                          className="truncate text-sm text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="truncate text-sm text-foreground">{label}</span>
                      )}
                      <span className="flex flex-wrap items-center gap-3">
                        <StatePill label={run.state} tone={toneForState(run.state)} />
                        <span className="text-xs text-muted-foreground">
                          {formatWhen(run.created_at)}
                        </span>
                        {run.duration_ms !== null && run.duration_ms !== undefined ? (
                          <span className="text-xs text-muted-foreground">
                            {run.duration_ms} ms
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground">{run.trigger_source}</span>
                      </span>
                    </div>
                    <p className="text-xs text-destructive">
                      {run.error ?? "No stored error message."}
                    </p>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        </section>
      ) : null}

      {data.workflows.length === 0 ? (
        <EmptyState
          title="No workflows"
          description="Declare a workflow in a module, then sync the registry."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.workflows.map((workflow) => {
            const runs = data.runs.filter((run) => run.workflow_id === workflow.id);
            const latest = runs[0];
            return (
              <Link
                key={workflow.id}
                to="/workflows/$id"
                params={{ id: workflow.id }}
                className="block"
              >
                <GlassCard className="h-full p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {workflow.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{workflow.key}</p>
                    </div>
                    <StatePill label={workflow.health} tone={toneForState(workflow.health)} />
                  </div>
                  {workflow.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {workflow.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatePill label={`trigger: ${workflow.trigger_kind}`} />
                    {latest ? (
                      <StatePill label={latest.state} tone={toneForState(latest.state)} />
                    ) : null}
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
