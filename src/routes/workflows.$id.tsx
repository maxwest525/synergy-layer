import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  BackLink,
  DetailRow,
  EmptyNote,
  GlassCard,
  PageHeader,
  StatePill,
  toneForState,
} from "@/components/os/primitives";
import {
  ApprovalGateCard,
  humanize,
  kindLabels,
  findActiveRun,
  RunControlCard,
  RunHistoryTimeline,
  StepDetailPanel,
  type CapabilityMeta,
  type Graph,
  type GraphNode,
  type Run,
  type RunStep,
} from "@/components/os/workflow-detail";
import { Button } from "@/components/ui/button";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { getOperatorAccess } from "@/lib/auth.functions";
import {
  advanceWorkflowRun,
  cancelWorkflowRun,
  runWorkflowNow,
  startWorkflowRun,
} from "@/lib/os-admin.functions";
import { getCapabilities, getWorkflow } from "@/lib/os.functions";

const workflowQuery = (id: string) => ({
  queryKey: ["workflow", id],
  queryFn: () => getWorkflow({ data: { id } }),
});

function StepRef({ node }: { node: GraphNode }) {
  if (!node.ref) return null;
  const label = humanize(node.ref);
  const className =
    "text-xs text-primary underline-offset-4 hover:underline focus-visible:underline";

  if (node.kind === "capability") {
    return (
      <Link to="/capabilities/$id" params={{ id: node.ref }} className={className}>
        {label}
      </Link>
    );
  }
  if (node.kind === "agent") {
    return (
      <Link to="/agents" className={className}>
        {label}
      </Link>
    );
  }
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

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
  const startRunFn = useServerFn(startWorkflowRun);
  const advanceRunFn = useServerFn(advanceWorkflowRun);
  const cancelRunFn = useServerFn(cancelWorkflowRun);
  const listCapabilities = useServerFn(getCapabilities);
  const readAccess = useServerFn(getOperatorAccess);
  const session = useOperatorSession();
  const workflow = data.workflow!;
  const graph = (workflow.graph ?? {}) as Graph;
  const runs = data.runs as unknown as Run[];

  const capabilitiesQuery = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => listCapabilities(),
    enabled: session.signedIn,
  });
  const accessQuery = useQuery({
    queryKey: ["operator-access"],
    queryFn: () => readAccess(),
    enabled: session.signedIn,
  });

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedNode = (graph.nodes ?? []).find((node) => node.key === selectedKey) ?? null;

  const latestStepFor = useMemo(() => {
    const map = new Map<string, RunStep>();
    // Runs arrive newest first, so the first sighting of a node is its latest run.
    runs.forEach((run) =>
      run.workflow_steps.forEach((step) => {
        if (!map.has(step.node_key)) map.set(step.node_key, step);
      }),
    );
    return map;
  }, [runs]);

  const [inspectedStep, setInspectedStep] = useState<RunStep | null>(null);
  const panelStep =
    inspectedStep ?? (selectedKey ? (latestStepFor.get(selectedKey) ?? null) : null);

  const capability = useMemo(() => {
    if (!selectedNode?.ref || selectedNode.kind !== "capability") return null;
    const rows = (capabilitiesQuery.data ?? []) as unknown as CapabilityMeta[];
    return rows.find((row) => row.key === selectedNode.ref) ?? null;
  }, [capabilitiesQuery.data, selectedNode]);

  const mutation = useMutation({
    mutationFn: () => runNow({ data: { workflowId: id } }),
    onSuccess: (result) => {
      toast.success(`Run ${result.state.replace("_", " ")}`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canApprove = accessQuery.data?.canOperate ?? false;
  const activeRun = findActiveRun(runs);

  const invalidate = () => queryClient.invalidateQueries();
  const startRunMutation = useMutation({
    mutationFn: () => startRunFn({ data: { workflowId: id } }),
    onSuccess: () => {
      toast.success("Run created and parked before step 1");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const advanceMutation = useMutation({
    mutationFn: (runId: string) => advanceRunFn({ data: { runId } }),
    onSuccess: (result) => {
      toast.success(
        result.stepState === "failed"
          ? `Step failed: ${humanize(result.stepKey ?? "step")}`
          : `Step done: ${humanize(result.stepKey ?? "step")}`,
      );
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cancelMutation = useMutation({
    mutationFn: (runId: string) => cancelRunFn({ data: { runId } }),
    onSuccess: () => {
      toast.success("Run cancelled");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const controlsBusy =
    startRunMutation.isPending || advanceMutation.isPending || cancelMutation.isPending;

  const openStep = (step: RunStep) => {
    setSelectedKey(step.node_key);
    setInspectedStep(step);
  };

  return (
    <div className="space-y-10">
      <BackLink to="/workflows">All workflows</BackLink>
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
              {mutation.isPending ? "Running" : "Run reading steps now"}
            </Button>
          </>
        }
      />

      <RunControlCard
        run={activeRun}
        graph={graph}
        canOperate={canApprove}
        busy={controlsBusy}
        onStart={() => startRunMutation.mutate()}
        onAdvance={() => activeRun && advanceMutation.mutate(activeRun.id)}
        onCancel={() => activeRun && cancelMutation.mutate(activeRun.id)}
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

          <h3 className="mt-5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            How this workflow runs
          </h3>
          {(graph.nodes ?? []).length === 0 ? (
            <EmptyNote className="mt-2">No steps are declared for this workflow.</EmptyNote>
          ) : (
            <ol className="relative mt-3 space-y-3 pl-7">
              <span
                aria-hidden
                className="absolute left-[13px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/40 via-border to-transparent"
              />
              {(graph.nodes ?? []).map((node, index) => (
                <li key={node.key} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-7 top-3 flex size-[26px] items-center justify-center rounded-full border border-primary/40 bg-background text-[11px] text-primary"
                  >
                    {index + 1}
                  </span>
                  <div className="rounded-xl border border-border/60 bg-background/30 transition-colors hover:border-primary/40">
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedStep(null);
                        setSelectedKey(node.key);
                      }}
                      className="w-full px-3 py-2.5 text-left"
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-foreground">{humanize(node.key)}</span>
                        <StatePill
                          label={kindLabels[node.kind] ?? humanize(node.kind)}
                          tone={node.kind === "approval" ? "warning" : "primary"}
                        />
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Open step details
                      </span>
                    </button>
                    {node.ref ? (
                      <p className="px-3 pb-2.5 text-xs text-muted-foreground">
                        Runs <StepRef node={node} />
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </GlassCard>

        <RunHistoryTimeline runs={runs} onInspectStep={openStep} />
      </div>

      <ApprovalGateCard
        graph={graph}
        runs={runs}
        operatorEmail={session.email}
        canApprove={canApprove}
      />

      <StepDetailPanel
        node={selectedNode}
        step={panelStep}
        capability={capability}
        graph={graph}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedKey(null);
            setInspectedStep(null);
          }
        }}
      />

      <Link to="/workflows" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to workflows
      </Link>
    </div>
  );
}
