import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  DetailRow,
  EmptyNote,
  formatWhen,
  GlassCard,
  PageHeader,
  StatePill,
  toneForState,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { runWorkflowNow } from "@/lib/os-admin.functions";
import { getWorkflow } from "@/lib/os.functions";

const workflowQuery = (id: string) => ({
  queryKey: ["workflow", id],
  queryFn: () => getWorkflow({ data: { id } }),
});

type Graph = {
  nodes?: { key: string; kind: string; ref?: string }[];
  edges?: { from: string; to: string }[];
};

export const Route = createFileRoute("/workflows/$id")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(workflowQuery(params.id));
    if (!data.workflow) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.workflow
      ? `${loaderData.workflow.name} — Workflows — AOOS`
      : "Workflow — AOOS";
    const description = loaderData?.workflow?.description ?? "Workflow definition and run history.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData?.workflow ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: WorkflowDetailPage,
});

function WorkflowDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(workflowQuery(id));
  const queryClient = useQueryClient();
  const runNow = useServerFn(runWorkflowNow);
  const workflow = data.workflow!;
  const graph = (workflow.graph ?? {}) as Graph;

  const mutation = useMutation({
    mutationFn: () => runNow({ data: { workflowId: id } }),
    onSuccess: (result) => {
      toast.success(`Run ${result.state.replace("_", " ")}`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Workflow"
        title={workflow.name}
        description={workflow.description ?? "No description recorded for this workflow."}
        actions={
          <>
            <StatePill label={workflow.health} tone={toneForState(workflow.health)} />
            <Button
              variant="outline"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Running" : "Run now"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Definition</h2>
          <dl className="mt-3">
            <DetailRow label="Key" value={workflow.key} />
            <DetailRow label="Trigger" value={workflow.trigger_kind} />
            <DetailRow label="Version" value={workflow.version} />
            <DetailRow
              label="Status"
              value={<StatePill label={workflow.status} tone={toneForState(workflow.status)} />}
            />
          </dl>

          <h3 className="mt-5 text-xs uppercase tracking-[0.14em] text-muted-foreground">Steps</h3>
          <ol className="mt-2 space-y-2">
            {(graph.nodes ?? []).map((node, index) => (
              <li
                key={node.key}
                className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">{index + 1}</span>
                <span className="flex-1 text-sm text-foreground">{node.key}</span>
                <StatePill
                  label={node.kind}
                  tone={node.kind === "approval" ? "warning" : "primary"}
                />
                {node.ref ? (
                  <span className="text-xs text-muted-foreground">{node.ref}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Run history</h2>
          {data.runs.length === 0 ? (
            <EmptyNote className="mt-2">No runs recorded yet.</EmptyNote>
          ) : (
            <ul className="mt-3 space-y-4">
              {data.runs.map((run) => (
                <li
                  key={run.id}
                  className="border-b border-border/50 pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatePill label={run.state} tone={toneForState(run.state)} />
                    <span className="text-xs text-muted-foreground">
                      {formatWhen(run.created_at)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {run.duration_ms ? `${run.duration_ms} ms` : "in progress"} ·{" "}
                      {run.trigger_source}
                    </span>
                  </div>
                  {run.error ? <p className="mt-1 text-sm text-destructive">{run.error}</p> : null}
                  <ul className="mt-2 space-y-1">
                    {[...run.workflow_steps]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((step) => (
                        <li
                          key={step.id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="truncate text-muted-foreground">
                            {step.sequence + 1}. {step.node_key}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {step.duration_ms ? `${step.duration_ms} ms` : "—"}
                            </span>
                            <StatePill label={step.state} tone={toneForState(step.state)} />
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <Link to="/workflows" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to workflows
      </Link>
    </div>
  );
}
